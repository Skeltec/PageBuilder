# wysiwyg

Éditeur de blocs basé sur Tiptap, organisé en librairie.

```
src/
  core/      BlockEditor (classe unique), defineBlock, blocs inconnus
  assets/    module de fichiers : upload, références asset:id
  ui/        vues par défaut, indépendantes et remplaçables
  styles/    editor.css (requis), content.css (thème optionnel), ui.css (vues)
demo/        application de démonstration (consomme la librairie par son nom)
```

## Cœur

```ts
import { BlockEditor } from 'wysiwyg'
import 'wysiwyg/editor.css'
import 'wysiwyg/content.css'

const editor = new BlockEditor({
  element: '#editor',
  blocks: myBlocks,                 // defineBlock(...)
  asyncBlocks: { testimonial: () => import('./testimonial').then((m) => m.testimonial) },
  content: savedHTML,
  on: { update: ({ html }) => save(html) },
})
```

Variante chaînable : `BlockEditor.builder().mount('#editor').blocks(...).build()`.

## Vues

Chaque vue implémente `BlockEditorView` (`attach(editor, target?) => cleanup`) et
n'utilise que l'API publique de `BlockEditor` : on peut en remplacer une par la sienne.

```ts
import { Sidebar, BlockLibrary, BlockSettings, Toolbar } from 'wysiwyg/ui'
import 'wysiwyg/ui.css'

editor.use(new Sidebar({ mount: '#left', title: 'Blocs', views: [new BlockLibrary({ view: 'grid' })] }))
editor.use(new Sidebar({ mount: '#right', side: 'right', title: 'Paramètres', views: [new BlockSettings()] }))
editor.use(new Toolbar({ mount: '#toolbar' }))
// ou sans Sidebar : new BlockLibrary({ mount: '#library' })
```

Thème des vues : variables `--wy-*` (voir `ui.css`). Aucune dépendance à Tailwind.

## Fichiers (upload + liens relatifs)

```ts
new BlockEditor({
  element: '#editor',
  assets: {
    async upload(file, { signal }) {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/files', { method: 'POST', body, signal })
      return { id: (await res.json()).id }
    },
    resolve: (id) => `/api/files/${id}`,   // peut être async (URL signée)
    accept: 'image/*,application/pdf',
    maxSize: 10_000_000,
  },
})
```

- Coller / glisser-déposer un fichier, ou `editor.assets.pickFiles()` (boutons de la Toolbar).
- Images → `<img src="asset:42">`, autres fichiers → `<a href="asset:43">`.
- Le HTML sauvegardé ne contient que des ids ; l'éditeur résout les URLs à l'affichage.
- Rendu public : `await editor.getResolvedHTML()`, ou côté serveur
  `resolveAssetRefs(html, resolve)` (sans DOM). `listAssetIds(html)` pour nettoyer les orphelins.
- Événements : `uploadStart`, `uploadEnd`, `uploadError` (`stage: 'validation' | 'upload'`).

## Scripts

- `npm run dev` : démo
- `npm run build` : librairie (`dist/`, ESM + `.d.ts` + CSS)
- `npm run build:demo` / `npm run typecheck`
