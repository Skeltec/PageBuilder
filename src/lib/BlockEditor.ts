import { Editor, Extension, type AnyExtension } from '@tiptap/core'
import StarterKit, { type StarterKitOptions } from '@tiptap/starter-kit'
import { Placeholder, TrailingNode } from '@tiptap/extensions'
import { DOMSerializer, type Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, Selection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { isFixedBlock, type BlockDefinition, type BlockParams } from './defineBlock'
import { UnknownBlock } from './unknownBlock'

/** Composant branché sur l'éditeur (panneau, toolbar…) ; retourne son nettoyage */
export interface BlockEditorPlugin {
  attach(editor: BlockEditor): void | (() => void)
}

/** Un bloc du document, avec sa position (pour setBlockParams, deleteBlockAt…) */
export interface BlockInstance {
  block: BlockDefinition
  pos: number
  node: PMNode
  /** Enfant <Block /> figé dans un autre template */
  fixed: boolean
}

export type BlockLoader = () => Promise<BlockDefinition>

export interface BlockEditorEvents {
  /** Le document a changé */
  update: { html: string }
  /** La sélection a changé (utile pour l'état d'une toolbar) */
  selectionUpdate: Record<string, never>
  /** La liste des blocs a changé (bloc async chargé) */
  blocksChange: { blocks: readonly BlockDefinition[] }
}

type Listener<K extends keyof BlockEditorEvents> = (payload: BlockEditorEvents[K]) => void

/** Configuration figée produite par le builder */
interface BlockEditorConfig {
  element: HTMLElement
  content: string
  blocks: BlockDefinition[]
  asyncBlocks: Map<string, BlockLoader>
  extensions: AnyExtension[]
  starterKit: Partial<StarterKitOptions> | false
  trailingNode: boolean
  placeholders: boolean
  unknownBlocks: boolean
  editorClass: string
  contentWidth?: string
}

/**
 * Éditeur de blocs : enveloppe Tiptap, compose les extensions et gère le cycle
 * de vie (un schéma ProseMirror est immuable : charger un bloc async recrée
 * l'instance Tiptap — `tiptap` pointe toujours sur l'instance courante).
 *
 *   const editor = BlockEditor.builder()
 *     .mount('#editor')
 *     .blocks(myBlocks)
 *     .asyncBlock('testimonial', () => import('./testimonial').then((m) => m.testimonial))
 *     .content(html)
 *     .onUpdate(({ html }) => save(html))
 *     .build()
 */
export class BlockEditor {
  static builder() {
    return new BlockEditorBuilder()
  }

  private instance: Editor
  private readonly blockList: BlockDefinition[]
  private readonly cleanups: (() => void)[] = []
  private readonly listeners: { [K in keyof BlockEditorEvents]: Set<Listener<K>> } = {
    update: new Set(),
    selectionUpdate: new Set(),
    blocksChange: new Set(),
  }

  /** @internal Passer par BlockEditor.builder() */
  constructor(private readonly config: BlockEditorConfig) {
    this.blockList = [...config.blocks]
    this.instance = this.createTiptap(config.content)

    // Contenu centré par margin auto : un clic dans la marge (hors de la zone
    // éditable) place le curseur au point le plus proche du contenu
    const onMarginClick = (e: MouseEvent) => this.focusFromMargin(e)
    config.element.addEventListener('mousedown', onMarginClick)
    this.cleanups.push(() => config.element.removeEventListener('mousedown', onMarginClick))
  }

  /** Instance Tiptap courante (change après un chargement de bloc async) */
  get tiptap(): Editor {
    return this.instance
  }

  /** Blocs disponibles dans le schéma courant */
  get blocks(): readonly BlockDefinition[] {
    return this.blockList
  }

  getHTML() {
    return this.instance.getHTML()
  }

  /** Remplace le contenu ; ce qui n'est pas dans le schéma devient unknownBlock (ou est ignoré) */
  setContent(html: string, { emitUpdate = true } = {}) {
    this.instance.commands.setContent(html, { emitUpdate })
  }

  getBlock(name: string) {
    return this.blockList.find((b) => b.name === name)
  }

  /**
   * Blocs contenant la sélection, du plus externe au plus interne (un bloc
   * sélectionné comme nœud est inclus).
   */
  selectedBlocks(): BlockInstance[] {
    return this.blocksAtSelection(this.instance.state)
  }

  private blocksAtSelection(state: EditorState): BlockInstance[] {
    const { selection } = state
    const found: BlockInstance[] = []
    const add = (node: PMNode, pos: number) => {
      const block = this.getBlock(node.type.name)
      if (block) found.push({ block, pos, node, fixed: isFixedBlock({ state }, pos) })
    }
    const { $from } = selection
    for (let d = 1; d <= $from.depth; d++) add($from.node(d), $from.before(d))
    if (selection instanceof NodeSelection) add(selection.node, selection.from)
    return found
  }

  /** Modifie les paramètres du bloc à `pos` (sans déplacer le focus) */
  setBlockParams(pos: number, patch: BlockParams) {
    const { state, view } = this.instance
    const node = state.doc.nodeAt(pos)
    const block = node && this.getBlock(node.type.name)
    if (!node || !block) return false

    const updated = state.schema.nodeFromJSON(block.applyParams(node.toJSON(), patch))
    const { selection } = state
    const tr = state.tr.replaceWith(pos, pos + node.nodeSize, updated)

    // Le remplacement perd la sélection : on la remet au même endroit si possible
    if (selection instanceof NodeSelection && selection.from === pos) {
      tr.setSelection(NodeSelection.create(tr.doc, pos))
    } else {
      const end = pos + updated.nodeSize - 1
      const at = Math.min(Math.max(selection.from, pos + 1), end)
      tr.setSelection(Selection.near(tr.doc.resolve(at)))
    }
    view.dispatch(tr)
    return true
  }

  /** Supprime le bloc à `pos` ; refuse un enfant <Block /> figé */
  deleteBlockAt(pos: number) {
    const node = this.instance.state.doc.nodeAt(pos)
    if (!node || isFixedBlock(this.instance, pos)) return false
    return this.instance.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
  }

  /** HTML d'un bloc vide (ou d'exemple), tel que getHTML() le produirait */
  blockHTML(name: string, { sample = false } = {}) {
    const el = document.createElement('div')
    el.append(this.renderBlock(name, { sample }))
    return el.innerHTML
  }

  /** Rendu DOM d'un bloc d'exemple (placeholders en texte), pour les aperçus */
  renderBlock(name: string, { sample = true } = {}) {
    const block = this.getBlock(name)
    if (!block) throw new Error(`Bloc inconnu : ${name}`)
    const { schema } = this.instance
    const node = schema.nodeFromJSON(sample ? block.sampleContent() : block.emptyContent())
    return DOMSerializer.fromSchema(schema).serializeNode(node)
  }

  /**
   * Insère un bloc vide près du curseur, sans couper le texte : à la place d'un
   * paragraphe vide, sinon juste après le nœud courant, au premier niveau qui
   * accepte un bloc (pas dans un titre de Hero, par exemple). Le curseur est
   * ensuite placé dans le premier slot du nouveau bloc.
   */
  insertBlock(name: string) {
    const block = this.getBlock(name)
    if (!block) throw new Error(`Bloc inconnu : ${name}`)
    const { state, view } = this.instance
    const node = state.schema.nodeFromJSON(block.emptyContent())
    const range = insertionRange(state, node)

    const tr = state.tr.replaceWith(range.from, range.to, node)
    tr.setSelection(Selection.near(tr.doc.resolve(range.from + 1)))
    view.dispatch(tr.scrollIntoView())
    view.focus()
    return true
  }

  /**
   * Supprime le bloc le plus proche contenant le curseur. Un enfant <Block />
   * figé ne peut pas être retiré seul : on remonte à son parent.
   */
  deleteCurrentBlock() {
    const { $from } = this.instance.state.selection
    for (let d = $from.depth; d > 0; d--) {
      const name = $from.node(d).type.name
      if (this.blockList.some((b) => b.name === name) && !isFixedBlock(this.instance, $from.before(d))) {
        return this.instance.chain().focus().deleteRange({ from: $from.before(d), to: $from.after(d) }).run()
      }
    }
    return false
  }

  /**
   * Charge un bloc déclaré via asyncBlock() puis recrée l'éditeur pour l'ajouter
   * au schéma. Le contenu passe par getHTML() : les unknownBlock ressortent leur
   * HTML d'origine, reparsé avec le nouveau bloc. Retourne false si aucun loader.
   */
  async loadBlock(name: string) {
    if (this.blockList.some((b) => b.name === name)) return true
    const loader = this.config.asyncBlocks.get(name)
    if (!loader) return false

    const block = await loader()
    if (block.name !== name) throw new Error(`Le loader "${name}" a retourné le bloc "${block.name}"`)
    assertDependencies([...this.blockList, block])
    this.blockList.push(block)

    const html = this.instance.getHTML()
    this.instance.destroy()
    this.instance = this.createTiptap(html)
    this.emit('blocksChange', { blocks: this.blockList })
    this.emit('update', { html: this.getHTML() })
    return true
  }

  /** S'abonne à un événement ; retourne la fonction de désabonnement */
  on<K extends keyof BlockEditorEvents>(event: K, listener: Listener<K>) {
    this.listeners[event].add(listener)
    return () => this.off(event, listener)
  }

  off<K extends keyof BlockEditorEvents>(event: K, listener: Listener<K>) {
    this.listeners[event].delete(listener)
  }

  /** @internal Appelé par le builder */
  attach(plugin: BlockEditorPlugin) {
    const cleanup = plugin.attach(this)
    if (cleanup) this.cleanups.push(cleanup)
  }

  destroy() {
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.instance.destroy()
    for (const set of Object.values(this.listeners)) set.clear()
  }

  /**
   * Clic hors du contenu (marges autour de la zone éditable, ou vide sous le
   * dernier bloc) : curseur au point le plus proche du contenu
   */
  private focusFromMargin(e: MouseEvent) {
    const { view } = this.instance
    if (e.button !== 0 || (e.target !== this.config.element && e.target !== view.dom)) return
    const last = view.dom.lastElementChild
    const rect = view.dom.getBoundingClientRect()
    const bottom = last ? last.getBoundingClientRect().bottom : rect.bottom
    // Clic dans la zone éditable, à hauteur du contenu : comportement natif
    if (e.target === view.dom && e.clientY <= bottom) return
    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min + 1), max - 1)
    const hit = view.posAtCoords({ left: clamp(e.clientX, rect.left, rect.right), top: clamp(e.clientY, rect.top, bottom) })
    if (!hit) return
    e.preventDefault()
    this.instance.chain().setTextSelection(hit.pos).focus().run()
  }

  /** Classe .is-active sur le bloc le plus interne contenant la sélection */
  private activeBlockExtension() {
    const editor = this
    return Extension.create({
      name: 'activeBlock',
      addProseMirrorPlugins: () => [
        new Plugin({
          props: {
            decorations(state) {
              const active = editor.blocksAtSelection(state).at(-1)
              if (!active) return null
              return DecorationSet.create(state.doc, [
                Decoration.node(active.pos, active.pos + active.node.nodeSize, { class: 'is-active' }),
              ])
            },
          },
        }),
      ],
    })
  }

  private emit<K extends keyof BlockEditorEvents>(event: K, payload: BlockEditorEvents[K]) {
    for (const listener of this.listeners[event]) listener(payload)
  }

  private createTiptap(content: string) {
    const { config } = this
    const placeholders: Record<string, string> = Object.assign(
      {},
      ...this.blockList.map((b) => b.placeholders),
    )

    return new Editor({
      element: config.element,
      extensions: [
        ...(config.starterKit === false ? [] : [StarterKit.configure(config.starterKit)]),
        ...(config.trailingNode ? [TrailingNode] : []),
        ...(config.placeholders
          ? [
              Placeholder.configure({
                showOnlyCurrent: false,
                includeChildren: true,
                placeholder: ({ node }) => placeholders[node.type.name] ?? '',
              }),
            ]
          : []),
        ...this.blockList.flatMap((b) => b.extensions),
        ...(config.unknownBlocks ? [UnknownBlock.configure({ onRetry: (type) => this.loadBlock(type) })] : []),
        this.activeBlockExtension(),
        ...config.extensions,
      ],
      editorProps: {
        attributes: {
          class: config.editorClass,
          ...(config.contentWidth && { style: `--block-content-width: ${config.contentWidth}` }),
        },
      },
      content,
      onUpdate: () => this.emit('update', { html: this.getHTML() }),
      onSelectionUpdate: () => this.emit('selectionUpdate', {}),
    })
  }
}

