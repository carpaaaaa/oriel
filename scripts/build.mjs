// Builds the three parts: main process (ESM), preloads (CommonJS, as
// sandboxed preloads must be), and the interface (Vite).
// node scripts/build.mjs [--watch] [--no-ui]
import { build, context } from 'esbuild'
import { build as vite } from 'vite'
import { cp, mkdir } from 'node:fs/promises'

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

await mkdir('out', { recursive: true })
if (watch) {
  for (const o of [main, preload]) await (await context(o)).watch()
} else {
  await Promise.all([build(main), build(preload)])
}
if (!noUI) await vite({ configFile: 'vite.config.ts', logLevel: 'warn', build: { watch: watch ? {} : null } })
await cp('src/ui/public', 'out/ui', { recursive: true }).catch(() => {})
console.log('built', new Date().toLocaleTimeString())
