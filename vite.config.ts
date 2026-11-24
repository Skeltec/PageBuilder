import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url))

/**
 * Démo (npm run dev / build:demo). Elle importe la librairie par son nom de
 * paquet, comme une application cliente ; l'alias pointe vers les sources.
 * Tailwind ne sert qu'aux templates de blocs et au layout de la démo.
 */
export default defineConfig({
  root: 'demo',
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      { find: /^wysiwyg\/ui$/, replacement: src('ui/index.ts') },
      { find: /^wysiwyg\/(editor|content|ui)\.css$/, replacement: src('styles/$1.css') },
      { find: /^wysiwyg$/, replacement: src('index.ts') },
    ],
  },
  build: { outDir: '../demo-dist', emptyOutDir: true },
})
