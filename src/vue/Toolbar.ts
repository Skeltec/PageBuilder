import { defineComponent, h, ref, type PropType } from 'vue'
import type { BlockEditor } from '../core/BlockEditor'
import { useEditor, useEditorEvent, useEditorState } from './context'

export interface ToolbarItem {
  label: string
  title?: string
  run: (editor: BlockEditor) => unknown
  /** État enfoncé (ex. gras actif à la sélection) */
  active?: (editor: BlockEditor) => boolean
  /** Masqué si false (ex. upload sans module de fichiers) */
  visible?: (editor: BlockEditor) => boolean
}

/** Boutons par défaut ; `editor.tiptap` est relu à chaque appel (l'instance change après un chargement async) */
export const defaultToolbarItems: ToolbarItem[] = [
  { label: 'B', title: 'Gras', run: (e) => e.tiptap.chain().focus().toggleBold().run(), active: (e) => e.tiptap.isActive('bold') },
  { label: 'I', title: 'Italique', run: (e) => e.tiptap.chain().focus().toggleItalic().run(), active: (e) => e.tiptap.isActive('italic') },
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
  { label: '🖼 Image', title: 'Téléverser une image', run: (e) => e.assets?.pickFiles({ accept: 'image/*' }), visible: (e) => e.assets !== null },
  {
    label: '🔗 Page',
    title: 'Lien vers une page',
    run: (e) => e.links?.insert(),
    active: (e) => e.links?.activeScheme() != null,
    visible: (e) => e.links !== null,
  },
  { label: '📎 Fichier', title: 'Joindre un fichier', run: (e) => e.assets?.pickFiles(), visible: (e) => e.assets !== null },
  { label: '✕ Supprimer bloc', title: 'Supprimer le bloc courant', run: (e) => e.deleteCurrentBlock() },
]

/**
 * Barre d'outils : mise en forme + téléversement (si `assets` est configuré)
 * et état des envois. Slot par défaut : boutons supplémentaires.
 */
export const Toolbar = defineComponent({
  name: 'Toolbar',
  props: {
    editor: { type: Object as PropType<BlockEditor>, default: undefined },
    items: { type: Array as PropType<ToolbarItem[]>, default: () => defaultToolbarItems },
  },
  setup(props, { slots }) {
    const editor = useEditor(() => props.editor)
    const pressed = useEditorState(editor, (e) => props.items.map((i) => i.active?.(e)))

    const uploading = ref(0)
    const message = ref('')
    const error = ref(false)
    useEditorEvent(editor, 'uploadStart', () => {
      uploading.value++
      message.value = ''
    })
    useEditorEvent(editor, 'uploadEnd', () => uploading.value--)
    useEditorEvent(editor, 'uploadError', ({ file, error: err, stage }) => {
      // Refusé avant l'envoi (accept, maxSize) : uploadStart n'a pas été émis
      if (stage === 'upload') uploading.value = Math.max(0, uploading.value - 1)
      message.value = stage === 'validation' && err instanceof Error ? err.message : `Échec de l'envoi : ${file.name}`
      error.value = true
    })

    return () => {
      const e = editor.value
      const status = uploading.value ? `Envoi de ${uploading.value} fichier(s)…` : message.value
      return h('div', { class: 'wy-toolbar', role: 'toolbar' }, [
        ...props.items.map((item, i) =>
          !e || (item.visible?.(e) ?? true)
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'wy-btn',
                  title: item.title,
                  disabled: !e,
                  'aria-pressed': item.active ? String(Boolean(pressed.value?.[i])) : undefined,
                  // Garde la sélection de l'éditeur
                  onMousedown: (ev: MouseEvent) => ev.preventDefault(),
                  onClick: () => e && item.run(e),
                },
                item.label,
              )
            : null,
        ),
        slots.default?.({ editor: e }),
        h(
          'span',
          { class: 'wy-toolbar-status', 'aria-live': 'polite', 'data-error': !uploading.value && error.value && status ? '' : undefined },
          status,
        ),
      ])
    }
  },
})
