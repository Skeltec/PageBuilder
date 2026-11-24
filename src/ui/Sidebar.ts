import type { BlockEditor, BlockEditorView } from '../core/BlockEditor'
import { el, resolveMount, storage } from './dom'

export interface SidebarOptions {
  /** Élément (ou sélecteur) qui devient le panneau */
  mount?: HTMLElement | string
  /** Côté de l'éditeur : oriente le bouton et le rail replié (défaut : "left") */
  side?: 'left' | 'right'
  /** Titre affiché dans l'en-tête (et à la verticale une fois replié) */
  title?: string
  /** Bouton pour replier le panneau (défaut : true) */
  collapsible?: boolean
  /** Clé localStorage pour mémoriser l'état replié ; aucune = pas mémorisé */
  persistKey?: string
  /** Vues affichées dans le panneau, l'une sous l'autre */
  views: BlockEditorView[]
}

/**
 * Conteneur repliable pour d'autres vues (BlockLibrary, BlockSettings, ou les
 * vôtres) : les vues reçoivent leur élément cible et n'ont pas besoin de mount.
 *
 *   editor.use(new Sidebar({ mount: '#left', title: 'Blocs', views: [new BlockLibrary()] }))
 */
export class Sidebar implements BlockEditorView {
  constructor(private readonly options: SidebarOptions) {}

  attach(editor: BlockEditor, target?: HTMLElement) {
    const { side = 'left', title = '', collapsible = true, persistKey, views } = this.options
    const root = resolveMount(target ?? this.options.mount)
    root.classList.add('wy-sidebar')
    root.dataset.side = side

    const header = el('div', { class: 'wy-sidebar-header' }, el('h2', { class: 'wy-sidebar-title' }, title))
    const body = el('div', { class: 'wy-sidebar-body' })
    root.replaceChildren(header, body)

    if (collapsible) {
      const toggle = el('button', { type: 'button', class: 'wy-btn wy-sidebar-toggle' })
      const apply = (collapsed: boolean) => {
        root.toggleAttribute('data-collapsed', collapsed)
        toggle.setAttribute('aria-expanded', String(!collapsed))
        toggle.setAttribute('aria-label', `${collapsed ? 'Déplier' : 'Replier'} ${title}`.trim())
        toggle.textContent = collapsed === (side === 'left') ? '»' : '«'
      }
      apply(persistKey ? storage.get(persistKey) === '1' : false)
      toggle.addEventListener('click', () => {
        const collapsed = !root.hasAttribute('data-collapsed')
        apply(collapsed)
        if (persistKey) storage.set(persistKey, collapsed ? '1' : '0')
      })
      header.append(toggle)
    }

    const cleanups = views.map((view) => {
      const slot = el('div', { class: 'wy-sidebar-section' })
      body.append(slot)
      return view.attach(editor, slot)
    })

    return () => {
      for (const cleanup of cleanups.reverse()) cleanup?.()
      root.replaceChildren()
      root.classList.remove('wy-sidebar')
      root.removeAttribute('data-collapsed')
      delete root.dataset.side
    }
  }
}