function insertionRange(state: EditorState, node: PMNode) {
  const { selection } = state
  const fits = (pos: number) => {
    const $pos = state.doc.resolve(pos)
    return $pos.parent.canReplaceWith($pos.index(), $pos.index(), node.type)
  }
  if (selection instanceof NodeSelection && fits(selection.to)) return { from: selection.to, to: selection.to }

  const { $from } = selection
  for (let d = $from.depth; d >= 1; d--) {
    const current = $from.node(d)
    const parent = $from.node(d - 1)
    const index = $from.index(d - 1)
    // Paragraphe vide : on le remplace
    if (d === $from.depth && current.isTextblock && !current.content.size
        && parent.canReplaceWith(index, index + 1, node.type)) {
      return { from: $from.before(d), to: $from.after(d) }
    }
    if (fits($from.after(d))) return { from: $from.after(d), to: $from.after(d) }
  }
  const end = state.doc.content.size
  return { from: end, to: end }
}

/** Chaque <Block type="…" /> doit pointer vers un bloc présent dans l'éditeur */
function assertDependencies(blocks: BlockDefinition[]) {
  const names = new Set(blocks.map((b) => b.name))
  for (const block of blocks) {
    const missing = block.dependencies.filter((d) => !names.has(d))
    if (missing.length) {
      throw new Error(`Le bloc "${block.name}" requiert : ${missing.join(', ')} (ajouter via .block())`)
    }
  }
}

