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
 *   - Paramètre image : seulement en src entier d'un <img> vide du template
 *     (<img src="{photo}" class="…" />). Valeur : référence (`asset:42`) ou
 *     URL http(s) ; vide → <img> sans src (à masquer en CSS à la lecture).
 *   - Paramètre focus : point de cadrage d'un paramètre image (`image: "photo"`),
 *     valeur "x% y%" (0–100). Choisi en cliquant sur l'aperçu de l'image ;
 *     s'utilise en style : <img src="{photo}" style="object-position: {cadrage}" />.
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
// Les valeurs possibles sont toujours bornées (nombre, liste blanche, booléen,
// référence de fichier ou URL http(s) validée).
export type ParamDefinition =
  | { type: 'number'; label?: string; default: number; min?: number; max?: number; step?: number }
  | { type: 'select'; label?: string; default: string; options: Record<string, string> }
  | { type: 'boolean'; label?: string; default: boolean; on?: string; off?: string }
  | { type: 'image'; label?: string }
  /** Point de cadrage ("x% y%") de l'image du paramètre `image`, choisi sur son aperçu */
  | { type: 'focus'; label?: string; image: string; default?: string }

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
  /** <img> du template : nœud feuille, sans contenu éditable */
  leaf?: boolean
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
    extensions: parts.map((p) => toExtension(p, params, name)),
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
    if (def.type === 'focus' && params[def.image]?.type !== 'image') {
      throw new Error(`[${blockName}] ${key} : image="${def.image}" doit nommer un paramètre image`)
    }
  }
}

function compile(el: Element, ctx: Context, typeName: string, isRoot: boolean): TemplatePart {
  const { blockName } = ctx
  if (el.tagName in SLOT_TAGS || el.tagName === BLOCK_TAG || el.tagName === REPEAT_TAG) {
    throw new Error(`[${blockName}] <${el.tagName} /> doit être enveloppé dans un élément HTML`)
  }

  const isImg = el.tagName === 'img'
  const attrs: Record<string, string> = {}
  for (const a of Array.from(el.attributes)) {
    for (const [, ref] of a.value.matchAll(/\{(\w+)\}/g)) {
      if (!(ref in ctx.params)) throw new Error(`[${blockName}] {${ref}} : paramètre non déclaré`)
      if (ctx.params[ref].type === 'image' && !(isImg && a.name === 'src' && a.value === `{${ref}}`)) {
        throw new Error(`[${blockName}] {${ref}} : un paramètre image s'utilise seul, en src d'un <img>`)
      }
    }
    attrs[a.name] = a.value
  }

  if (isImg) {
    const src = /^\{(\w+)\}$/.exec(attrs.src ?? '')
    if (!src || ctx.params[src[1]].type !== 'image') {
      throw new Error(`[${blockName}] <img> : src="{param}" requis (paramètre image)`)
    }
    if (isRoot) throw new Error(`[${blockName}] <img> ne peut pas être la racine du template`)
    if (el.childNodes.length) throw new Error(`[${blockName}] <img> doit être vide`)
    return { typeName, tag: 'img', attrs, isRoot, leaf: true, children: [] }
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

const FOCUS_CENTER = '50% 50%'

function defaultOf(def: ParamDefinition): ParamValue {
  if (def.type === 'image') return ''
  if (def.type === 'focus') return safeFocusValue(def.default) || FOCUS_CENTER
  return def.default
}

/** Point de cadrage "x% y%", entiers bornés à 0–100 ; '' si invalide */
export function safeFocusValue(value: unknown): string {
  const m = typeof value === 'string' ? /^\s*(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/.exec(value) : null
  if (!m) return ''
  const clamp = (n: string) => Math.min(100, Math.max(0, Math.round(Number(n))))
  return `${clamp(m[1])}% ${clamp(m[2])}%`
}

export function paramDefaults(defs: Record<string, ParamDefinition>): BlockParams {
  return Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, defaultOf(d)]))
}

/**
 * Valeur d'un paramètre image : référence `schéma:id` (asset:42) ou URL
 * http(s) / relative. Refuse javascript:, data:, etc. et tout caractère
 * pouvant sortir de l'attribut.
 */
