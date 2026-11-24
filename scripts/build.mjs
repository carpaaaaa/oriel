// Builds the three parts: main process (ESM), preloads (CommonJS, as
// sandboxed preloads must be), and the interface (Vite); then the ad
// blocker's snapshot: uBlock Origin's default lists, fetched into
// build/blocker when missing or a week old, compiled into
// out/main/blocker/engine.bin so the first launch blocks offline.
// node scripts/build.mjs [--watch] [--no-ui] [--refresh-lists] [--offline]
import { build, context } from 'esbuild'
import { build as vite } from 'vite'
import { cp, mkdir } from 'node:fs/promises'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const watch = process.argv.includes('--watch')
const noUI = process.argv.includes('--no-ui')

const common = { bundle: true, platform: 'node', target: 'node24', sourcemap: true, logLevel: 'warning' }
const main = {
  ...common,
  entryPoints: { index: 'src/main/index.ts' },
  outdir: 'out/main',
  format: 'esm',
  outExtension: { '.js': '.js' },
  external: ['electron', 'koffi', 'electron-chrome-extensions', 'electron-chrome-web-store'],
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
if (!noUI) await vite({ configFile: 'vite.config.ts', logLevel: 'warn', build: { watch: watch ? {} : null } })
await cp('src/ui/public', 'out/ui', { recursive: true }).catch(() => {})
console.log('built', new Date().toLocaleTimeString())

/** The lists bundled with Oriel: fetched when missing or older than a week
 * (or with --refresh-lists), compiled when they changed. Offline with no
 * lists yet, Oriel ships without them and blocks with Search's own rules
 * until its first daily update. */
function snapshot() {
  const dir = 'build/blocker'
  const engine = 'out/main/blocker/engine.bin'
  const tool = 'out/main/blocker-worker.cjs'
  const sources = JSON.parse(readFileSync('src/main/pages/blocker/lists.json', 'utf8'))
  const ids = [...sources.lists, sources.resources].map(s => s.id)
  const age = f => (existsSync(f) ? Date.now() - statSync(f).mtimeMs : Infinity)
  const run = (...args) => execFileSync(process.execPath, [tool, ...args], { stdio: 'inherit' })
  if (!process.argv.includes('--offline') && (process.argv.includes('--refresh-lists') || age(`${dir}/meta.json`) > 7 * 24 * 3600 * 1000)) {
    try { run('fetch', dir) } catch { console.warn('[blocker] the lists could not be fetched: the copy already here (if any) is bundled') }
  }
  if (!ids.every(id => existsSync(`${dir}/${id}.txt`))) {
    console.warn('[blocker] no lists in build/blocker: Oriel will block with its own short list until its first update')
    return
  }
  const newest = Math.min(...ids.map(id => age(`${dir}/${id}.txt`)), age(tool), age('src/main/pages/blocker/lists.json'))
  if (age(engine) > newest) run('compile', dir, engine)
}