/**
 * Builder de BlockEditor. Chaque méthode retourne le builder ; build() valide la
 * configuration et crée l'éditeur.
 */
export class BlockEditorBuilder {
  private element?: HTMLElement
  private initialContent = ''
  private readonly blockMap = new Map<string, BlockDefinition>()
  private readonly asyncBlockMap = new Map<string, BlockLoader>()
  private readonly extraExtensions: AnyExtension[] = []
  private starterKitOptions: Partial<StarterKitOptions> | false = {}
  private withTrailingNode = true
  private withPlaceholders = true
  private withUnknownBlocks = true
  private editorClass = 'rich-content'
  private maxContentWidth?: string
  /** Abonnements à brancher sur l'éditeur une fois construit */
  private readonly subscriptions: ((editor: BlockEditor) => void)[] = []
  private readonly plugins: BlockEditorPlugin[] = []

  /** Élément (ou sélecteur CSS) où monter l'éditeur — obligatoire */
  mount(target: HTMLElement | string) {
    const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
    if (!el) throw new Error(`mount() : élément introuvable (${String(target)})`)
    this.element = el
    return this
  }

  /** Contenu HTML initial */
  content(html: string) {
    this.initialContent = html
    return this
  }

  /** Ajoute un ou plusieurs blocs (définis avec defineBlock) */
  block(...blocks: BlockDefinition[]) {
    for (const b of blocks) {
      if (this.blockMap.has(b.name) || this.asyncBlockMap.has(b.name)) {
        throw new Error(`Bloc "${b.name}" ajouté deux fois`)
      }
      this.blockMap.set(b.name, b)
    }
    return this
  }

