import { type ComputedRef, type InjectionKey, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import { BlockEditor, type BlockEditorEvents, type BlockEditorListener, type BlockEditorOptions } from '../core/BlockEditor';
export type EditorRef = Readonly<ShallowRef<BlockEditor | undefined>>;
export declare const BlockEditorKey: InjectionKey<EditorRef>;
/**
 * Crée l'éditeur au montage du composant, le détruit au démontage, et le
 * fournit aux composants descendants (BlockLibrary, BlockSettings, Toolbar,
 * EditorContent…) qui n'ont alors pas besoin de la prop `editor`.
 *
 *   const editor = useBlockEditor({ blocks, content, assets })
 *   // <EditorContent /> affiche la zone éditable
 */
export declare function useBlockEditor(options?: BlockEditorOptions | (() => BlockEditorOptions)): EditorRef;
/** Fournit un éditeur créé ailleurs (ex. `new BlockEditor(...)` hors de Vue) */
export declare function provideBlockEditor(editor: MaybeRefOrGetter<BlockEditor | undefined>): ComputedRef<BlockEditor | undefined>;
/** Éditeur de la prop `editor` si fournie, sinon celui fourni par un parent */
export declare function useEditor(prop: () => BlockEditor | undefined): ComputedRef<BlockEditor | undefined>;
/** S'abonne à un événement de l'éditeur courant (réabonné si l'éditeur change) */
export declare function useEditorEvent<K extends keyof BlockEditorEvents>(editor: MaybeRefOrGetter<BlockEditor | undefined>, event: K, listener: BlockEditorListener<K>): void;
/**
 * Valeur dérivée de l'éditeur, recalculée à chaque modification, changement
 * de sélection ou chargement de bloc. Ex. :
 *
 *   const isBold = useEditorState(editor, (e) => e.tiptap.isActive('bold'))
 */
export declare function useEditorState<T>(editor: MaybeRefOrGetter<BlockEditor | undefined>, select: (editor: BlockEditor) => T): ComputedRef<T | undefined>;
