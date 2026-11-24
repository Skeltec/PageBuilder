import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url))

/**
 * Démo (npm run dev / build:demo). Elle importe la librairie par son nom de
 * paquet, comme une application cliente ; l'alias pointe vers les sources.
 * Tailwind ne sert qu'aux templates de blocs et au layout de la démo.
 */
export default defineConfig({
  root: 'demo',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^page-builder\/vue$/, replacement: src('vue/index.ts') },
      { find: /^page-builder\/(editor|content|ui)\.css$/, replacement: src('styles/$1.css') },
      { find: /^page-builder$/, replacement: src('index.ts') },
    ],
  },
  build: { outDir: '../demo-dist', emptyOutDir: true },
})