  blocks(blocks: Iterable<BlockDefinition>) {
    return this.block(...blocks)
  }

  /**
   * Bloc chargé à la demande : absent du schéma au démarrage, il apparaît en
   * unknownBlock (bouton « Réessayer ») jusqu'à loadBlock(name).
   */
  asyncBlock(name: string, loader: BlockLoader) {
    if (this.blockMap.has(name) || this.asyncBlockMap.has(name)) {
      throw new Error(`Bloc "${name}" ajouté deux fois`)
    }
    this.asyncBlockMap.set(name, loader)
    return this
  }

  asyncBlocks(loaders: Record<string, BlockLoader>) {
    for (const [name, loader] of Object.entries(loaders)) this.asyncBlock(name, loader)
    return this
  }

  /** Extensions Tiptap supplémentaires (marks, nodes, plugins…) */
  extension(...extensions: AnyExtension[]) {
    this.extraExtensions.push(...extensions)
    return this
  }

  /** Options de StarterKit, ou false pour fournir ses propres extensions de base */
  starterKit(options: Partial<StarterKitOptions> | false) {
    this.starterKitOptions = options
    return this
  }

  /** Paragraphe vide forcé en fin de document (défaut : oui) */
  trailingNode(enabled = true) {
    this.withTrailingNode = enabled
    return this
  }

