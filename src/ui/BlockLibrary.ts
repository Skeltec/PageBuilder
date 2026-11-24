import type { BlockEditor, BlockEditorView } from '../core/BlockEditor'
import type { BlockDefinition } from '../core/defineBlock'
import { el, normalize, resolveMount, setIcon, storage } from './dom'

export type BlockLibraryView = 'list' | 'grid'

export interface BlockLibraryOptions {
  /** Élément (ou sélecteur) où s'afficher ; optionnel dans un conteneur (Sidebar) */
  mount?: HTMLElement | string
  /** Vue initiale (défaut : "list") ; le choix de l'utilisateur est mémorisé */
  view?: BlockLibraryView
}

/**
 * Librairie de blocs (« librairie de composantes ») : recherche, vue liste
 * (icône + description) ou vignettes. Clic = insertion au curseur ;
 * glisser-déposer dans l'éditeur = insertion à l'endroit du dépôt.
 */
export class BlockLibrary implements BlockEditorView {
  private view: BlockLibraryView
  private query = ''
  /** Aperçus générés, par nom de bloc (le template d'un bloc ne change pas) */
  private readonly previews = new Map<string, HTMLElement>()

  constructor(private readonly options: BlockLibraryOptions = {}) {
    this.view = (storage.get('block-library-view') as BlockLibraryView | null) ?? options.view ?? 'list'
  }

  attach(editor: BlockEditor, target?: HTMLElement) {
    const root = resolveMount(target ?? this.options.mount)
    root.classList.add('wy-library')

    const search = el('input', { type: 'search', placeholder: 'Rechercher un bloc…', class: 'wy-input' })
    search.addEventListener('input', () => {
      this.query = search.value
      render()
    })

    const viewButton = (view: BlockLibraryView, label: string, title: string) => {
      const b = el('button', { type: 'button', title, 'aria-label': title, class: 'wy-btn' }, label)
      b.addEventListener('click', () => {
        this.view = view
        storage.set('block-library-view', view)
        render()
      })
      return b
    }
    const listButton = viewButton('list', '☰', 'Vue liste')
    const gridButton = viewButton('grid', '▦', 'Vue vignettes')

    const results = el('div')
    root.replaceChildren(
      el('div', { class: 'wy-library-head' }, search, el('div', { class: 'wy-btn-group' }, listButton, gridButton)),
      results,
    )

    const render = () => {
      for (const [b, v] of [[listButton, 'list'], [gridButton, 'grid']] as const) {
        b.setAttribute('aria-pressed', String(this.view === v))
      }
      const q = normalize(this.query)
      const blocks = editor.blocks.filter((b) => normalize(`${b.label} ${b.name} ${b.description ?? ''}`).includes(q))
      if (!blocks.length) {
        results.className = ''
        results.replaceChildren(el('p', { class: 'wy-empty' }, 'Aucun bloc trouvé'))
        return
      }
      results.className = this.view === 'grid' ? 'wy-library-grid' : 'wy-library-list'
      results.replaceChildren(
        ...blocks.map((b) => (this.view === 'grid' ? this.gridItem(editor, b) : this.listItem(editor, b))),
      )
    }

    render()
    const off = editor.on('blocksChange', render)
    return () => {
      off()
      root.replaceChildren()
      root.classList.remove('wy-library')
    }
  }

  private listItem(editor: BlockEditor, block: BlockDefinition) {
    const icon = el('span', { class: 'wy-icon' })
    setIcon(icon, block.icon)
    return this.item(
      editor,
      block,
      'wy-library-item',
      icon,
      el(
        'span',
        { class: 'wy-library-text' },
        el('span', { class: 'wy-library-label' }, block.label),
        block.description ? el('span', { class: 'wy-library-desc' }, block.description) : '',
      ),
    )
  }

  private gridItem(editor: BlockEditor, block: BlockDefinition) {
    return this.item(
      editor,
      block,
      'wy-library-tile',
      el('span', { class: 'block-thumb wy-library-thumb' }, this.preview(editor, block)),
      el('span', { class: 'wy-library-label' }, block.label),
    )
  }

  private item(editor: BlockEditor, block: BlockDefinition, className: string, ...children: (Node | string)[]) {
    const button = el('button', { type: 'button', draggable: 'true', class: className, title: block.description ?? block.label }, ...children)
    button.addEventListener('click', () => editor.insertBlock(block.name))
    // ProseMirror parse le HTML déposé avec les mêmes règles que le chargement
    button.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/html', editor.blockHTML(block.name))
      e.dataTransfer?.setData('text/plain', block.label)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
    })
    return button
  }

  /** Vignette fournie, sinon rendu réel du template rempli avec ses placeholders */
  private preview(editor: BlockEditor, block: BlockDefinition): HTMLElement {
    if (block.thumbnail) return el('img', { src: block.thumbnail, alt: '' })
    let preview = this.previews.get(block.name)
    if (!preview) {
      preview = el('span', { class: 'block-thumb-inner rich-content', 'aria-hidden': 'true' }, editor.renderBlock(block.name))
      this.previews.set(block.name, preview)
    }
    return preview.cloneNode(true) as HTMLElement
  }
}
