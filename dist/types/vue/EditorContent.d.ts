import { type PropType } from 'vue';
import type { BlockEditor } from '../core/BlockEditor';
/**
 * Zone éditable : insère `editor.element` dans le composant. L'éditeur vient
 * de la prop `editor` ou de useBlockEditor() dans un parent.
 */
export declare const EditorContent: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    editor: {
        type: PropType<BlockEditor>;
        default: undefined;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    editor: {
        type: PropType<BlockEditor>;
        default: undefined;
    };
}>> & Readonly<{}>, {
    editor: BlockEditor;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
