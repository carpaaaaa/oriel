#!/usr/bin/env node
// Made-up browser profiles for the data module's tests (studio/05 §1, §8):
// the Windows layout under AppData\Local and AppData\Roaming, the Mac's under
// Library/Application Support, with the files those browsers really write:
// Bookmarks and Local State (JSON), History and Login Data (SQLite, v10
// passwords sealed with AES-256-GCM, v20 ones that only their browser opens),
// Firefox's places.sqlite, logins.json and a key4.db made the way NSS makes it.
//
//   node test/fixtures/data/make.mjs <home> > answers.json
//
// The key a Chromium browser keeps in Local State is sealed by DPAPI on
// Windows (CryptProtectData through koffi); elsewhere it carries a test mark
// that only a test world opens.
// Prints what the tests should find, as JSON.

import { DatabaseSync } from 'node:sqlite'
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

const require = createRequire(import.meta.url)

const home = process.argv[2]
if (!home) { console.error('usage: make.mjs <home>'); process.exit(2) }
const local = path.join(home, 'AppData', 'Local')
const roaming = path.join(home, 'AppData', 'Roaming')
const mac = path.join(home, 'Library', 'Application Support')

const dir = (...p) => { const d = path.join(...p); mkdirSync(d, { recursive: true }); return d }
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 1))
const now = Date.now()
const chromiumTime = ms => Math.round((ms + 11_644_473_600_000) * 1000)
const days = n => now - n * 86_400_000

// Chromium

/** Sealed for this user by DPAPI (CryptProtectData through koffi, as the
 * browser does) on Windows; elsewhere a test world's stand-in. */
let protectAPI = null
function dpapi(key) {
  if (process.platform === 'win32') {
    if (!protectAPI) {
      // Declared once: koffi keeps type names for the whole process.
      const koffi = require('koffi')
      const crypt32 = koffi.load('crypt32.dll'), kernel32 = koffi.load('kernel32.dll')
      const BLOB = koffi.struct('FIXTURE_DATA_BLOB', { cbData: 'uint32_t', pbData: 'void *' })
      protectAPI = {
        koffi,
        protect: crypt32.func('__stdcall', 'CryptProtectData', 'bool',
          [koffi.pointer(BLOB), 'str16', koffi.pointer(BLOB), 'void *', 'void *', 'uint32_t', koffi.out(koffi.pointer(BLOB))]),
        free: kernel32.func('__stdcall', 'LocalFree', 'void *', ['void *']),
      }
    }
    const { koffi, protect, free } = protectAPI
    const out = { cbData: 0, pbData: null }
    if (!protect({ cbData: key.length, pbData: key }, null, null, null, null, 1 /* UI forbidden */, out)) throw new Error('CryptProtectData failed')
    try { return Buffer.from(koffi.decode(out.pbData, 'uint8_t', out.cbData)) } finally { free(out.pbData) }
  }
  return Buffer.concat([Buffer.from('SEARCHTESTDPAPI:'), key])
}

function localState(root, key, extra = {}) {
  json(path.join(root, 'Local State'), {
    os_crypt: {
      encrypted_key: Buffer.concat([Buffer.from('DPAPI'), dpapi(key)]).toString('base64'),
      app_bound_encrypted_key: Buffer.concat([Buffer.from('APPB'), randomBytes(48)]).toString('base64'),
    },
    ...extra,
  })
}

function v10(key, password, hashed = false) {
  const nonce = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, nonce)
  const plain = hashed ? Buffer.concat([randomBytes(32), Buffer.from(password)]) : Buffer.from(password)
  const body = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([Buffer.from('v10'), nonce, body, c.getAuthTag()])
}
const v20 = () => Buffer.concat([Buffer.from('v20'), randomBytes(60)])

function bookmarks(file, bar, other = [], synced = []) {
  let id = 10
  const node = n => n.children
    ? { id: String(id++), type: 'folder', name: n.name, children: n.children.map(node) }
    : { id: String(id++), type: 'url', name: n.name, url: n.url }
  json(file, { version: 1, roots: {
    bookmark_bar: { id: '1', type: 'folder', name: 'Bookmarks bar', children: bar.map(node) },
    other: { id: '2', type: 'folder', name: 'Other bookmarks', children: other.map(node) },
    synced: { id: '3', type: 'folder', name: 'Mobile bookmarks', children: synced.map(node) },
  } })
}

