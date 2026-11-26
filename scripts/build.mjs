// Builds the three parts: main process (ESM), preloads (CommonJS, as
// sandboxed preloads must be), and the interface (Vite); then the ad
// blocker's snapshot: uBlock Origin's default lists, fetched into
// build/blocker when missing or a week old, compiled into
// out/main/blocker/engine.bin so the first launch blocks offline. A
// release build (--release) stops with an error when that engine can't be
// made: Oriel never ships without uBlock Origin's lists.
// node scripts/build.mjs [--watch] [--no-ui] [--refresh-lists] [--offline] [--release]
import { build, context } from 'esbuild'
import { build as vite } from 'vite'
import { cp, mkdir } from 'node:fs/promises'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const watch = process.argv.includes('--watch')
const noUI = process.argv.includes('--no-ui')
const release = process.argv.includes('--release')

// A release is minified and carries no source maps: less to read and parse at
// each launch, and in every page and frame for the page preload. No keepNames:
// its helper would land inside functions sent as text to run elsewhere (the
// page preload's executeInMainWorld, the extensions' bridge), where it isn't.
const lean = release ? { minify: true, legalComments: 'none', define: { 'process.env.NODE_ENV': '"production"' } } : {}
const common = { bundle: true, platform: 'node', target: 'node24', sourcemap: !release, logLevel: 'warning', ...lean }
const main = {
  ...common,
  entryPoints: { index: 'src/main/index.ts' },
  outdir: 'out/main',
  format: 'esm',
  outExtension: { '.js': '.js' },
  external: ['electron', 'koffi', 'electron-chrome-extensions', 'electron-chrome-web-store'],
  // One Public Suffix List in the main process, not two: @ghostery/adblocker's
  // tldts-experimental is the same list in another shape, and the blocker
  // only reads a request's hostname and domain from it.
  alias: { 'tldts-experimental': 'tldts' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
}
const preload = {
  ...common,
  entryPoints: { ui: 'src/preload/ui.ts', page: 'src/preload/page.ts' },
  outdir: 'out/preload',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
}

// The blocker's worker (and the build's tool for the snapshot), CommonJS:
// the main process starts it from its text.
const worker = {
  ...common,
  entryPoints: { 'blocker-worker': 'src/main/pages/blocker/worker.ts' },
  outdir: 'out/main',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  sourcemap: false,
}

await mkdir('out', { recursive: true })
if (watch) {
  for (const o of [main, preload, worker]) await (await context(o)).watch()
} else {
  await Promise.all([build(main), build(preload), build(worker)])
}
snapshot()
if (!noUI) await vite({ configFile: 'vite.config.ts', logLevel: 'warn', build: { watch: watch ? {} : null, sourcemap: !release } })
await cp('src/ui/public', 'out/ui', { recursive: true }).catch(() => {})
console.log('built', new Date().toLocaleTimeString())

/** The lists bundled with Oriel: fetched when missing or older than a week
 * (or with --refresh-lists), compiled when they changed, with a copy of
 * each beside the engine (the last good copy of a list whose update fails).
 * Offline with no lists yet, a development build goes without them and
 * blocks with Search's own rules until its first daily update; a release
 * build stops there. */
function snapshot() {
  const dir = 'build/blocker'
  const engine = 'out/main/blocker/engine.bin'
  const tool = 'out/main/blocker-worker.cjs'
  const sources = JSON.parse(readFileSync('src/main/pages/blocker/lists.json', 'utf8'))
  const ids = [...sources.lists, sources.resources].map(s => s.id)
  const age = f => (existsSync(f) ? Date.now() - statSync(f).mtimeMs : Infinity)
  const run = (...args) => execFileSync(process.execPath, [tool, ...args], { stdio: 'inherit' })
  const fail = why => {
    if (!release) { console.warn(`[blocker] ${why}: Oriel will block with its own short list until its first update`); return }
    console.error(`\n[blocker] RELEASE BUILD STOPPED: ${why}. Oriel can't ship without uBlock Origin's lists.\n`)
    process.exit(1)
  }
  if (!process.argv.includes('--offline') && (process.argv.includes('--refresh-lists') || age(`${dir}/meta.json`) > 7 * 24 * 3600 * 1000)) {
    try { run('fetch', dir) } catch { console.warn('[blocker] not every list could be fetched: the copies already here (if any) are bundled') }
  }
  const missing = ids.filter(id => !existsSync(`${dir}/${id}.txt`))
  if (missing.length) return fail(`no ${missing.join(', ')} in ${dir}`)
  const copies = ids.map(id => `out/main/blocker/lists/${id}.txt.gz`)
  const newest = Math.min(...ids.map(id => age(`${dir}/${id}.txt`)), age(tool), age('src/main/pages/blocker/lists.json'))
  if (age(engine) > newest || copies.some(f => !existsSync(f))) {
    try { run('compile', dir, engine) } catch { return fail('the engine could not be compiled') }
  }
  if (!existsSync(engine)) fail(`no ${engine}`)
}
