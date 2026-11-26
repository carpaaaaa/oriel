// Runs the engine's real scriptlets for youtube.com in this process (as a
// page's main world would) and reports how long JSON.stringify takes and what
// it does to a few objects. node scriptlets_run.mjs <checkout> <quick|raw>
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
const [root, mode] = process.argv.slice(2)
const require = createRequire(root + '/package.json')
const { FiltersEngine } = require('@ghostery/adblocker')
const buf = readFileSync(root + '/out/main/blocker/engine.bin')
const head = buf.subarray(0, 40).toString('latin1').match(/^ORIEL-BLOCKER-\d\d/)[0].length
const engine = FiltersEngine.deserialize(new Uint8Array(buf.subarray(head + 4, head + 4 + buf.readUInt32LE(head))))
const c = engine.getCosmeticsFilters({ url: 'https://www.youtube.com/watch?v=x', hostname: 'www.youtube.com', domain: 'youtube.com', getBaseRules: false, getInjectionRules: true, getExtendedRules: false, getRulesFromHostname: true, getRulesFromDOM: false })
let scripts = c.scripts.filter(s => s.includes('function editInboundObjectFn(') && s.includes('JSON\\.stringify'))
if (mode === 'quick') {
  // A file: address, not a path: on Windows "C:\..." reads as a URL whose scheme is "c:".
  const { quickScriptlet } = await import(pathToFileURL(path.join(root, 'src/main/pages/blocker/scriptlets.ts')).href)
  scripts = scripts.map(quickScriptlet)
}
// Chromium runs injected scripts so that a class declared again replaces the
// first (as the console does); in Node a class is turned into a variable.
for (const s of scripts) vm.runInThisContext(s.replace(/(^|[;}])class ([A-Za-z_$][\w$]*)/g, '$1var $2 = class $2'))
const big = { items: Array.from({ length: 4000 }, (_, i) => ({ id: i, title: 'video ' + i, thumbs: [{ url: 'https://i.ytimg.com/' + i, w: 120 }], meta: { views: i * 7, tags: ['a', 'b', 'c'] } })) }
const t0 = performance.now(); for (let i = 0; i < 3; i++) JSON.stringify(big); const bigMs = (performance.now() - t0) / 3
const small = { a: 1 }; const t1 = performance.now(); for (let i = 0; i < 2000; i++) JSON.stringify(small); const smallUs = (performance.now() - t1) / 2000 * 1000
const edits = [
  { attestationRequest: {}, context: { client: { userAgent: 'Mozilla; channel', clientName: 'WEB' } } },
  { attestationRequest: {}, context: { client: { userAgent: 'Mozilla; inline' } }, playbackContext: { contentPlaybackContext: {} } },
  { attestationRequest: {}, context: { client: { userAgent: 'Mozilla; yahi' } } },
  { serializedThirdPartyEmbedConfig: '{}', context: { client: { userAgent: 'x; eafg' } } },
  { other: 1, context: { client: { userAgent: 'Mozilla; channel', clientName: 'WEB' } } },
].map(o => JSON.stringify(o))
console.log(JSON.stringify({ scriptlets: scripts.length, bigMs, smallUs, edits }))
