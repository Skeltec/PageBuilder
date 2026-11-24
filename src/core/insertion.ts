import type { NodeType } from '@tiptap/pm/model'
import { NodeSelection, type EditorState } from '@tiptap/pm/state'

export interface InsertionRange {
  from: number
  to: number
}

/**
 * Où insérer un nœud de bloc près de `pos` sans couper le texte : à la place
 * d'un paragraphe vide, sinon juste après le nœud courant, au premier niveau
 * qui accepte ce type (pas dans un titre de Hero, par exemple). En dernier
 * recours : fin du document.
 */
export function insertionRangeAt(state: EditorState, pos: number, type: NodeType): InsertionRange {
  const fits = (at: number) => {
    const $at = state.doc.resolve(at)
    return $at.parent.canReplaceWith($at.index(), $at.index(), type)
  }
  const $from = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)))
  for (let d = $from.depth; d >= 1; d--) {
    const current = $from.node(d)
    const parent = $from.node(d - 1)
    const index = $from.index(d - 1)
    // Paragraphe vide : on le remplace
    if (d === $from.depth && current.isTextblock && !current.content.size
        && parent.canReplaceWith(index, index + 1, type)) {
      return { from: $from.before(d), to: $from.after(d) }
    }
    if (fits($from.after(d))) return { from: $from.after(d), to: $from.after(d) }
  }
  if (fits($from.pos)) return { from: $from.pos, to: $from.pos }
  const end = state.doc.content.size
  return { from: end, to: end }
}

/** Comme insertionRangeAt, à partir de la sélection courante */
export function insertionRange(state: EditorState, type: NodeType): InsertionRange {
  const { selection } = state
  if (selection instanceof NodeSelection) {
    const $to = state.doc.resolve(selection.to)
    if ($to.parent.canReplaceWith($to.index(), $to.index(), type)) return { from: selection.to, to: selection.to }
  }
  return insertionRangeAt(state, selection.from, type)
}
