import type { BlockEditor, BlockEditorView } from '../core/BlockEditor'
import { el, resolveMount } from './dom'

export interface ToolbarItem {
  label: string
  title?: string
  run: (editor: BlockEditor) => unknown
  /** État enfoncé (ex. gras actif à la sélection) */
  active?: (editor: BlockEditor) => boolean
  /** Masqué si false (ex. upload sans module de fichiers) */
  visible?: (editor: BlockEditor) => boolean
}

export interface ToolbarOptions {
  /** Élément (ou sélecteur) où s'afficher ; optionnel dans un conteneur */
  mount?: HTMLElement | string
  /** Boutons (défaut : defaultToolbarItems) */
  items?: ToolbarItem[]
}

/** Boutons par défaut ; `editor.tiptap` est relu à chaque appel (l'instance change après un chargement async) */
export const defaultToolbarItems: ToolbarItem[] = [
  {
    label: 'B',
    title: 'Gras',
    run: (e) => e.tiptap.chain().focus().toggleBold().run(),
    active: (e) => e.tiptap.isActive('bold'),
  },
  {
    label: 'I',
    title: 'Italique',
    run: (e) => e.tiptap.chain().focus().toggleItalic().run(),
    active: (e) => e.tiptap.isActive('italic'),
  },
  {
    label: 'H2',
    title: 'Titre',
    run: (e) => e.tiptap.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.tiptap.isActive('heading', { level: 2 }),
  },
  {
    label: '• Liste',
    title: 'Liste à puces',
    run: (e) => e.tiptap.chain().focus().toggleBulletList().run(),
    active: (e) => e.tiptap.isActive('bulletList'),
  },
  {
    label: '🖼 Image',
    title: 'Téléverser une image',
    run: (e) => e.assets?.pickFiles({ accept: 'image/*' }),
    visible: (e) => e.assets !== null,
  },
  {
    label: '📎 Fichier',
    title: 'Joindre un fichier',
    run: (e) => e.assets?.pickFiles(),
    visible: (e) => e.assets !== null,
  },
  { label: '✕ Supprimer bloc', title: 'Supprimer le bloc courant', run: (e) => e.deleteCurrentBlock() },
]

/** Barre d'outils de mise en forme + téléversement (si `assets` est configuré) */
export class Toolbar implements BlockEditorView {
  constructor(private readonly options: ToolbarOptions = {}) {}

  attach(editor: BlockEditor, target?: HTMLElement) {
    const root = resolveMount(target ?? this.options.mount)
    root.classList.add('wy-toolbar')
    root.setAttribute('role', 'toolbar')
    const items = (this.options.items ?? defaultToolbarItems).filter((i) => i.visible?.(editor) ?? true)

    const buttons = items.map((item) => {
      const b = el('button', { type: 'button', class: 'wy-btn', ...(item.title && { title: item.title }) }, item.label)
      // Garde la sélection de l'éditeur
      b.addEventListener('mousedown', (e) => e.preventDefault())
      b.addEventListener('click', () => item.run(editor))
      return b
    })
    const status = el('span', { class: 'wy-toolbar-status', 'aria-live': 'polite' })
    root.replaceChildren(...buttons, status)

    const sync = () => {
      items.forEach((item, i) => {
        if (item.active) buttons[i].setAttribute('aria-pressed', String(item.active(editor)))
      })
    }

    let uploading = 0
    const showUploads = (message = '') => {
      status.textContent = uploading ? `Envoi de ${uploading} fichier(s)…` : message
      status.toggleAttribute('data-error', !uploading && Boolean(message))
    }

    sync()
    const offs = [
      editor.on('update', sync),
      editor.on('selectionUpdate', sync),
      editor.on('blocksChange', sync),
      editor.on('uploadStart', () => {
        uploading++
        showUploads()
      }),
      editor.on('uploadEnd', () => {
        uploading--
        showUploads()
      }),
      editor.on('uploadError', ({ file, error, stage }) => {
        // Fichier refusé avant l'envoi : uploadStart n'a pas été émis
        if (stage === 'validation') showUploads(error instanceof Error ? error.message : `Fichier refusé : ${file.name}`)
        else {
          uploading = Math.max(0, uploading - 1)
          showUploads(`Échec de l'envoi : ${file.name}`)
        }
      }),
    ]
    return () => {
      offs.forEach((off) => off())
      root.replaceChildren()
      root.classList.remove('wy-toolbar')
      root.removeAttribute('role')
    }
  }
}
