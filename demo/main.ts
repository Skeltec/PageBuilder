import './style.css'
import { BlockEditor, type AssetAdapter } from 'wysiwyg'
import { BlockLibrary, BlockSettings, Sidebar, Toolbar } from 'wysiwyg/ui'
import { blocks as staticBlocks } from './blocks'
import { asyncBlocks } from './blocks/asyncBlocks'

// Contenu de démo : un bloc connu, un bloc chargeable en async (testimonial) et
// un bloc qui n'existe nulle part (pricingTable)
const initialContent = `
<h2>Démo</h2>
<p>Texte avant le bloc 2 colonnes.</p>
<div class="flex gap-8" data-type="columns" data-block-root="" data-params='{"columns":2,"gap":"gap-8"}'><div class="min-w-0 flex-1" data-type="columns_0" data-slot="rich"><p>Gauche</p></div><div class="min-w-0 flex-1" data-type="columns_0" data-slot="rich"><p>Droite</p></div></div>
<figure class="rounded-xl bg-slate-900 p-8 text-white" data-type="testimonial" data-block-root=""><blockquote class="text-xl italic text-white" data-type="testimonial_0" data-slot="multi">Super outil,<br>vraiment.</blockquote><figcaption class="mt-4 text-sm text-slate-300" data-type="testimonial_1" data-slot="single">— Une utilisatrice</figcaption></figure>
<div class="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-6" data-type="pricingTable" data-block-root=""><div data-type="pricingTable_0"><h3>Gratuit</h3><p>0 $ / mois</p></div><div data-type="pricingTable_1"><h3>Pro</h3><p>29 $ / mois</p></div></div>
<p>Fichier joint : <a href="asset:guide.pdf">guide.pdf</a></p>
<p></p>
`

/**
 * Module de fichiers factice : garde les fichiers en mémoire (blob:) avec un
 * délai simulé. En vrai : POST vers votre API, et resolve(id) → URL du CDN.
 * Le HTML sauvegardé ne contient que des références `asset:<id>`.
 */
const files = new Map<string, string>()
let nextId = 1
const assets: AssetAdapter = {
  async upload(file, { signal }) {
    await new Promise((r) => setTimeout(r, 800))
    signal.throwIfAborted()
    const id = String(nextId++)
    files.set(id, URL.createObjectURL(file))
    return { id, name: file.name }
  },
  // Fichier inconnu de ce stockage factice : URL de démo
  resolve: (id) => files.get(id) ?? `https://example.com/files/${encodeURIComponent(id)}`,
  maxSize: 10 * 1024 * 1024,
}

// La démo consomme la librairie comme une application : le cœur (BlockEditor)
// et des vues indépendantes, chacune remplaçable par la vôtre.
const editor = new BlockEditor({
  element: '#editor',
  contentWidth: '48rem',
  blocks: staticBlocks,
  asyncBlocks,
  content: initialContent,
  assets,
  views: [
    new Sidebar({ mount: '#left-panel', side: 'left', title: 'Blocs', persistKey: 'panel-left-collapsed', views: [new BlockLibrary({ view: 'grid' })] }),
    new Sidebar({ mount: '#right-panel', side: 'right', title: 'Paramètres', persistKey: 'panel-right-collapsed', views: [new BlockSettings()] }),
    new Toolbar({ mount: '#toolbar' }),
  ],
  on: { update: render },
})

const output = document.querySelector<HTMLTextAreaElement>('#output')!
const outputStatus = document.querySelector<HTMLElement>('#output-status')!
// Vrai dès que l'utilisateur modifie le textarea : on arrête alors de l'écraser
let outputDirty = false

output.addEventListener('input', () => {
  outputDirty = true
  outputStatus.textContent = 'Modifié — cliquer pour appliquer'
})

document.querySelector('#reload')!.addEventListener('click', () => {
  // Le HTML passe par les règles parseHTML : ce qui n'est pas dans le schéma est ignoré
  editor.setContent(output.value)
  outputDirty = false
  outputStatus.textContent = 'Éditeur rechargé'
  render()
})

let renderId = 0
async function render() {
  const html = editor.getHTML()
  if (!outputDirty) output.value = formatHTML(html)
  // Rendu public : même HTML, références asset:id résolues en URLs
  const id = ++renderId
  const resolved = await editor.getResolvedHTML()
  if (id === renderId) document.querySelector('#preview')!.innerHTML = resolved
}

/**
 * Retour à la ligne après les balises de bloc seulement : couper entre des
 * balises inline (<strong><em>) ajouterait des espaces au rechargement.
 */
function formatHTML(html: string) {
  return html.replace(/(<\/?(?:p|h[1-6]|div|section|aside|ul|ol|li|blockquote|hr)\b[^>]*>)(?=<)/g, '$1\n')
}

render()
