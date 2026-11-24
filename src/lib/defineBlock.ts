import { Node, mergeAttributes, type Editor, type JSONContent, type KeyboardShortcutCommand } from '@tiptap/core'

/**
 * Compile un template XML en nœuds Tiptap.
 *
 *   <div class="flex {gap}">
 *     <Repeat count="columns">
 *       <div class="flex-1"><Wysiwyg /></div>
 *     </Repeat>
 *   </div>
 *
 * Chaque élément du template devient un type de nœud ProseMirror :
 *   - la racine         → nœud du groupe "block" (insérable dans le document)
 *   - un élément parent → content = la séquence de ses enfants ("a b")
 *   - un parent d'un slot → zone éditable, selon le slot :
 *       <Wysiwyg />    → "block+"  : contenu riche (paragraphes, titres, listes, blocs…)
 *       <MultiLine />  → "inline*" : texte + marques, Enter = saut de ligne (<br>)
 *       <SingleLine /> → "text*"   : une seule ligne de texte brut, Enter bloqué
 *
 * Les slots acceptent un attribut optionnel placeholder="…".
 *
 * Composition : <Block type="card" /> insère un bloc déjà défini comme enfant
 * fixe (même type de nœud que le bloc autonome, figé à sa place).
 *
 * Paramètres (options.params) :
 *   - {nom} dans un attribut : remplacé par la valeur. Tailwind ne détecte que
 *     les classes écrites en entier : utiliser un select dont les valeurs sont
 *     des classes complètes ("gap-4"), jamais "gap-{n}".
 *   - <Repeat count="nom"> : répète son unique enfant (élément ou <Block />)
 *     selon un paramètre number.
 * Les valeurs sont stockées sur la racine (data-params) et recopiées sur chaque
 * partie du bloc pour que renderHTML reste local au nœud.
 */

type SlotKind = 'rich' | 'multi' | 'single'

const SLOT_TAGS: Record<string, SlotKind> = {
  Wysiwyg: 'rich',
  MultiLine: 'multi',
  SingleLine: 'single',
}

const BLOCK_TAG = 'Block'
const REPEAT_TAG = 'Repeat'

const SLOT_CONTENT: Record<SlotKind, string> = {
  rich: 'block+',
  multi: 'inline*',
  single: 'text*',
}

/**
 * Groupe ProseMirror des parties sans slot (contenu fixe). Un bloc dont le parent
 * est dans ce groupe est un enfant <Block /> figé. Porté par le schéma : aucun
 * état global, plusieurs éditeurs peuvent cohabiter.
 */
const STRUCTURE_GROUP = 'blockStructure'

/**
 * Définitions par nom, pour résoudre <Block type="…" />. Les définitions sont
 * des templates compilés (indépendants de tout éditeur) : un registre global est
 * sans risque, comme customElements.
 */
const registry = new Map<string, BlockDefinition>()

// Pas de type "text" libre : interpolé dans un href/src, ce serait une faille XSS.
// Les valeurs possibles sont toujours bornées (nombre, liste blanche, booléen).
export type ParamDefinition =
  | { type: 'number'; label?: string; default: number; min?: number; max?: number; step?: number }
  | { type: 'select'; label?: string; default: string; options: Record<string, string> }
  | { type: 'boolean'; label?: string; default: boolean; on?: string; off?: string }

export type ParamValue = number | string | boolean
export type BlockParams = Record<string, ParamValue>

export interface BlockOptions {
  label?: string
  /** Texte d'aide affiché dans la librairie et le panneau de paramètres */
  description?: string
  /** SVG inline ou emoji, pour la vue liste */
  icon?: string
  /** URL d'image ; sinon un aperçu est généré à partir du template */
  thumbnail?: string
  params?: Record<string, ParamDefinition>
}

interface BlockRef {
  ref: string
}

interface RepeatPart {
  repeat: string
  item: TemplatePart | BlockRef
}

type TemplateChild = TemplatePart | BlockRef | RepeatPart

interface TemplatePart {
  typeName: string
  tag: string
  /** Valeurs brutes, avec éventuels {param} */
  attrs: Record<string, string>
  isRoot: boolean
  slot?: { kind: SlotKind; placeholder?: string }
  children: TemplateChild[]
}

