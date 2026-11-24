import type { BlockEditor, BlockEditorPlugin } from '../BlockEditor'
import type { BlockDefinition } from '../defineBlock'
import { el, normalize, resolveMount, setIcon, storage } from './dom'

export type BlockLibraryView = 'list' | 'grid'

export interface BlockLibraryOptions {
  /** Élément (ou sélecteur) où afficher la librairie */
  mount: HTMLElement | string
  /** Vue initiale (défaut : "list") ; le choix de l'utilisateur est mémorisé */
  view?: BlockLibraryView
}

/**
 * Librairie de blocs : recherche, vue liste (icône + description) ou vignettes.
 * Clic = insertion au curseur ; glisser-déposer dans l'éditeur = insertion à
 * l'endroit du dépôt.
 */
export class BlockLibrary implements BlockEditorPlugin {
  private view: BlockLibraryView
  private query = ''
  /** Aperçus générés, par nom de bloc (le template d'un bloc ne change pas) */
  private readonly previews = new Map<string, HTMLElement>()

  constructor(private readonly options: BlockLibraryOptions) {
    this.view = (storage.get('block-library-view') as BlockLibraryView | null) ?? options.view ?? 'list'
  }

  attach(editor: BlockEditor) {
    const root = resolveMount(this.options.mount)

    const search = el('input', {
      type: 'search',
      placeholder: 'Rechercher un bloc…',
      class:
        'w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100',
    })
    search.addEventListener('input', () => {
      this.query = search.value
      render()
    })

    const viewButton = (view: BlockLibraryView, label: string, title: string) => {
      const b = el('button', { type: 'button', title, 'aria-label': title, class: 'rounded px-2 py-1 text-sm' }, label)
      b.addEventListener('click', () => {
        this.view = view
        storage.set('block-library-view', view)
        render()
      })
      return b
    }
    const listButton = viewButton('list', '☰', 'Vue liste')
    const gridButton = viewButton('grid', '▦', 'Vue vignettes')

    const results = el('div', { class: 'mt-3' })
    root.replaceChildren(
      el('div', { class: 'flex items-center gap-2' }, search, el('div', { class: 'flex shrink-0' }, listButton, gridButton)),
      results,
    )

    const render = () => {
      for (const [b, v] of [[listButton, 'list'], [gridButton, 'grid']] as const) {
        b.classList.toggle('bg-slate-200', this.view === v)
        b.setAttribute('aria-pressed', String(this.view === v))
      }
      const q = normalize(this.query)
      const blocks = editor.blocks.filter((b) =>
        normalize(`${b.label} ${b.name} ${b.description ?? ''}`).includes(q),
      )
      if (!blocks.length) {
        results.replaceChildren(el('p', { class: 'py-6 text-center text-sm text-slate-400' }, 'Aucun bloc trouvé'))
        return
      }
      results.className = this.view === 'grid' ? 'mt-3 grid grid-cols-2 gap-3' : 'mt-3 flex flex-col gap-1'
      results.replaceChildren(
        ...blocks.map((b) => (this.view === 'grid' ? this.gridItem(editor, b) : this.listItem(editor, b))),
      )
    }

    render()
    const off = editor.on('blocksChange', render)
    return () => {
      off()
      root.replaceChildren()
    }
  }

  private listItem(editor: BlockEditor, block: BlockDefinition) {
    const icon = el('span', {
      class: 'flex size-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600',
    })
    setIcon(icon, block.icon)
    return this.item(
      editor,
      block,
      'flex w-full items-start gap-3 rounded-md p-2 text-left hover:bg-slate-100',
      icon,
      el(
        'span',
        { class: 'min-w-0' },
        el('span', { class: 'block text-sm font-medium text-slate-800' }, block.label),
        block.description
          ? el('span', { class: 'line-clamp-2 block text-xs text-slate-500' }, block.description)
          : '',
      ),
    )
  }

  private gridItem(editor: BlockEditor, block: BlockDefinition) {
    return this.item(
      editor,
      block,
      'group flex flex-col gap-1.5 rounded-md p-1 text-left hover:bg-slate-100',
      el(
        'span',
        { class: 'block-thumb aspect-[4/3] rounded border border-slate-200 bg-white group-hover:border-indigo-300' },
        this.preview(editor, block),
      ),
      el('span', { class: 'truncate px-0.5 text-xs font-medium text-slate-700' }, block.label),
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
    if (block.thumbnail) {
      return el('img', { src: block.thumbnail, alt: '', class: 'size-full object-cover' })
    }
    let preview = this.previews.get(block.name)
    if (!preview) {
      preview = el('span', { class: 'block-thumb-inner rich-content', 'aria-hidden': 'true' }, editor.renderBlock(block.name))
      this.previews.set(block.name, preview)
    }
    return preview.cloneNode(true) as HTMLElement
  }
}