function history(file, rows) {
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE urls(id INTEGER PRIMARY KEY AUTOINCREMENT, url LONGVARCHAR, title LONGVARCHAR,
    visit_count INTEGER DEFAULT 0 NOT NULL, typed_count INTEGER DEFAULT 0 NOT NULL, last_visit_time INTEGER NOT NULL, hidden INTEGER DEFAULT 0 NOT NULL)`)
  const put = db.prepare('INSERT INTO urls(url, title, visit_count, last_visit_time, hidden) VALUES (?, ?, ?, ?, ?)')
  for (const r of rows) put.run(r.url, r.title ?? '', r.count ?? 1, chromiumTime(r.at ?? now), r.hidden ? 1 : 0)
  db.close()
}

function logins(file, rows) {
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE logins(origin_url VARCHAR NOT NULL, action_url VARCHAR, username_element VARCHAR, username_value VARCHAR,
    password_element VARCHAR, password_value BLOB, signon_realm VARCHAR NOT NULL, date_created INTEGER NOT NULL,
    blacklisted_by_user INTEGER NOT NULL, scheme INTEGER NOT NULL, date_last_used INTEGER NOT NULL DEFAULT 0)`)
  const put = db.prepare(`INSERT INTO logins(origin_url, username_value, password_value, signon_realm, date_created, blacklisted_by_user, scheme, date_last_used)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
  for (const r of rows) put.run(r.origin, r.user ?? '', r.blob ?? Buffer.alloc(0), r.origin, chromiumTime(now), r.never ? 1 : 0, r.used ? chromiumTime(r.used) : 0)
  db.close()
}

// Chrome on Windows: two profiles, the second used last; v10 and v20 mixed.
const chromeKey = randomBytes(32)
const chrome = dir(local, 'Google', 'Chrome', 'User Data')
localState(chrome, chromeKey, { profile: { info_cache: { Default: { name: 'Person 1' }, 'Profile 1': { name: 'Work' } }, last_used: 'Profile 1' } })
const chromeDefault = dir(chrome, 'Default'), chromeWork = dir(chrome, 'Profile 1')
dir(chrome, 'Guest Profile')
bookmarks(path.join(chromeDefault, 'Bookmarks'), [{ name: 'Personal Mail', url: 'https://mail.personal.example/' }])
history(path.join(chromeDefault, 'History'), [{ url: 'https://personal.example/', title: 'Personal', count: 2 }])
logins(path.join(chromeDefault, 'Login Data'), [{ origin: 'https://personal.example/login', user: 'me@personal.example', blob: v10(chromeKey, 'personal-pass') }])
json(path.join(chromeDefault, 'Preferences'), { extensions: { settings: {
  cjpalhdlnbpafiamejdnhcphjbkeiagm: { location: 1, from_webstore: true, manifest: { name: 'uBlock Origin', update_url: 'https://clients2.google.com/service/update2/crx' } },
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: { location: 5, was_installed_by_default: true, manifest: { name: 'Built in' } },
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: { location: 1, from_webstore: true, manifest: { name: 'A theme', theme: {} } },
  cccccccccccccccccccccccccccccccc: { location: 1, manifest: { name: 'From Edge', update_url: 'https://edge.microsoft.com/extensionwebstorebase/v1/crx' } },
} } })
json(path.join(chromeDefault, 'Secure Preferences'), { extensions: { settings: {
  nngceckbapebfimnlniiiahkandclblb: { location: 1, from_webstore: true, manifest: { name: 'Bitwarden', update_url: 'https://clients2.google.com/service/update2/crx' } },
} } })
bookmarks(path.join(chromeWork, 'Bookmarks'),
  [{ name: 'Work Wiki', url: 'https://wiki.work.example/' }, { name: 'Tools', children: [{ name: 'CI', url: 'https://ci.work.example/' }, { name: 'Bookmarklet', url: 'javascript:alert(1)' }] }],
  [{ name: 'Later', url: 'https://later.example/read' }],
  [{ name: 'Phone', url: 'https://phone.example/' }])
history(path.join(chromeWork, 'History'), [
  { url: 'https://wiki.work.example/', title: 'Work Wiki', count: 30, at: days(1) },
  { url: 'https://ci.work.example/build/42', title: 'Build 42', count: 3, at: days(2) },
  { url: 'https://hidden.work.example/', title: 'Hidden', count: 9, hidden: true },
  { url: 'chrome://settings/', title: 'Settings', count: 4 },
  { url: 'https://never-visited.work.example/', title: 'Typed only', count: 0 },
])
logins(path.join(chromeWork, 'Login Data'), [
  { origin: 'https://login.work.example/', user: 'alice', blob: v10(chromeKey, 'work-pass-1'), used: days(3) },
  { origin: 'http://intranet.work.example/', user: 'alice', blob: v10(chromeKey, 'intranet-pass') },
  { origin: 'https://bound.work.example/', user: 'bob', blob: v20() },
  { origin: 'https://bound2.work.example/', user: 'carol', blob: v20() },
  { origin: 'https://ads.example/', never: true },
  { origin: 'android://hash@com.example.app/', user: 'droid', blob: v10(chromeKey, 'android-pass') },
  { origin: 'https://planted.work.example/', user: 'eve', blob: Buffer.from('plain-text-planted') },
  // Before Chrome 80, on Windows: the password itself sealed by DPAPI.
  ...(process.platform === 'win32' ? [{ origin: 'https://old.work.example/', user: 'olduser', blob: dpapi(Buffer.from('old-dpapi-pass')) }] : []),
])
logins(path.join(chromeWork, 'Login Data For Account'), [
  { origin: 'https://account.work.example/', user: 'alice', blob: v10(chromeKey, 'account-pass') },
])

// Edge: everything locked to it (v20).
const edge = dir(local, 'Microsoft', 'Edge', 'User Data')
localState(edge, randomBytes(32))
const edgeDefault = dir(edge, 'Default')
bookmarks(path.join(edgeDefault, 'Bookmarks'), [{ name: 'Edge News', url: 'https://news.edge.example/' }])
logins(path.join(edgeDefault, 'Login Data'), [
  { origin: 'https://one.edge.example/', user: 'u1', blob: v20() },
  { origin: 'https://two.edge.example/', user: 'u2', blob: v20() },
])

// Opera GX: its profile in its own folder (Roaming), a side profile, v10
// with the site's hash before the password.
const operaKey = randomBytes(32)
const gx = dir(roaming, 'Opera Software', 'Opera GX Stable')
localState(gx, operaKey)
bookmarks(path.join(gx, 'Bookmarks'), [{ name: 'GX Corner', url: 'https://gx.opera.example/' }])
history(path.join(gx, 'History'), [{ url: 'https://gx.opera.example/', title: 'GX Corner', count: 5 }])
logins(path.join(gx, 'Login Data'), [{ origin: 'https://game.example/', user: 'player1', blob: v10(operaKey, 'gx-pass', true) }])
const side = dir(gx, '_side_profiles', 'a1b2c3')
bookmarks(path.join(side, 'Bookmarks'), [{ name: 'Side', url: 'https://side.opera.example/' }])

// Arc on Windows: a packaged app's folder.
const arc = dir(local, 'Packages', 'TheBrowserCompany.Arc_ttt1ap7aakyb4', 'LocalCache', 'Local', 'Arc', 'User Data')
const arcDefault = dir(arc, 'Default')
bookmarks(path.join(arcDefault, 'Bookmarks'), [{ name: 'Arc Thing', url: 'https://arc.example/' }])
history(path.join(arcDefault, 'History'), [{ url: 'https://arc.example/', title: 'Arc Thing', count: 1 }])

/** A small PNG of one colour with a diagonal, as a site's icon. */
function png(size, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = y * (size * 4 + 1) + 1 + x * 4
    raw.set(x === y ? [255, 255, 255, 255] : [r, g, b, 255], at)
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// Chrome's icons for its work profile: the wiki's front door.
{
  const db = new DatabaseSync(path.join(chromeWork, 'Favicons'))
  db.exec('CREATE TABLE favicons(id INTEGER PRIMARY KEY, url LONGVARCHAR NOT NULL, icon_type INTEGER DEFAULT 1)')
  db.exec('CREATE TABLE favicon_bitmaps(id INTEGER PRIMARY KEY, icon_id INTEGER NOT NULL, last_updated INTEGER DEFAULT 0, image_data BLOB, width INTEGER DEFAULT 0, height INTEGER DEFAULT 0)')
  db.exec('CREATE TABLE icon_mapping(id INTEGER PRIMARY KEY, page_url LONGVARCHAR NOT NULL, icon_id INTEGER)')
  db.prepare("INSERT INTO favicons VALUES (1, 'https://wiki.work.example/favicon.png', 1)").run()
  db.prepare('INSERT INTO favicon_bitmaps (icon_id, image_data, width, height) VALUES (1, ?, 32, 32)').run(png(32, [30, 120, 200]))
  db.prepare("INSERT INTO icon_mapping (page_url, icon_id) VALUES ('https://wiki.work.example/', 1)").run()
  db.close()
}

// Brave and Vivaldi in the Mac's layout.
const brave = dir(mac, 'BraveSoftware', 'Brave-Browser', 'Default')
bookmarks(path.join(brave, 'Bookmarks'), [{ name: 'Brave Search', url: 'https://search.brave.example/' }])
history(path.join(brave, 'History'), [{ url: 'https://search.brave.example/', title: 'Brave Search', count: 4 }])
const vivaldi = dir(mac, 'Vivaldi', 'Default')
bookmarks(path.join(vivaldi, 'Bookmarks'), [{ name: 'Vivaldi One', url: 'https://one.vivaldi.example/' }])

// Firefox: NSS's key4.db and logins.json

function der(tag, ...parts) {
  const body = Buffer.concat(parts)
  const len = body.length < 0x80 ? Buffer.from([body.length])
    : body.length < 0x100 ? Buffer.from([0x81, body.length]) : Buffer.from([0x82, body.length >> 8, body.length & 0xff])
  return Buffer.concat([Buffer.from([tag]), len, body])
}
const seq = (...p) => der(0x30, ...p)
const octets = b => der(0x04, b)
const int = n => der(0x02, n < 0x80 ? Buffer.from([n]) : Buffer.from([n >> 8, n & 0xff]))
function oid(text) {
  const [a, b, ...rest] = text.split('.').map(Number)
  const out = [a * 40 + b]
  for (const v of rest) {
    const bytes = [v & 0x7f]
    for (let x = v >> 7; x; x >>= 7) bytes.unshift((x & 0x7f) | 0x80)
    out.push(...bytes)
  }
  return der(0x06, Buffer.from(out))
}
const aesCBC = (key, iv, plain) => { const c = createCipheriv('aes-256-cbc', key, iv); return Buffer.concat([c.update(plain), c.final()]) }
const desCBC = (key, iv, plain) => { const c = createCipheriv('des-ede3-cbc', key, iv); return Buffer.concat([c.update(plain), c.final()]) }

/** PBES2 as NSS writes it: PBKDF2-HMAC-SHA256 over sha256(salt + password). */
function pbes2(globalSalt, password, plain) {
  const salt = randomBytes(32), rounds = 1000, iv14 = randomBytes(14)
  const key = pbkdf2Sync(createHash('sha256').update(Buffer.concat([globalSalt, Buffer.from(password)])).digest(), salt, rounds, 32, 'sha256')
  const ct = aesCBC(key, Buffer.concat([Buffer.from([4, 14]), iv14]), plain)
  return seq(
    seq(oid('1.2.840.113549.1.5.13'), seq(
      seq(oid('1.2.840.113549.1.5.12'), seq(octets(salt), int(rounds), int(32), seq(oid('1.2.840.113549.2.9')))),
      seq(oid('2.16.840.1.101.3.4.1.42'), octets(iv14)))),
    octets(ct))
}

const keyID = Buffer.concat([Buffer.from([0xf8]), Buffer.alloc(14), Buffer.from([1])])
function key4(file, password, master) {
  const salt = randomBytes(20)
  const db = new DatabaseSync(file)
  db.exec('CREATE TABLE metaData (id PRIMARY KEY UNIQUE ON CONFLICT REPLACE, item1, item2)')
  db.exec('CREATE TABLE nssPrivate (id PRIMARY KEY UNIQUE ON CONFLICT ABORT, a11, a102)')
  db.prepare("INSERT INTO metaData VALUES ('password', ?, ?)").run(salt, pbes2(salt, password, Buffer.from('password-check\x02\x02')))
  db.prepare('INSERT INTO nssPrivate VALUES (1, ?, ?)').run(pbes2(salt, password, master), keyID)
  db.close()
}
function sealed(master, text) {
  const iv14 = randomBytes(14)
  const ct = aesCBC(master, Buffer.concat([Buffer.from([4, 14]), iv14]), Buffer.from(text))
  return seq(octets(keyID), seq(oid('2.16.840.1.101.3.4.1.42'), octets(iv14)), octets(ct)).toString('base64')
}
function sealedDES(master, text) {
  const iv = randomBytes(8)
  const ct = desCBC(master.subarray(0, 24), iv, Buffer.from(text))
  return seq(octets(keyID), seq(oid('1.2.840.113549.3.7'), octets(iv)), octets(ct)).toString('base64')
}

function places(file, marks, visits) {
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR, visit_count INTEGER DEFAULT 0,
    hidden INTEGER DEFAULT 0 NOT NULL, last_visit_date INTEGER)`)
  db.exec(`CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER DEFAULT NULL, parent INTEGER,
    position INTEGER, title LONGVARCHAR, guid TEXT)`)
  const roots = [[1, 'root________', 0], [2, 'menu________', 1], [3, 'toolbar_____', 1], [4, 'tags________', 1], [5, 'unfiled_____', 1], [6, 'mobile______', 1]]
  const mark = db.prepare('INSERT INTO moz_bookmarks (id, type, fk, parent, position, title, guid) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const [id, guid, parent] of roots) mark.run(id, 2, null, parent, 0, '', guid)
  const place = db.prepare('INSERT INTO moz_places (id, url, title, visit_count, hidden, last_visit_date) VALUES (?, ?, ?, ?, ?, ?)')
  let pid = 1, bid = 100
  for (const v of visits) place.run(pid++, v.url, v.title, v.count, v.hidden ? 1 : 0, v.at == null ? null : v.at * 1000)
  const parents = { toolbar: 3, menu: 2, unfiled: 5, mobile: 6, tags: 4 }
  const put = (list, parent) => list.forEach((m, i) => {
    const id = bid++
    if (m.children) { mark.run(id, 2, null, parent, i, m.name, `folder${id}`); put(m.children, id) }
    else { place.run(pid, m.url, m.name, 0, 0, null); mark.run(id, 1, pid++, parent, i, m.name, `mark${id}`) }
  })
  for (const [where, list] of Object.entries(marks)) put(list, parents[where])
  db.close()
}

