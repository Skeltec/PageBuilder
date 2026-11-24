import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  provide,
  shallowRef,
  toValue,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type ShallowRef,
  watch,
} from 'vue'
import { BlockEditor, type BlockEditorEvents, type BlockEditorListener, type BlockEditorOptions } from '../core/BlockEditor'

export type EditorRef = Readonly<ShallowRef<BlockEditor | undefined>>

export const BlockEditorKey: InjectionKey<EditorRef> = Symbol('BlockEditor')

/**
 * Crée l'éditeur au montage du composant, le détruit au démontage, et le
 * fournit aux composants descendants (BlockLibrary, BlockSettings, Toolbar,
 * EditorContent…) qui n'ont alors pas besoin de la prop `editor`.
 *
 *   const editor = useBlockEditor({ blocks, content, assets })
 *   // <EditorContent /> affiche la zone éditable
 */
export function useBlockEditor(options: BlockEditorOptions | (() => BlockEditorOptions) = {}): EditorRef {
  const editor = shallowRef<BlockEditor>()
  onMounted(() => {
    editor.value = new BlockEditor(typeof options === 'function' ? options() : options)
  })
  onBeforeUnmount(() => {
    editor.value?.destroy()
    editor.value = undefined
  })
  provide(BlockEditorKey, editor)
  return editor
}

/** Fournit un éditeur créé ailleurs (ex. `new BlockEditor(...)` hors de Vue) */
export function provideBlockEditor(editor: MaybeRefOrGetter<BlockEditor | undefined>) {
  const ref = computed(() => toValue(editor))
  provide(BlockEditorKey, ref as unknown as EditorRef)
  return ref
}

/** Éditeur de la prop `editor` si fournie, sinon celui fourni par un parent */
export function useEditor(prop: () => BlockEditor | undefined): ComputedRef<BlockEditor | undefined> {
  const injected = inject(BlockEditorKey, undefined)
  return computed(() => prop() ?? injected?.value)
}

/** S'abonne à un événement de l'éditeur courant (réabonné si l'éditeur change) */
export function useEditorEvent<K extends keyof BlockEditorEvents>(
  editor: MaybeRefOrGetter<BlockEditor | undefined>,
  event: K,
  listener: BlockEditorListener<K>,
) {
  let off: (() => void) | undefined
  watch(
    () => toValue(editor),
    (e) => {
      off?.()
      off = e?.on(event, listener)
    },
    { immediate: true },
  )
  onScopeDispose(() => off?.())
}

/**
 * Valeur dérivée de l'éditeur, recalculée à chaque modification, changement
 * de sélection ou chargement de bloc. Ex. :
 *
 *   const isBold = useEditorState(editor, (e) => e.tiptap.isActive('bold'))
 */
export function useEditorState<T>(
  editor: MaybeRefOrGetter<BlockEditor | undefined>,
  select: (editor: BlockEditor) => T,
): ComputedRef<T | undefined> {
  const tick = shallowRef(0)
  const bump = () => tick.value++
  for (const event of ['update', 'selectionUpdate', 'blocksChange'] as const) useEditorEvent(editor, event, bump)
  return computed(() => {
    void tick.value
    const e = toValue(editor)
    return e ? select(e) : undefined
  })
}
