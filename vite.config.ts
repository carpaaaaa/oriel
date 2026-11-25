import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// The interface: one page, two roots (?root=chrome under the pages,
// ?root=overlay above them), the pages in a tab (page.html) and the floating
// video's buttons (float.html). Built into out/ui and loaded from disk.
export default defineConfig({
  root: 'src/ui',
  base: './',
  plugins: [solid()],
  build: {
    outDir: '../../out/ui',
    emptyOutDir: true,
    target: 'chrome150',
    sourcemap: true,
    rollupOptions: { input: { index: 'src/ui/index.html', page: 'src/ui/page.html', float: 'src/ui/float.html' } },
  },
})
