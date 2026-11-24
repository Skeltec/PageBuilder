import { Node, type Editor, type JSONContent } from '@tiptap/core';
export type ParamDefinition = {
    type: 'number';
    label?: string;
    default: number;
    min?: number;
    max?: number;
    step?: number;
} | {
    type: 'select';
    label?: string;
    default: string;
    options: Record<string, string>;
} | {
    type: 'boolean';
    label?: string;
    default: boolean;
    on?: string;
    off?: string;
};
export type ParamValue = number | string | boolean;
export type BlockParams = Record<string, ParamValue>;
export interface BlockOptions {
    label?: string;
    /** Texte d'aide affiché dans la librairie et le panneau de paramètres */
    description?: string;
    /** SVG inline ou emoji, pour la vue liste */
    icon?: string;
    /** URL d'image ; sinon un aperçu est généré à partir du template */
    thumbnail?: string;
    params?: Record<string, ParamDefinition>;
}
export interface BlockDefinition {
    name: string;
    label: string;
    description?: string;
    icon?: string;
    thumbnail?: string;
    params: Record<string, ParamDefinition>;
    extensions: Node[];
    /** typeName → placeholder des slots */
    placeholders: Record<string, string>;
    /** Blocs référencés par <Block type="…" /> : doivent être dans le même éditeur */
    dependencies: string[];
    /** JSON d'un bloc vide, prêt pour editor.commands.insertContent() */
    emptyContent: () => JSONContent;
    /** JSON rempli avec les placeholders, pour les aperçus */
    sampleContent: () => JSONContent;
    /** JSON du bloc avec de nouveaux paramètres (ajoute/retire les <Repeat>) */
    applyParams: (node: JSONContent, patch: BlockParams) => JSONContent;
}
export declare function defineBlock(name: string, template: string, options?: BlockOptions): BlockDefinition;
/** Le bloc à `pos` est-il un enfant <Block /> figé dans un autre template ? */
export declare function isFixedBlock(editor: Pick<Editor, 'state'>, pos: number): boolean;
export declare function paramDefaults(defs: Record<string, ParamDefinition>): BlockParams;
/** Ne garde que des valeurs valides : le HTML chargé n'est pas une source de confiance */
export declare function sanitizeParams(defs: Record<string, ParamDefinition>, raw?: Record<string, unknown>): BlockParams;