const ff = dir(roaming, 'Mozilla', 'Firefox')
writeFileSync(path.join(ff, 'profiles.ini'), [
  '[Install308046B0AF4A39CB]', 'Default=Profiles/abcd1234.default-release', 'Locked=1', '',
  '[Profile1]', 'Name=locked-one', 'IsRelative=1', 'Path=Profiles/zzzz9999.locked', '',
  '[Profile0]', 'Name=default-release', 'IsRelative=1', 'Path=Profiles/abcd1234.default-release', 'Default=1', '',
].join('\r\n'))
const ffMain = dir(ff, 'Profiles', 'abcd1234.default-release')
places(path.join(ffMain, 'places.sqlite'),
  { toolbar: [{ name: 'MDN', url: 'https://developer.mozilla.org/' }, { name: 'Reading', children: [{ name: 'Essay', url: 'https://essays.example/one' }] }],
    menu: [{ name: 'Menu Site', url: 'https://menu.example/' }],
    unfiled: [{ name: 'Unsorted', url: 'https://unsorted.example/' }],
    tags: [{ name: 'tagged', children: [{ name: 'Tag entry', url: 'https://tagged.example/' }] }] },
  [{ url: 'https://developer.mozilla.org/en-US/', title: 'MDN Web Docs', count: 12, at: days(1) },
   { url: 'https://hidden.mozilla.example/', title: 'Hidden', count: 3, hidden: true, at: days(1) },
   { url: 'https://unvisited.example/', title: 'Never', count: 0, at: null }])
{
  const db = new DatabaseSync(path.join(ffMain, 'favicons.sqlite'))
  db.exec('CREATE TABLE moz_icons (id INTEGER PRIMARY KEY, icon_url TEXT NOT NULL, width INTEGER NOT NULL DEFAULT 0, data BLOB)')
  db.exec('CREATE TABLE moz_pages_w_icons (id INTEGER PRIMARY KEY, page_url TEXT NOT NULL)')
  db.exec('CREATE TABLE moz_icons_to_pages (page_id INTEGER NOT NULL, icon_id INTEGER NOT NULL)')
  db.prepare("INSERT INTO moz_icons VALUES (1, 'https://developer.mozilla.org/favicon.png', 32, ?)").run(png(32, [200, 60, 40]))
  db.prepare("INSERT INTO moz_pages_w_icons VALUES (1, 'https://developer.mozilla.org/')").run()
  db.prepare('INSERT INTO moz_icons_to_pages VALUES (1, 1)').run()
  db.close()
}
const ffMaster = randomBytes(32)
key4(path.join(ffMain, 'key4.db'), '', ffMaster)
json(path.join(ffMain, 'logins.json'), {
  nextId: 4,
  logins: [
    { id: 1, hostname: 'https://accounts.fox.example', encryptedUsername: sealed(ffMaster, 'fox-user'), encryptedPassword: sealed(ffMaster, 'fox-pass'), timeLastUsed: days(5) },
    { id: 2, hostname: 'http://old.fox.example', encryptedUsername: sealedDES(ffMaster, 'legacy'), encryptedPassword: sealedDES(ffMaster, 'des-pass') },
    { id: 3, hostname: 'chrome://FirefoxAccounts', encryptedUsername: sealed(ffMaster, 'x'), encryptedPassword: sealed(ffMaster, 'y') },
  ],
  disabledHosts: ['https://nosave.fox.example'],
})
const ffLocked = dir(ff, 'Profiles', 'zzzz9999.locked')
places(path.join(ffLocked, 'places.sqlite'), { toolbar: [{ name: 'Locked profile site', url: 'https://locked.fox.example/' }] }, [])
key4(path.join(ffLocked, 'key4.db'), 'primary-secret', randomBytes(32))
json(path.join(ffLocked, 'logins.json'), { logins: [
  { hostname: 'https://secret.fox.example', encryptedUsername: 'MA==', encryptedPassword: 'MA==' },
] })

// A CSV as Chrome exports it, and a Netscape bookmarks page.
const files = dir(home, 'Exports')
writeFileSync(path.join(files, 'Chrome Passwords.csv'), [
  'name,url,username,password,note',
  'bound.work.example,https://bound.work.example/,bob,"pa,ss""word",',
  'two,https://two.edge.example/,u2,edge-two,"a note',
  'over two lines"',
  'noaddress,,someone,nopass-site,',
  'nopass,https://nopass.example/,x,,',
  'android,android://hash@com.vendor.app/,droid,droid-pass,',
].join('\r\n') + '\r\n')
writeFileSync(path.join(files, 'bookmarks.html'), `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
<DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
<DL><p>
<DT><A HREF="https://bar.example/" ADD_DATE="1700000000">Bar &amp; Grill</A>
</DL><p>
<DT><H3>Recipes</H3>
<DL><p>
<DT><A HREF="https://food.example/pasta">Pasta &#233;t&#xe9;</A>
<DT><A HREF="javascript:void(0)">Script</A>
</DL><p>
</DL><p>
`)

console.log(JSON.stringify({ home, exports: files }))
