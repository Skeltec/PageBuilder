import { copyFileSync, mkdirSync } from 'node:fs'
import { defineConfig } from 'vite'

/** Librairie : ESM, dépendances externes, CSS copiés tels quels */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: { index: 'src/index.ts', ui: 'src/ui/index.ts' },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^@tiptap\//, 'dompurify'],
    },
  },
  plugins: [
    {
      name: 'copy-css',
      closeBundle() {
        mkdirSync('dist', { recursive: true })
        for (const f of ['editor.css', 'content.css', 'ui.css']) copyFileSync(`src/styles/${f}`, `dist/${f}`)
      },
    },
  ],
})