  /** Placeholders des slots (défaut : oui) */
  placeholders(enabled = true) {
    this.withPlaceholders = enabled
    return this
  }

  /** Conserver les data-type inconnus en lecture seule (défaut : oui) ; sinon ils sont perdus */
  unknownBlocks(enabled = true) {
    this.withUnknownBlocks = enabled
    return this
  }

  /** Classe CSS de la zone éditable (défaut : "rich-content") */
  className(cls: string) {
    this.editorClass = cls
    return this
  }

  /**
   * Largeur max du contenu (ex. "48rem"), centré par margin auto. Un clic dans
   * la marge place le curseur au plus proche.
   */
  contentWidth(width: string) {
    if (!/^[\d.]+(rem|em|px|ch|%)$/.test(width)) throw new Error(`Largeur invalide : ${width}`)
    this.maxContentWidth = width
    return this
  }

  /** Branche un composant (BlockLibrary, BlockSettings, ou le vôtre) */
  use(...plugins: BlockEditorPlugin[]) {
    this.plugins.push(...plugins)
    return this
  }

  on<K extends keyof BlockEditorEvents>(event: K, listener: Listener<K>) {
    this.subscriptions.push((editor) => editor.on(event, listener))
    return this
  }

  onUpdate(listener: Listener<'update'>) {
    return this.on('update', listener)
  }

  onSelectionUpdate(listener: Listener<'selectionUpdate'>) {
    return this.on('selectionUpdate', listener)
  }

  onBlocksChange(listener: Listener<'blocksChange'>) {
    return this.on('blocksChange', listener)
  }

  build(): BlockEditor {
    if (!this.element) throw new Error('build() : appeler mount() avant')
    const blocks = [...this.blockMap.values()]
    assertDependencies(blocks)

    const editor = new BlockEditor({
      element: this.element,
      content: this.initialContent,
      blocks,
      asyncBlocks: new Map(this.asyncBlockMap),
      extensions: [...this.extraExtensions],
      starterKit: this.starterKitOptions,
      trailingNode: this.withTrailingNode,
      placeholders: this.withPlaceholders,
      unknownBlocks: this.withUnknownBlocks,
      editorClass: this.editorClass,
      contentWidth: this.maxContentWidth,
    })
    for (const subscribe of this.subscriptions) subscribe(editor)
    for (const plugin of this.plugins) editor.attach(plugin)
    return editor
  }
}
