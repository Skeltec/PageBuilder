import type { NodeType } from '@tiptap/pm/model';
import { type EditorState } from '@tiptap/pm/state';
export interface InsertionRange {
    from: number;
    to: number;
}
/**
 * Où insérer un nœud de bloc près de `pos` sans couper le texte : à la place
 * d'un paragraphe vide, sinon juste après le nœud courant, au premier niveau
 * qui accepte ce type (pas dans un titre de Hero, par exemple). En dernier
 * recours : fin du document.
 */
export declare function insertionRangeAt(state: EditorState, pos: number, type: NodeType): InsertionRange;
/** Comme insertionRangeAt, à partir de la sélection courante */
export declare function insertionRange(state: EditorState, type: NodeType): InsertionRange;
