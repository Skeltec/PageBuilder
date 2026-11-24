import { type PropType } from 'vue';
/**
 * Panneau latéral repliable : conteneur pour BlockLibrary, BlockSettings ou
 * vos propres composants (slot par défaut). Slot `header` pour remplacer le titre.
 *
 *   <Sidebar title="Blocs" persist-key="left"><BlockLibrary /></Sidebar>
 */
export declare const Sidebar: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    /** Côté de l'éditeur : oriente le bouton et le rail replié */
    side: {
        type: PropType<'left' | 'right'>;
        default: string;
    };
    title: {
        type: StringConstructor;
        default: string;
    };
    collapsible: {
        type: BooleanConstructor;
        default: boolean;
    };
    /** État replié (v-model:collapsed) ; sinon géré en interne */
    collapsed: {
        type: BooleanConstructor;
        default: undefined;
    };
    /** Clé localStorage pour mémoriser l'état replié */
    persistKey: {
        type: StringConstructor;
        default: undefined;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    'update:collapsed': (_value: boolean) => true;
}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    /** Côté de l'éditeur : oriente le bouton et le rail replié */
    side: {
        type: PropType<'left' | 'right'>;
        default: string;
    };
    title: {
        type: StringConstructor;
        default: string;
    };
    collapsible: {
        type: BooleanConstructor;
        default: boolean;
    };
    /** État replié (v-model:collapsed) ; sinon géré en interne */
    collapsed: {
        type: BooleanConstructor;
        default: undefined;
    };
    /** Clé localStorage pour mémoriser l'état replié */
    persistKey: {
        type: StringConstructor;
        default: undefined;
    };
}>> & Readonly<{
    "onUpdate:collapsed"?: ((_value: boolean) => any) | undefined;
}>, {
    side: "left" | "right";
    title: string;
    collapsible: boolean;
    collapsed: boolean;
    persistKey: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
