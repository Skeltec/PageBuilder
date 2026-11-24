import { type PropType, type VNode } from 'vue';
import type { BlockEditor } from '../core/BlockEditor';
import { type ParamDefinition, type ParamValue } from '../core/defineBlock';
type FocusDefinition = Extract<ParamDefinition, {
    type: 'focus';
}>;
/**
 * Champ de paramètre : nombre (curseur si borné), case à cocher, choix (segmenté ≤ 4 options,
 * sinon liste), image. Un paramètre focus s'affiche dans le champ de son image (cible sur l'aperçu).
 */
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
    /** Requis pour un paramètre image (téléversement via editor.assets) */
    editor: {
        type: PropType<BlockEditor>;
        default: undefined;
    };
    /** Paramètre image : point de cadrage associé (paramètre focus) */
    focus: {
        type: PropType<{
            definition: FocusDefinition;
            value: ParamValue;
        }>;
        default: undefined;
    };
}>, () => VNode | null, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    change: (_value: ParamValue) => true;
    focusChange: (_value: string) => true;
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
    /** Requis pour un paramètre image (téléversement via editor.assets) */
    editor: {
        type: PropType<BlockEditor>;
        default: undefined;
    };
    /** Paramètre image : point de cadrage associé (paramètre focus) */
    focus: {
        type: PropType<{
            definition: FocusDefinition;
            value: ParamValue;
        }>;
        default: undefined;
    };
}>> & Readonly<{
    onChange?: ((_value: ParamValue) => any) | undefined;
    onFocusChange?: ((_value: string) => any) | undefined;
}>, {
    editor: BlockEditor;
    focus: {
        definition: FocusDefinition;
        value: ParamValue;
    };
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
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
export {};
