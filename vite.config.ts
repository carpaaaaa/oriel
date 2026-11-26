import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// The interface: one page, two roots (?root=chrome under the pages,
// ?root=overlay above them), the pages in a tab (page.html) and the floating
// video's buttons (float.html). Built into out/ui and loaded from disk.

// Text size (Settings › Appearance, text.scale): every font size and line
// height the interface sets in pixels is multiplied by --text-scale (1 to
// 1.4), set on both roots of each window (chrome/register.tsx) and on Oriel's
// pages (preload/page/internal.ts). Sizes given as var(--fs-...) or var(--title) follow their
// token, scaled once where it is defined.
const SCALED = /^(font-size|line-height|font|--fs-.*|--title)$/
const textScale = {
  postcssPlugin: 'oriel-text-scale',
  Declaration(decl: { prop: string; value: string }) {
    if (!SCALED.test(decl.prop) || !/\dpx/.test(decl.value) || decl.value.includes('--text-scale')) return
    decl.value = decl.value.replace(/(\d*\.?\d+)px/g, (_m: string, n: string) => `calc(${n}px * var(--text-scale, 1))`)
  },
}

export default defineConfig({
  root: 'src/ui',
  base: './',
  plugins: [solid()],
  css: { postcss: { plugins: [textScale] } },
  build: {
    outDir: '../../out/ui',
    emptyOutDir: true,
    target: 'chrome150',
    sourcemap: true,
    rollupOptions: { input: { index: 'src/ui/index.html', page: 'src/ui/page.html', float: 'src/ui/float.html' } },
  },
})