export interface BlockDefinition {
  name: string
  label: string
  description?: string
  icon?: string
  thumbnail?: string
  params: Record<string, ParamDefinition>
  extensions: Node[]
  /** typeName → placeholder des slots */
  placeholders: Record<string, string>
  /** Blocs référencés par <Block type="…" /> : doivent être dans le même éditeur */
  dependencies: string[]
  /** JSON d'un bloc vide, prêt pour editor.commands.insertContent() */
  emptyContent: () => JSONContent
  /** JSON rempli avec les placeholders, pour les aperçus */
  sampleContent: () => JSONContent
  /** JSON du bloc avec de nouveaux paramètres (ajoute/retire les <Repeat>) */
  applyParams: (node: JSONContent, patch: BlockParams) => JSONContent
}

export function defineBlock(name: string, template: string, options: BlockOptions = {}): BlockDefinition {
  const xml = new DOMParser().parseFromString(
    `<template>${template.trim()}</template>`,
    'application/xml',
  )
  const error = xml.querySelector('parsererror')
  if (error) throw new Error(`[${name}] template XML invalide : ${error.textContent}`)

  const roots = Array.from(xml.documentElement.children)
  if (roots.length !== 1) throw new Error(`[${name}] le template doit avoir un seul élément racine`)

  if (registry.has(name)) throw new Error(`[${name}] bloc déjà défini`)

  const params = options.params ?? {}
  validateParams(name, params)

  const ctx: Context = { blockName: name, params }
  const tree = compile(roots[0], ctx, name, true)
  const parts = flatten(tree)

  const definition: BlockDefinition = {
    name,
    label: options.label ?? name,
    description: options.description,
    icon: options.icon,
    thumbnail: options.thumbnail,
    params,
    extensions: parts.map((p) => toExtension(p, params)),
    placeholders: Object.fromEntries(
      parts.flatMap((p) => (p.slot?.placeholder ? [[p.typeName, p.slot.placeholder]] : [])),
    ),
    dependencies: [...new Set(parts.flatMap((p) => p.children.map(itemOf).filter(isRef).map((c) => c.ref)))],
    emptyContent: () => buildJSON(tree, params, false),
    sampleContent: () => buildJSON(tree, params, true),
    applyParams: (node, patch) => {
      const values = sanitizeParams(params, { ...node.attrs?.params, ...patch })
      return rebuild(tree, node, values, params)
    },
  }
  registry.set(name, definition)
  return definition
}

interface Context {
  blockName: string
  params: Record<string, ParamDefinition>
}

function validateParams(blockName: string, params: Record<string, ParamDefinition>) {
  for (const [key, def] of Object.entries(params)) {
    if (!/^\w+$/.test(key)) throw new Error(`[${blockName}] nom de paramètre invalide : ${key}`)
    if (def.type === 'select' && !(def.default in def.options)) {
      throw new Error(`[${blockName}] ${key} : la valeur par défaut doit faire partie des options`)
    }
  }
}

function compile(el: Element, ctx: Context, typeName: string, isRoot: boolean): TemplatePart {
  const { blockName } = ctx
  if (el.tagName in SLOT_TAGS || el.tagName === BLOCK_TAG || el.tagName === REPEAT_TAG) {
    throw new Error(`[${blockName}] <${el.tagName} /> doit être enveloppé dans un élément HTML`)
  }

  const attrs: Record<string, string> = {}
  for (const a of Array.from(el.attributes)) {
    for (const [, ref] of a.value.matchAll(/\{(\w+)\}/g)) {
      if (!(ref in ctx.params)) throw new Error(`[${blockName}] {${ref}} : paramètre non déclaré`)
    }
    attrs[a.name] = a.value
  }

  const elements = Array.from(el.children)
  const hasText = Array.from(el.childNodes).some(
    (n) => n.nodeType === n.TEXT_NODE && n.textContent?.trim(),
  )
  if (hasText) {
    throw new Error(`[${blockName}] texte statique non supporté dans <${el.tagName}> (POC)`)
  }

  const slotEl = elements.find((c) => c.tagName in SLOT_TAGS)
  if (slotEl && elements.length > 1) {
    throw new Error(`[${blockName}] <${slotEl.tagName} /> doit être le seul enfant de <${el.tagName}>`)
  }
  if (!slotEl && elements.length === 0) {
    throw new Error(`[${blockName}] <${el.tagName}> ne contient aucun slot (POC)`)
  }

  const child = (c: Element, i: number): TemplatePart | BlockRef =>
    c.tagName === BLOCK_TAG ? compileRef(c, blockName) : compile(c, ctx, `${typeName}_${i}`, false)

  return {
    typeName,
    tag: el.tagName,
    attrs,
    isRoot,
    slot: slotEl && {
      kind: SLOT_TAGS[slotEl.tagName],
      placeholder: slotEl.getAttribute('placeholder') ?? undefined,
    },
    children: slotEl
      ? []
      : elements.map((c, i) => (c.tagName === REPEAT_TAG ? compileRepeat(c, i, ctx, child) : child(c, i))),
  }
}

