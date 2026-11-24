import './style.css'
import { BlockEditor, BlockLibrary, BlockSettings } from './lib'
import { storage } from './lib/ui/dom'
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
<p></p>
`

// Démo : l'app ne fait que consommer la librairie (src/lib). Toolbar, textarea
// et rendu restent côté app.
const editor = BlockEditor.builder()
  .mount('#editor')
  .contentWidth('48rem')
  .blocks(staticBlocks)
  .asyncBlocks(asyncBlocks)
  .content(initialContent)
  .onUpdate(render)
  .onSelectionUpdate(renderToolbar)
  .onBlocksChange(renderToolbar)
  .use(new BlockLibrary({ mount: '#library', view: 'grid' }), new BlockSettings({ mount: '#settings' }))
  .build()

// Panneaux repliables (layout de la démo, pas la librairie) ; état mémorisé
for (const panel of document.querySelectorAll<HTMLElement>('.panel')) {
  const toggle = panel.querySelector<HTMLButtonElement>('.panel-toggle')!
  const key = `panel-${panel.dataset.side}-collapsed`
  const left = panel.dataset.side === 'left'
  const apply = (collapsed: boolean) => {
    panel.toggleAttribute('data-collapsed', collapsed)
    toggle.setAttribute('aria-expanded', String(!collapsed))
    toggle.textContent = collapsed === left ? '»' : '«'
  }
  apply(storage.get(key) === '1')
  toggle.addEventListener('click', () => {
    const collapsed = !panel.hasAttribute('data-collapsed')
    apply(collapsed)
    storage.set(key, collapsed ? '1' : '0')
  })
}

type Button = { label: string; run: () => void; active?: () => boolean }

// tiptap est relu à chaque clic : l'instance change après un chargement async
const buttons = (): Button[] => [
  { label: 'B', run: () => editor.tiptap.chain().focus().toggleBold().run(), active: () => editor.tiptap.isActive('bold') },
  { label: 'I', run: () => editor.tiptap.chain().focus().toggleItalic().run(), active: () => editor.tiptap.isActive('italic') },
  { label: 'H2', run: () => editor.tiptap.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor.tiptap.isActive('heading', { level: 2 }) },
  { label: '• Liste', run: () => editor.tiptap.chain().focus().toggleBulletList().run(), active: () => editor.tiptap.isActive('bulletList') },
  { label: '✕ Supprimer bloc', run: () => editor.deleteCurrentBlock() },
]

const toolbar = document.querySelector<HTMLElement>('#toolbar')!

function renderToolbar() {
  toolbar.replaceChildren(
    ...buttons().map((b) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.textContent = b.label
      el.className =
        'rounded px-3 py-1 text-sm hover:bg-slate-100 ' +
        (b.active?.() ? 'bg-slate-200 font-semibold' : '')
      el.addEventListener('mousedown', (e) => e.preventDefault())
      el.addEventListener('click', b.run)
      return el
    }),
  )
}

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

function render() {
  renderToolbar()
  const html = editor.getHTML()
  if (!outputDirty) output.value = formatHTML(html)
  // Même HTML que celui sauvegardé : c'est ce que verrait le site public
  document.querySelector('#preview')!.innerHTML = html
}

/**
 * Retour à la ligne après les balises de bloc seulement : couper entre des
 * balises inline (<strong><em>) ajouterait des espaces au rechargement.
 */
function formatHTML(html: string) {
  return html.replace(/(<\/?(?:p|h[1-6]|div|section|aside|ul|ol|li|blockquote|hr)\b[^>]*>)(?=<)/g, '$1\n')
}

render()
