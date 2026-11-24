import { type PropType, type VNode } from 'vue';
import type { BlockEditor } from '../core/BlockEditor';
import { type ParamDefinition, type ParamValue } from '../core/defineBlock';
/** Champ de paramètre : nombre (curseur si borné), case à cocher, choix (segmenté ≤ 4 options, sinon liste) */
export declare const ParamField: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    name: {
        type: StringConstructor;
        required: true;
    };
    definition: {
        type: PropType<ParamDefinition>;
        required: true;
    };
    value: {
        type: PropType<ParamValue>;
        required: true;
    };
}>, () => VNode, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    change: (_value: ParamValue) => true;
}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    name: {
        type: StringConstructor;
        required: true;
    };
    definition: {
        type: PropType<ParamDefinition>;
        required: true;
    };
    value: {
        type: PropType<ParamValue>;
        required: true;
    };
}>> & Readonly<{
    onChange?: ((_value: ParamValue) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
/**
 * Fenêtre d'édition : paramètres des blocs contenant la sélection, une section
 * par bloc, du plus externe au plus interne (ex. « 3 cartes » puis « Carte »).
 * Slot `empty` : contenu affiché sans bloc sélectionné.
 */
export declare const BlockSettings: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    editor: {
        type: PropType<BlockEditor>;
        default: undefined;
    };
}>, () => VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    editor: {
        type: PropType<BlockEditor>;
        default: undefined;
    };
}>> & Readonly<{}>, {
    editor: BlockEditor;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