function compileRef(el: Element, blockName: string): BlockRef {
  const ref = el.getAttribute('type')
  if (!ref) throw new Error(`[${blockName}] <${BLOCK_TAG}> requiert un attribut type="…"`)
  if (ref === blockName) throw new Error(`[${blockName}] un bloc ne peut pas se contenir lui-même`)
  if (el.children.length || el.textContent?.trim()) {
    throw new Error(`[${blockName}] <${BLOCK_TAG} type="${ref}"> doit être vide`)
  }
  return { ref }
}

function compileRepeat(
  el: Element,
  index: number,
  ctx: Context,
  child: (c: Element, i: number) => TemplatePart | BlockRef,
): RepeatPart {
  const count = el.getAttribute('count') ?? ''
  if (ctx.params[count]?.type !== 'number') {
    throw new Error(`[${ctx.blockName}] <${REPEAT_TAG} count="${count}"> : paramètre number requis`)
  }
  if (el.children.length !== 1) {
    throw new Error(`[${ctx.blockName}] <${REPEAT_TAG}> doit contenir exactement un élément`)
  }
  // Même index que le <Repeat> : le type de l'élément répété reste stable
  return { repeat: count, item: child(el.children[0], index) }
}

function isRef(c: TemplateChild): c is BlockRef {
  return 'ref' in c
}

function isRepeat(c: TemplateChild): c is RepeatPart {
  return 'repeat' in c
}

function itemOf(c: TemplateChild): TemplatePart | BlockRef {
  return isRepeat(c) ? c.item : c
}

function typeOf(c: TemplatePart | BlockRef) {
  return isRef(c) ? c.ref : c.typeName
}

/** Parties propres à ce bloc ; les <Block /> référencés ont déjà leurs extensions */
function flatten(part: TemplatePart): TemplatePart[] {
  return [
    part,
    ...part.children
      .map(itemOf)
      .filter((c): c is TemplatePart => !isRef(c))
      .flatMap(flatten),
  ]
}

/** Le bloc à `pos` est-il un enfant <Block /> figé dans un autre template ? */
export function isFixedBlock(editor: Pick<Editor, 'state'>, pos: number) {
  const group = editor.state.doc.resolve(pos).parent.type.spec.group ?? ''
  return group.split(' ').includes(STRUCTURE_GROUP)
}

/** Le curseur est-il directement dans un nœud de ce type ? */
function inside(editor: Editor, typeName: string) {
  return editor.state.selection.$from.parent.type.name === typeName
}

export function paramDefaults(defs: Record<string, ParamDefinition>): BlockParams {
  return Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, d.default]))
}

/** Ne garde que des valeurs valides : le HTML chargé n'est pas une source de confiance */
export function sanitizeParams(defs: Record<string, ParamDefinition>, raw: Record<string, unknown> = {}): BlockParams {
  const out: BlockParams = {}
  for (const [key, def] of Object.entries(defs)) {
    const v = raw[key]
    if (def.type === 'number') {
      const n = Number(v)
      out[key] = Number.isFinite(n) && v !== '' && v != null
        ? Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n))
        : def.default
    } else if (def.type === 'select') {
      out[key] = typeof v === 'string' && v in def.options ? v : def.default
    } else {
      out[key] = typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : def.default
    }
  }
  return out
}

function resolveParam(def: ParamDefinition, value: ParamValue) {
  if (def.type === 'boolean') return value ? (def.on ?? '') : (def.off ?? '')
  return String(value)
}

function interpolate(attrs: Record<string, string>, defs: Record<string, ParamDefinition>, params: BlockParams) {
  const out: Record<string, string> = {}
  for (const [name, raw] of Object.entries(attrs)) {
    out[name] = raw
      .replace(/\{(\w+)\}/g, (_, key: string) => resolveParam(defs[key], params[key] ?? defs[key].default))
      .replace(/\s+/g, ' ')
      .trim()
  }
  return out
}

function readParams(el: HTMLElement, defs: Record<string, ParamDefinition>) {
  const root = el.hasAttribute('data-block-root') ? el : el.closest('[data-block-root]')
  try {
    return sanitizeParams(defs, JSON.parse(root?.getAttribute('data-params') ?? '{}'))
  } catch {
    return paramDefaults(defs)
  }
}

