import { computed, defineComponent, h, ref, type PropType } from 'vue'
import type { BlockEditor } from '../core/BlockEditor'
import type { BlockDefinition } from '../core/defineBlock'
import { useEditor, useEditorState } from './context'
import { iconProps, normalize, storage } from './utils'

export type BlockLibraryView = 'list' | 'grid'

const VIEW_KEY = 'block-library-view'

/**
 * Librairie de blocs (« librairie de composantes ») : recherche, vue liste
 * (icône + description) ou vignettes. Clic = insertion au curseur ;
 * glisser-déposer dans l'éditeur = insertion à l'endroit du dépôt.
 * Slot `item` ({ block, insert }) pour personnaliser le rendu d'un bloc.
 */
export const BlockLibrary = defineComponent({
  name: 'BlockLibrary',
  props: {
    editor: { type: Object as PropType<BlockEditor>, default: undefined },
    /** Vue initiale (défaut : "list") ; le choix de l'utilisateur est mémorisé */
    view: { type: String as PropType<BlockLibraryView>, default: undefined },
  },
  emits: { insert: (_block: BlockDefinition) => true },
  setup(props, { slots, emit }) {
    const editor = useEditor(() => props.editor)
    const blocks = useEditorState(editor, (e) => e.blocks)
    const query = ref('')
    const view = ref<BlockLibraryView>((storage.get(VIEW_KEY) as BlockLibraryView | null) ?? props.view ?? 'list')
    const setView = (v: BlockLibraryView) => {
      view.value = v
      storage.set(VIEW_KEY, v)
    }

    const filtered = computed(() => {
      const q = normalize(query.value)
      return (blocks.value ?? []).filter((b) => normalize(`${b.label} ${b.name} ${b.description ?? ''}`).includes(q))
    })

    /** Aperçus HTML générés, par nom de bloc (le template d'un bloc ne change pas) */
    const previews = new Map<string, string>()
    const previewHTML = (e: BlockEditor, name: string) => {
      let html = previews.get(name)
      if (html === undefined) {
        html = e.blockHTML(name, { sample: true })
        previews.set(name, html)
      }
      return html
    }

    const insert = (block: BlockDefinition) => {
      editor.value?.insertBlock(block.name)
      emit('insert', block)
    }

    // ProseMirror parse le HTML déposé avec les mêmes règles que le chargement
    const onDragstart = (block: BlockDefinition, ev: DragEvent) => {
      const e = editor.value
      if (!e || !ev.dataTransfer) return
      ev.dataTransfer.setData('text/html', e.blockHTML(block.name))
      ev.dataTransfer.setData('text/plain', block.label)
      ev.dataTransfer.effectAllowed = 'copy'
    }

    const viewButton = (v: BlockLibraryView, label: string, title: string) =>
      h(
        'button',
        { type: 'button', class: 'wy-btn', title, 'aria-label': title, 'aria-pressed': String(view.value === v), onClick: () => setView(v) },
        label,
      )

    const content = (e: BlockEditor, block: BlockDefinition) =>
      view.value === 'grid'
        ? [
            h(
              'span',
              { class: 'block-thumb wy-library-thumb' },
              block.thumbnail
                ? h('img', { src: block.thumbnail, alt: '' })
                : h('span', { class: 'block-thumb-inner rich-content', 'aria-hidden': 'true', innerHTML: previewHTML(e, block.name) }),
            ),
            h('span', { class: 'wy-library-label' }, block.label),
          ]
        : [
            h('span', { class: 'wy-icon', ...iconProps(block.icon) }),
            h('span', { class: 'wy-library-text' }, [
              h('span', { class: 'wy-library-label' }, block.label),
              block.description ? h('span', { class: 'wy-library-desc' }, block.description) : null,
            ]),
          ]

    return () => {
      const e = editor.value
      const list = filtered.value
      return h('div', { class: 'wy-library' }, [
        h('div', { class: 'wy-library-head' }, [
          h('input', {
            type: 'search',
            class: 'wy-input',
            placeholder: 'Rechercher un bloc…',
            value: query.value,
            onInput: (ev: Event) => (query.value = (ev.target as HTMLInputElement).value),
          }),
          h('div', { class: 'wy-btn-group' }, [viewButton('list', '☰', 'Vue liste'), viewButton('grid', '▦', 'Vue vignettes')]),
        ]),
        !e || !list.length
          ? h('p', { class: 'wy-empty' }, e ? 'Aucun bloc trouvé' : '')
          : h(
              'div',
              { class: view.value === 'grid' ? 'wy-library-grid' : 'wy-library-list' },
              list.map((block) =>
                slots.item
                  ? slots.item({ block, insert: () => insert(block) })
                  : h(
                      'button',
                      {
                        key: block.name,
                        type: 'button',
                        draggable: 'true',
                        class: view.value === 'grid' ? 'wy-library-tile' : 'wy-library-item',
                        title: block.description ?? block.label,
                        onClick: () => insert(block),
                        onDragstart: (ev: DragEvent) => onDragstart(block, ev),
                      },
                      content(e, block),
                    ),
              ),
            ),
      ])
    }
  },
})
