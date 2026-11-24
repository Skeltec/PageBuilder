import { type PropType } from 'vue';
import type { BlockEditor } from '../core/BlockEditor';
import type { BlockDefinition } from '../core/defineBlock';
export type BlockLibraryView = 'list' | 'grid';
/**
 * Librairie de blocs (« librairie de composantes ») : recherche, vue liste
 * (icône + description) ou vignettes. Clic = insertion au curseur ;
 * glisser-déposer dans l'éditeur = insertion à l'endroit du dépôt.
 * Slot `item` ({ block, insert }) pour personnaliser le rendu d'un bloc.
 */
export declare const BlockLibrary: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    editor: {
        type: PropType<BlockEditor>;
        default: undefined;
    };
    /** Vue initiale (défaut : "list") ; le choix de l'utilisateur est mémorisé */
    view: {
        type: PropType<BlockLibraryView>;
        default: undefined;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    insert: (_block: BlockDefinition) => true;
}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    editor: {
        type: PropType<BlockEditor>;
        default: undefined;
    };
    /** Vue initiale (défaut : "list") ; le choix de l'utilisateur est mémorisé */
    view: {
        type: PropType<BlockLibraryView>;
        default: undefined;
    };
}>> & Readonly<{
    onInsert?: ((_block: BlockDefinition) => any) | undefined;
}>, {
    editor: BlockEditor;
    view: BlockLibraryView;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
