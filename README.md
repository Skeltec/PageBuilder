# PageBuilder

Éditeur de blocs basé sur Tiptap, organisé en librairie.

```
src/
  core/      BlockEditor (classe unique), defineBlock, blocs inconnus
  assets/    module de fichiers : upload, références asset:id
  refs/      références génériques <schéma>:<id>, liens internes (LinkManager)
  vue/       composants Vue 3, indépendants et remplaçables
  styles/    editor.css (requis), content.css (thème optionnel), ui.css (composants)
demo/        application de démonstration (consomme la librairie par son nom)
```

## Cœur

```ts
import { BlockEditor } from 'page-builder'
import 'page-builder/editor.css'
import 'page-builder/content.css'

const editor = new BlockEditor({
  element: '#editor',
  blocks: myBlocks,                 // defineBlock(...)
  asyncBlocks: { testimonial: () => import('./testimonial').then((m) => m.testimonial) },
  content: savedHTML,
  on: { update: ({ html }) => save(html) },
})
```

Variante chaînable : `BlockEditor.builder().mount('#editor').blocks(...).build()`.

## Composants Vue (`page-builder/vue`)

Vue 3 en peer dependency. Chaque composant n'utilise que l'API publique de
`BlockEditor` : on peut en remplacer un par le sien. L'éditeur est fourni par
`useBlockEditor()` (créé au montage, détruit au démontage) ou passé en prop `editor`.

```vue
<script setup lang="ts">
import { BlockLibrary, BlockSettings, EditorContent, Sidebar, Toolbar, useBlockEditor } from 'page-builder/vue'
import 'page-builder/editor.css'
import 'page-builder/ui.css'

const editor = useBlockEditor({ blocks, content, assets, on: { update: ({ html }) => save(html) } })
</script>

<template>
  <Sidebar title="Blocs" persist-key="left"><BlockLibrary view="grid" /></Sidebar>
  <main>
    <Toolbar />
    <EditorContent />
  </main>
  <Sidebar side="right" title="Paramètres"><BlockSettings /></Sidebar>
</template>
```

- `Sidebar` : `side`, `title`, `collapsible`, `persist-key`, `v-model:collapsed`, slots `default` / `header`.
- `BlockLibrary` : `view` (`list` | `grid`), événement `insert`, slot `item` ({ block, insert }).
- `BlockSettings` : slot `empty` ; `ParamField` réutilisable pour un panneau maison.
- `Toolbar` : `items` (`ToolbarItem[]`, défaut `defaultToolbarItems`), slot pour boutons en plus.
- Composables pour vos propres composants : `useEditor()`, `useEditorState(editor, (e) => …)`,
  `useEditorEvent(editor, 'uploadError', …)`, `provideBlockEditor(editor)` (éditeur créé hors de Vue).

Les composants sont écrits en `defineComponent` + `h()` (TypeScript 7 n'a pas
encore de `vue-tsc`) ; la démo utilise un SFC (`demo/App.vue`).

Thème : variables `--wy-*` (voir `ui.css`). Aucune dépendance à Tailwind.

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

### Médiathèque (`pick`)

Optionnel : l'application ouvre sa propre médiathèque au lieu du sélecteur natif.
Utilisé par `pickFiles()` (boutons) et `pickRef()` (paramètres image de bloc) ;
coller / glisser-déposer passent toujours par `upload`.

```ts
assets: {
  upload, resolve,
  async pick({ accept, multiple, current }) {
    // current : id du paramètre image en cours (présélection), sinon null
    const medias = await ouvrirMediatheque({ accept, multiple, current })
    if (!medias) return null // annulé
    return medias.map((m) => ({ id: m.id, name: m.nom, alt: m.alt, type: m.mime }))
  },
}
```

- `type` (MIME) décide image (`<img alt>`) ou lien ; absent : image si `accept` ne vise que `image/*`.
- `editor.assets.insert(refs, at?)` insère des références déjà téléversées sans passer par `pick`.
- Démo : `npm run dev`, puis `?mediatheque` dans l'URL.

## Liens internes (`page:id`…)

```ts
new BlockEditor({
  links: [{
    scheme: 'page',
    pick: ({ current, text }) => openPagePicker(current),   // { id, label } | null
    resolve: (id) => router.resolve({ name: 'page', params: { id } }).href,
  }],
})
```

- `editor.links.insert()` (bouton « 🔗 Page » de la Toolbar) : ouvre le sélecteur, puis
  lie la sélection, met à jour le lien sous le curseur, ou insère le libellé de la cible.
- Le HTML ne contient que `<a href="page:42">` : renommer / déplacer la page ne casse rien.
- Rendu : `await editor.getResolvedHTML()` résout fichiers et liens ; sans éditeur,
  `resolveRefs(html, { asset: …, page: … })` (sans DOM). `listRefIds(html, 'page')`
  liste les liens sortants.
- Les schémas configurés sont conservés aussi dans les blocs inconnus (DOMPurify).

## Scripts

- `npm run dev` : démo
- `npm run build` : librairie (`dist/`, ESM + `.d.ts` + CSS)
- `npm run build:demo` / `npm run typecheck`