export function safeImageValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  const v = value.trim()
  if (!v || /[\s"'<>`\\]/.test(v)) return ''
  if (v.startsWith('/') && !v.startsWith('//')) return v
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1].toLowerCase()
  if (!scheme || ['javascript', 'vbscript', 'data', 'file', 'blob', 'about'].includes(scheme)) return ''
  return v
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
    } else if (def.type === 'image') {
      out[key] = safeImageValue(v)
    } else if (def.type === 'focus') {
      out[key] = safeFocusValue(v) || defaultOf(def)
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
      .replace(/\{(\w+)\}/g, (_, key: string) => resolveParam(defs[key], params[key] ?? defaultOf(defs[key])))
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

function toExtension(part: TemplatePart, defs: Record<string, ParamDefinition>, rootName: string): Node {
  if (part.leaf) return toImageExtension(part, defs, rootName)

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
    if (p.leaf) return { type: p.typeName }
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
  if (part.slot || part.leaf) return out

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

/**
 * <img src="{param}"> du template : feuille non éditable. Dans l'éditeur, le
 * src passe par le resolveSrc du nœud "image" (références `asset:id`) ; un
 * clic sélectionne le bloc, dont le panneau permet de choisir l'image.
 */
function toImageExtension(part: TemplatePart, defs: Record<string, ParamDefinition>, rootName: string): Node {
  const defaults = paramDefaults(defs)
  const paramsOf = (attrs: Record<string, unknown>) => (attrs.params as BlockParams | undefined) ?? defaults
  const render = (params: BlockParams) => {
    const attrs = interpolate(part.attrs, defs, params)
    if (!attrs.src) delete attrs.src
    return attrs
  }

  return Node.create({
    name: part.typeName,
    group: STRUCTURE_GROUP,
    atom: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return {
        params: {
          default: defaults,
          rendered: false,
          parseHTML: (el: HTMLElement) => readParams(el, defs),
        },
      }
    },

    parseHTML() {
      return [{ tag: `img[data-type="${part.typeName}"]`, priority: 100 }]
    },

    renderHTML({ node }) {
      return ['img', mergeAttributes(render(paramsOf(node.attrs)), { 'data-type': part.typeName })]
    },

    addNodeView() {
      return ({ node, editor, getPos }) => {
        const img = document.createElement('img')
        img.setAttribute('data-type', part.typeName)
        img.draggable = false
        const image = editor.extensionManager.extensions.find((e) => e.name === 'image')
        const resolveSrc = (image?.options as { resolveSrc?: (src: string) => string | Promise<string> } | undefined)
          ?.resolveSrc ?? ((src: string) => src)

        let token = 0
        const apply = (params: BlockParams) => {
          const attrs = render(params)
          for (const a of Array.from(img.attributes)) {
            if (a.name !== 'data-type' && a.name !== 'src' && !(a.name in attrs)) img.removeAttribute(a.name)
          }
          for (const [k, v] of Object.entries(attrs)) if (k !== 'src') img.setAttribute(k, v)
          img.classList.toggle('is-unset', !attrs.src)
          img.classList.remove('is-broken')
          const current = ++token
          if (!attrs.src) {
            img.removeAttribute('src')
            return
          }
          void Promise.resolve(resolveSrc(attrs.src))
            .then((url) => current === token && img.setAttribute('src', url))
            .catch(() => current === token && img.classList.add('is-broken'))
        }
        apply(paramsOf(node.attrs))

        // Clic sur l'image : sélectionne le bloc racine (panneau de paramètres)
        img.addEventListener('mousedown', (e) => {
          const pos = getPos()
          if (pos === undefined) return
          const $pos = editor.state.doc.resolve(pos)
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type.name === rootName) {
              e.preventDefault()
              editor.chain().focus().setNodeSelection($pos.before(d)).run()
              return
            }
          }
        })

        return {
          dom: img,
          update: (updated) => {
            if (updated.type !== node.type) return false
            apply(paramsOf(updated.attrs))
            return true
          },
          ignoreMutation: () => true,
        }
      }
    },
  })
}