function toExtension(part: TemplatePart, defs: Record<string, ParamDefinition>): Node {
  const hasParams = Object.keys(defs).length > 0
  const defaults = paramDefaults(defs)
  const marker = part.isRoot ? { 'data-block-root': '' } : {}
  const slotAttrs = part.slot ? { 'data-slot': part.slot.kind } : {}
  const paramsOf = (attrs: Record<string, unknown>) => (attrs.params as BlockParams | undefined) ?? defaults

  return Node.create({
    name: part.typeName,
    group: [part.isRoot && 'block', !part.slot && STRUCTURE_GROUP].filter(Boolean).join(' ') || undefined,
    content: part.slot
      ? SLOT_CONTENT[part.slot.kind]
      : part.children
          .map((c) => {
            if (!isRepeat(c)) return typeOf(c)
            const def = defs[c.repeat] as Extract<ParamDefinition, { type: 'number' }>
            return `${typeOf(c.item)}{${Math.max(1, def.min ?? 1)},${def.max ?? ''}}`
          })
          .join(' '),
    // SingleLine = texte brut ; MultiLine / Wysiwyg acceptent les marques (gras, italique…)
    marks: part.slot?.kind === 'single' ? '' : undefined,
    // Les sous-parties ne doivent pas être fusionnées/coupées par Backspace/Enter
    isolating: !part.isRoot,
    defining: true,
    draggable: part.isRoot,
    selectable: part.isRoot,

    addAttributes() {
      if (!hasParams) return {}
      return {
        params: {
          default: defaults,
          rendered: false,
          parseHTML: (el: HTMLElement) => readParams(el, defs),
        },
      }
    },

    addKeyboardShortcuts(): Record<string, KeyboardShortcutCommand> {
      if (part.slot?.kind === 'single') {
        // Enter et Shift+Enter ne font rien : une seule ligne
        const block = () => inside(this.editor, part.typeName)
        return { Enter: block, 'Shift-Enter': block }
      }
      if (part.slot?.kind === 'multi') {
        // Enter insère un <br> au lieu de créer un paragraphe.
        // (setHardBreak() refuse les nœuds isolating, d'où la transaction directe)
        return {
          Enter: () =>
            inside(this.editor, part.typeName) &&
            this.editor.commands.command(({ tr, state }) => {
              tr.replaceSelectionWith(state.schema.nodes.hardBreak.create()).scrollIntoView()
              return true
            }),
        }
      }
      return {}
    },

    parseHTML() {
      // Priorité > 50 (défaut) : sinon <h1 data-type="…"> serait capté par Heading,
      // <p data-type="…"> par Paragraph, etc.
      return [{ tag: `${part.tag}[data-type="${part.typeName}"]`, priority: 100 }]
    },

    renderHTML({ node, HTMLAttributes }) {
      const params = paramsOf(node.attrs)
      const paramsAttr = part.isRoot && hasParams ? { 'data-params': JSON.stringify(params) } : {}
      return [
        part.tag,
        mergeAttributes(
          interpolate(part.attrs, defs, params),
          { 'data-type': part.typeName },
          marker,
          slotAttrs,
          paramsAttr,
          HTMLAttributes,
        ),
        0,
      ]
    },

    // Dans l'éditeur seulement : on enveloppe le bloc racine avec une poignée de
    // drag. renderHTML (donc getHTML) reste inchangé.
    addNodeView: part.isRoot
      ? () =>
          ({ node, editor, getPos }) => {
          const dom = document.createElement('div')
          dom.className = 'block-wrapper'
          dom.setAttribute('data-block-root', '')

          // Enfant <Block /> figé : pas de poignée (CSS), et on bloque le drag
          // que ProseMirror démarre quand on tire le bloc par son padding.
          const fixed = () => {
            const pos = getPos()
            return pos !== undefined && isFixedBlock(editor, pos)
          }
          dom.classList.toggle('is-fixed', fixed())
          dom.addEventListener('dragstart', (e) => {
            if (e.target === dom && fixed()) e.preventDefault()
          })

          // Hors contentDOM + draggable : au dragstart, ProseMirror remonte au
          // nœud draggable le plus proche et déplace tout le bloc.
          const handle = document.createElement('div')
          handle.className = 'drag-handle'
          handle.contentEditable = 'false'
          handle.draggable = true
          handle.title = 'Glisser pour déplacer'
          handle.textContent = '⠿'

          const contentDOM = document.createElement(part.tag)
          const applyAttrs = (params: BlockParams) => {
            for (const [k, v] of Object.entries(interpolate(part.attrs, defs, params))) contentDOM.setAttribute(k, v)
          }
          applyAttrs(paramsOf(node.attrs))
          // data-type : mêmes règles CSS (:not([data-type])) que dans le rendu final
          contentDOM.setAttribute('data-type', part.typeName)
          if (part.slot) contentDOM.setAttribute('data-slot', part.slot.kind)

          dom.append(handle, contentDOM)
          return {
            dom,
            contentDOM,
            // Paramètres modifiés : on met à jour les classes sans recréer la vue
            update: (updated) => {
              if (updated.type !== node.type) return false
              applyAttrs(paramsOf(updated.attrs))
              dom.classList.toggle('is-fixed', fixed())
              return true
            },
          }
        }
      : undefined,
  })
}

