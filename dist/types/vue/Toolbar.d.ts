import { type PropType } from 'vue';
import type { BlockEditor } from '../core/BlockEditor';
export interface ToolbarItem {
    label: string;
    title?: string;
    run: (editor: BlockEditor) => unknown;
    /** État enfoncé (ex. gras actif à la sélection) */
    active?: (editor: BlockEditor) => boolean;
    /** Masqué si false (ex. upload sans module de fichiers) */
    visible?: (editor: BlockEditor) => boolean;
}
/** Boutons par défaut ; `editor.tiptap` est relu à chaque appel (l'instance change après un chargement async) */
export declare const defaultToolbarItems: ToolbarItem[];
/**
 * Barre d'outils : mise en forme + téléversement (si `assets` est configuré)
 * et état des envois. Slot par défaut : boutons supplémentaires.
 */
export declare const Toolbar: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    editor: {
        type: PropType<BlockEditor>;
        default: undefined;
    };
    items: {
        type: PropType<ToolbarItem[]>;
        default: () => ToolbarItem[];
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    editor: {
        type: PropType<BlockEditor>;
        default: undefined;
    };
    items: {
        type: PropType<ToolbarItem[]>;
        default: () => ToolbarItem[];
    };
}>> & Readonly<{}>, {
    editor: BlockEditor;
    items: ToolbarItem[];
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
