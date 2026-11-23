import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// The interface: one page, two roots (?root=chrome under the pages,
// ?root=overlay above them). Built into out/ui and loaded from disk.
export default defineConfig({
  root: 'src/ui',
  base: './',
  plugins: [solid()],
  build: {
    outDir: '../../out/ui',
    emptyOutDir: true,
    target: 'chrome150',
    sourcemap: true,
    rollupOptions: { input: { index: 'src/ui/index.html', page: 'src/ui/page.html' } },
  },
})
