import { defineComponent, h, onBeforeUnmount, ref, watch, type PropType } from 'vue'
import type { BlockEditor } from '../core/BlockEditor'
import { useEditor } from './context'

/**
 * Zone éditable : insère `editor.element` dans le composant. L'éditeur vient
 * de la prop `editor` ou de useBlockEditor() dans un parent.
 */
export const EditorContent = defineComponent({
  name: 'EditorContent',
  props: {
    editor: { type: Object as PropType<BlockEditor>, default: undefined },
  },
  setup(props) {
    const editor = useEditor(() => props.editor)
    const root = ref<HTMLElement>()

    watch(
      [editor, root],
      ([e, el], _, onCleanup) => {
        if (!e || !el) return
        el.append(e.element)
        onCleanup(() => e.element.remove())
      },
      { immediate: true, flush: 'post' },
    )
    onBeforeUnmount(() => editor.value?.element.remove())

    return () => h('div', { ref: root, class: 'wy-editor-content' })
  },
})