const SAMPLE_TEXT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'

function buildJSON(part: TemplatePart, defs: Record<string, ParamDefinition>, sample: boolean): JSONContent {
  const defaults = paramDefaults(defs)
  const build = (p: TemplatePart): JSONContent => {
    if (p.slot?.kind === 'rich') {
      return { type: p.typeName, content: [{ type: 'paragraph', ...(sample && textContent(SAMPLE_TEXT)) }] }
    }
    if (p.slot) return { type: p.typeName, ...(sample && textContent(p.slot.placeholder ?? 'Texte')) }
    return { type: p.typeName, content: p.children.flatMap(childJSON) }
  }
  const one = (c: TemplatePart | BlockRef): JSONContent => {
    if (!isRef(c)) return build(c)
    const block = registry.get(c.ref)
    if (!block) throw new Error(`<${BLOCK_TAG} type="${c.ref}"> : bloc inconnu`)
    return sample ? block.sampleContent() : block.emptyContent()
  }
  const childJSON = (c: TemplateChild): JSONContent[] =>
    isRepeat(c) ? Array.from({ length: Number(defaults[c.repeat]) }, () => one(c.item)) : [one(c)]
  return build(part)
}

function textContent(text: string) {
  return { content: [{ type: 'text', text }] }
}

/**
 * Reconstruit le JSON d'un bloc avec de nouveaux paramètres : recopie les
 * valeurs sur chaque partie et ajuste le nombre d'éléments des <Repeat>. Les
 * éléments retirés d'une zone Wysiwyg sont fusionnés dans le dernier conservé ;
 * ailleurs ils sont supprimés (annulable avec Ctrl+Z).
 */
function rebuild(
  part: TemplatePart,
  node: JSONContent,
  params: BlockParams,
  defs: Record<string, ParamDefinition>,
): JSONContent {
  const out: JSONContent = { ...node, attrs: { ...node.attrs, params } }
  if (part.slot) return out

  const kids = node.content ?? []
  const content: JSONContent[] = []
  let i = 0
  const next = (c: TemplatePart | BlockRef) => {
    const kid = kids[i++] ?? emptyItem(c, defs)
    return isRef(c) ? kid : rebuild(c, kid, params, defs)
  }

  for (const child of part.children) {
    if (!isRepeat(child)) {
      content.push(next(child))
      continue
    }
    const type = typeOf(child.item)
    const group: JSONContent[] = []
    while (i < kids.length && kids[i].type === type) group.push(kids[i++])

    const count = Math.max(1, Number(params[child.repeat]))
    const kept = group.slice(0, count)
    const removed = group.slice(count)
    while (kept.length < count) kept.push(emptyItem(child.item, defs))

    const item = child.item
    if (removed.length && !isRef(item) && item.slot?.kind === 'rich') {
      const last = kept[kept.length - 1]
      const extra = removed.flatMap((r) => r.content ?? []).filter((n) => n.content?.length || n.type !== 'paragraph')
      last.content = [...(last.content ?? []).filter((n) => n.content?.length || n.type !== 'paragraph'), ...extra]
      if (!last.content.length) last.content = [{ type: 'paragraph' }]
    }
    content.push(...kept.map((k) => (isRef(item) ? k : rebuild(item, k, params, defs))))
  }
  return { ...out, content }
}

/** Élément neuf ; ses propres <Repeat> sont ensuite ajustés par rebuild() */
function emptyItem(c: TemplatePart | BlockRef, defs: Record<string, ParamDefinition>): JSONContent {
  if (isRef(c)) {
    const block = registry.get(c.ref)
    if (!block) throw new Error(`<${BLOCK_TAG} type="${c.ref}"> : bloc inconnu`)
    return block.emptyContent()
  }
  return buildJSON(c, defs, false)
}
