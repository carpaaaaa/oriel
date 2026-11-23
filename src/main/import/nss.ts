// Firefox's saved logins, read the way NSS reads them, in plain JavaScript
// (Import.swift Mozilla.masterKey, decryptLogin, unwrap; studio/05 §1.5).
// Only with an empty primary password: with one set, the person exports a
// CSV instead and Search never asks for it.

import { createDecipheriv, createHash, createHmac, pbkdf2Sync } from 'node:crypto'
import { bytes, snapshot } from './read'

export class PrimaryPassword extends Error {}

type TLV = { tag: number; body: Buffer; next: number }

/** One DER element: its tag, its content, and where the next begins. */
function tlv(b: Buffer, i: number): TLV | null {
  if (i + 1 >= b.length) return null
  const tag = b[i]
  let j = i + 1
  let len = b[j++]
  if (len & 0x80) {
    const n = len & 0x7f
    if (n === 0 || n > 4 || j + n > b.length) return null
    len = 0
    for (let k = 0; k < n; k++) len = len * 256 + b[j++]
  }
  if (len < 0 || j + len > b.length) return null
  return { tag, body: b.subarray(j, j + len), next: j + len }
}

function items(body: Buffer): TLV[] {
  const out: TLV[] = []
  let i = 0
  for (let one = tlv(body, i); one; one = tlv(body, i)) { out.push(one); i = one.next }
  return out
}

function oid(body: Buffer): string {
  if (!body.length) return ''
  const parts = [Math.floor(body[0] / 40), body[0] % 40]
  let value = 0
  for (const byte of body.subarray(1)) {
    value = value * 128 + (byte & 0x7f)
    if (!(byte & 0x80)) { parts.push(value); value = 0 }
  }
  return parts.join('.')
}

const integer = (body: Buffer) => body.reduce((n, b) => n * 256 + b, 0)
const sha1 = (b: Buffer) => createHash('sha1').update(b).digest()
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest()
const hmac1 = (key: Buffer, msg: Buffer) => createHmac('sha1', key).update(msg).digest()

function cbc(algorithm: 'aes-256-cbc' | 'des-ede3-cbc', key: Buffer, iv: Buffer, data: Buffer): Buffer | null {
  try {
    const d = createDecipheriv(algorithm, key, iv)
    return Buffer.concat([d.update(data), d.final()])
  } catch { return null }
}

/** A key4.db entry unwrapped with the empty password: PBES2 (PBKDF2-SHA256,
 * AES-256-CBC) in current Firefox, PBE-SHA1-3DES before that. */
export function unwrap(blob: Buffer, globalSalt: Buffer, password = Buffer.alloc(0)): Buffer | null {
  const outer = tlv(blob, 0)
  if (!outer) return null
  const top = items(outer.body)
  if (top.length !== 2) return null
  const algo = items(top[0].body)
  if (algo.length !== 2) return null
  const algoOid = oid(algo[0].body)
  const ciphertext = top[1].body
  if (algoOid === '1.2.840.113549.1.5.13') {
    const params = items(algo[1].body)
    if (params.length !== 2) return null
    const kdf = items(params[0].body)
    if (kdf.length !== 2) return null
    const kp = items(kdf[1].body)
    if (kp.length < 2) return null
    const salt = kp[0].body
    if (kp[1].body.length > 4) return null
    const rounds = integer(kp[1].body)
    if (rounds < 1 || rounds > 10_000_000 || !salt.length) return null
    const enc = items(params[1].body)
    if (enc.length !== 2) return null
    const key = pbkdf2Sync(sha256(Buffer.concat([globalSalt, password])), salt, rounds, 32, 'sha256')
    // NSS keeps fourteen bytes of the IV behind a DER octet-string header.
    const iv = Buffer.concat([Buffer.from([0x04, 0x0e]), enc[1].body])
    return iv.length === 16 ? cbc('aes-256-cbc', key, iv, ciphertext) : null
  }
  if (algoOid === '1.2.840.113549.1.12.5.1.3') {
    const params = items(algo[1].body)
    const entrySalt = params[0]?.body
    if (!entrySalt) return null
    const hp = sha1(Buffer.concat([globalSalt, password]))
    const chp = sha1(Buffer.concat([hp, entrySalt]))
    const pes = entrySalt.length < 20 ? Buffer.concat([entrySalt, Buffer.alloc(20 - entrySalt.length)]) : entrySalt.subarray(0, 20)
    const k1 = hmac1(chp, Buffer.concat([pes, entrySalt]))
    const tk = hmac1(chp, pes)
    const k2 = hmac1(chp, Buffer.concat([tk, entrySalt]))
    const k = Buffer.concat([k1, k2])
    return cbc('des-ede3-cbc', k.subarray(0, 24), k.subarray(k.length - 8), ciphertext)
  }
  return null
}

/** The key that opens the logins: the empty password checked against
 * key4.db's own record, then the key unwrapped from nssPrivate. */
export function masterKey(key4: string, root: string): Buffer {
  const snap = snapshot(key4, root)
  if (!snap) throw new Error('unreadable')
  try {
    const meta = snap.db.prepare("SELECT item1, item2 FROM metaData WHERE id = 'password'").get() as Record<string, unknown> | undefined
    const globalSalt = bytes(meta?.item1), item2 = bytes(meta?.item2)
    if (!globalSalt.length || !item2.length) throw new Error('unreadable')
    const check = unwrap(item2, globalSalt)
    if (!check || !check.subarray(0, 14).equals(Buffer.from('password-check'))) throw new PrimaryPassword()
    const wanted = Buffer.concat([Buffer.from([0xf8]), Buffer.alloc(14), Buffer.from([0x01])])
    const rows = snap.db.prepare('SELECT a11, a102 FROM nssPrivate').all() as Record<string, unknown>[]
    const row = rows.find(r => bytes(r.a102).equals(wanted))
    const key = row ? unwrap(bytes(row.a11), globalSalt) : null
    if (!key) throw new Error('unreadable')
    return key
  } finally { snap.close() }
}

/** One login field: base64 around DER (key id, cipher and IV, ciphertext);
 * AES-256-CBC in new profiles, 3DES-CBC in old ones. */
export function decryptLogin(b64: string, master: Buffer): string | null {
  let blob: Buffer
  try { blob = Buffer.from(b64, 'base64') } catch { return null }
  const outer = tlv(blob, 0)
  if (!outer) return null
  const parts = items(outer.body)
  if (parts.length !== 3) return null
  const cipher = items(parts[1].body)
  if (cipher.length !== 2) return null
  const iv = cipher[1].body, ct = parts[2].body
  const plain = oid(cipher[0].body) === '2.16.840.1.101.3.4.1.42'
    ? cbc('aes-256-cbc', master.subarray(0, 32), iv.length === 14 ? Buffer.concat([Buffer.from([0x04, 0x0e]), iv]) : iv, ct)
    : cbc('des-ede3-cbc', master.subarray(0, 24), iv, ct)
  if (!plain) return null
  try { return new TextDecoder('utf-8', { fatal: true }).decode(plain) } catch { return null }
}
