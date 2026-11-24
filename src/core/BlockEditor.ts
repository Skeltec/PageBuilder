import { Editor, Extension, type AnyExtension } from '@tiptap/core'
import StarterKit, { type StarterKitOptions } from '@tiptap/starter-kit'
import { Placeholder, TrailingNode } from '@tiptap/extensions'
import { DOMSerializer, type Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, Selection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { AssetImage } from '../assets/AssetImage'
import { AssetManager, type AssetEvents } from '../assets/AssetManager'
import { resolveAssetRefs } from '../assets/refs'
import type { AssetAdapter } from '../assets/types'
import { isFixedBlock, type BlockDefinition, type BlockParams } from './defineBlock'
import { insertionRange } from './insertion'
import { UnknownBlock } from './unknownBlock'

/**
 * Vue (interface) branchée sur l'éditeur : librairie de blocs, panneau de
 * paramètres, barre d'outils, sidebar… ou la vôtre. Elle n'utilise que l'API
 * publique de BlockEditor et peut donc être remplacée librement.
 *
 * `target` : élément où s'afficher, fourni par un conteneur (ex. Sidebar) ;
 * sinon la vue utilise sa propre option `mount`. Retourne son nettoyage.
 */
export interface BlockEditorView {
  attach(editor: BlockEditor, target?: HTMLElement): void | (() => void)
}

/** @deprecated Renommé BlockEditorView */
export type BlockEditorPlugin = BlockEditorView

/** Un bloc du document, avec sa position (pour setBlockParams, deleteBlockAt…) */
export interface BlockInstance {
  block: BlockDefinition
  pos: number
  node: PMNode
  /** Enfant <Block /> figé dans un autre template */
  fixed: boolean
}

export type BlockLoader = () => Promise<BlockDefinition>

export interface BlockEditorEvents extends AssetEvents {
  /** Le document a changé */
  update: { html: string }
  /** La sélection a changé (utile pour l'état d'une toolbar) */
  selectionUpdate: Record<string, never>
  /** La liste des blocs a changé (bloc async chargé) */
  blocksChange: { blocks: readonly BlockDefinition[] }
}

export type BlockEditorListener<K extends keyof BlockEditorEvents> = (payload: BlockEditorEvents[K]) => void

export interface BlockEditorOptions {
  /** Élément (ou sélecteur CSS) où monter la zone éditable */
  element: HTMLElement | string
  /** Contenu HTML initial */
  content?: string
  /** Blocs disponibles (définis avec defineBlock) */
  blocks?: Iterable<BlockDefinition>
  /** Blocs chargés à la demande, par nom (voir loadBlock) */
  asyncBlocks?: Record<string, BlockLoader>
  /** Extensions Tiptap supplémentaires */
  extensions?: AnyExtension[]
  /** Options de StarterKit, ou false pour fournir ses propres extensions de base */
  starterKit?: Partial<StarterKitOptions> | false
  /** Paragraphe vide forcé en fin de document (défaut : true) */
  trailingNode?: boolean
  /** Placeholders des slots (défaut : true) */
  placeholders?: boolean
  /** Conserver les data-type inconnus en lecture seule (défaut : true) */
  unknownBlocks?: boolean
  /** Classe CSS de la zone éditable (défaut : "rich-content") */
  className?: string
  /** Largeur max du contenu (ex. "48rem"), centré */
  contentWidth?: string
  /** Module de fichiers (upload + résolution des références `asset:id`) */
  assets?: AssetAdapter
  /** Vues à brancher dès la création */
  views?: BlockEditorView[]
  /** Écouteurs d'événements */
  on?: { [K in keyof BlockEditorEvents]?: BlockEditorListener<K> }
}

/**
 * Cœur de l'éditeur de blocs — la seule classe nécessaire. Enveloppe Tiptap,
 * compose les extensions et gère le cycle de vie (un schéma ProseMirror est
 * immuable : charger un bloc async recrée l'instance Tiptap — `tiptap` pointe
 * toujours sur l'instance courante). Aucune interface n'est imposée : les vues
 * (BlockLibrary, BlockSettings, Toolbar, Sidebar… dans le module `ui`) se
 * branchent avec use().
 *
 *   const editor = new BlockEditor({
 *     element: '#editor',
 *     blocks: myBlocks,
 *     content: html,
 *     assets: { upload, resolve: (id) => `/files/${id}` },
 *     on: { update: ({ html }) => save(html) },
 *   })
 *   editor.use(new BlockLibrary({ mount: '#library' }))
 */
export class BlockEditor {
  /** Variante chaînable du constructeur */
  static builder() {
    return new BlockEditorBuilder()
  }

  /** Module de fichiers ; null si aucun AssetAdapter n'est configuré */
  readonly assets: AssetManager | null
  readonly element: HTMLElement

  private instance: Editor
  private readonly blockList: BlockDefinition[]
  private readonly asyncLoaders: Map<string, BlockLoader>
  private readonly cleanups: (() => void)[] = []
  private readonly listeners: { [K in keyof BlockEditorEvents]: Set<BlockEditorListener<K>> } = {
    update: new Set(),
    selectionUpdate: new Set(),
    blocksChange: new Set(),
    uploadStart: new Set(),
    uploadEnd: new Set(),
    uploadError: new Set(),
  }

  constructor(private readonly options: BlockEditorOptions) {
    this.element = resolveElement(options.element)
    if (options.contentWidth !== undefined && !/^[\d.]+(rem|em|px|ch|%)$/.test(options.contentWidth)) {
      throw new Error(`Largeur invalide : ${options.contentWidth}`)
    }

    this.blockList = []
    this.asyncLoaders = new Map()
    for (const b of options.blocks ?? []) {
      if (this.blockList.some((x) => x.name === b.name)) throw new Error(`Bloc "${b.name}" ajouté deux fois`)
      this.blockList.push(b)
    }
    for (const [name, loader] of Object.entries(options.asyncBlocks ?? {})) {
      if (this.blockList.some((x) => x.name === name)) throw new Error(`Bloc "${name}" ajouté deux fois`)
      this.asyncLoaders.set(name, loader)
    }
    assertDependencies(this.blockList)

    this.assets = options.assets
      ? new AssetManager(options.assets, {
          tiptap: () => this.instance,
          emit: (event, payload) => this.emit(event, payload as BlockEditorEvents[typeof event]),
        })
      : null

    for (const [event, listener] of Object.entries(options.on ?? {})) {
      if (listener) this.on(event as keyof BlockEditorEvents, listener as BlockEditorListener<keyof BlockEditorEvents>)
    }

    this.instance = this.createTiptap(options.content ?? '')

    // Contenu centré par margin auto : un clic dans la marge (hors de la zone
    // éditable) place le curseur au point le plus proche du contenu
    const onMarginClick = (e: MouseEvent) => this.focusFromMargin(e)
    this.element.addEventListener('mousedown', onMarginClick)
    this.cleanups.push(() => this.element.removeEventListener('mousedown', onMarginClick))

    for (const view of options.views ?? []) this.use(view)
  }

  /** Instance Tiptap courante (change après un chargement de bloc async) */
  get tiptap(): Editor {
    return this.instance
  }

  /** Blocs disponibles dans le schéma courant */
  get blocks(): readonly BlockDefinition[] {
    return this.blockList
  }

  /** HTML à sauvegarder : les fichiers y sont des références `asset:id` */
  getHTML() {
    return this.instance.getHTML()
  }

  /** HTML avec les références `asset:id` remplacées par leurs URLs (rendu public) */
  async getResolvedHTML() {
    const html = this.getHTML()
    if (!this.assets) return html
    const assets = this.assets
    return resolveAssetRefs(html, (id) => assets.resolveUrl(id), assets.scheme)
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
   * Insère un bloc vide près du curseur, sans couper le texte (voir
   * insertionRange). Le curseur est ensuite placé dans le premier slot.
   */
  insertBlock(name: string) {
    const block = this.getBlock(name)
    if (!block) throw new Error(`Bloc inconnu : ${name}`)
    const { state, view } = this.instance
    const node = state.schema.nodeFromJSON(block.emptyContent())
    const range = insertionRange(state, node.type)

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
   * Charge un bloc déclaré dans asyncBlocks puis recrée l'éditeur pour l'ajouter
   * au schéma. Le contenu passe par getHTML() : les unknownBlock ressortent leur
   * HTML d'origine, reparsé avec le nouveau bloc. Retourne false si aucun loader.
   */
  async loadBlock(name: string) {
    if (this.blockList.some((b) => b.name === name)) return true
    const loader = this.asyncLoaders.get(name)
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
  on<K extends keyof BlockEditorEvents>(event: K, listener: BlockEditorListener<K>) {
    this.listeners[event].add(listener)
    return () => this.off(event, listener)
  }

  off<K extends keyof BlockEditorEvents>(event: K, listener: BlockEditorListener<K>) {
    this.listeners[event].delete(listener)
  }

  /**
   * Branche une vue (BlockLibrary, BlockSettings, Toolbar, Sidebar… ou la
   * vôtre). Retourne la fonction pour la débrancher ; destroy() le fait aussi.
   */
  use(view: BlockEditorView, target?: HTMLElement) {
    const cleanup = view.attach(this, target) ?? (() => {})
    let done = false
    const detach = () => {
      if (done) return
      done = true
      const i = this.cleanups.indexOf(detach)
      if (i >= 0) this.cleanups.splice(i, 1)
      cleanup()
    }
    this.cleanups.push(detach)
    return detach
  }

  destroy() {
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup()
    this.assets?.destroy()
    this.instance.destroy()
    for (const set of Object.values(this.listeners)) set.clear()
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

  /**
   * Clic hors du contenu (marges autour de la zone éditable, ou vide sous le
   * dernier bloc) : curseur au point le plus proche du contenu
   */
  private focusFromMargin(e: MouseEvent) {
    const { view } = this.instance
    if (e.button !== 0 || (e.target !== this.element && e.target !== view.dom)) return
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

  /** StarterKit, avec le lien configuré pour accepter les références `asset:` */
  private starterKit() {
    const options = this.options.starterKit ?? {}
    if (options === false) return []
    const { assets } = this
    if (!assets || options.link === false) return [StarterKit.configure(options)]
    const link = options.link ?? {}
    return [
      StarterKit.configure({
        ...options,
        link: { openOnClick: false, ...link, protocols: [...(link.protocols ?? []), assets.scheme] },
      }),
    ]
  }

  private createTiptap(content: string) {
    const { options, assets } = this
    const placeholders: Record<string, string> = Object.assign({}, ...this.blockList.map((b) => b.placeholders))
    const has = (name: string) => options.extensions?.some((e) => e.name === name)

    return new Editor({
      element: this.element,
      extensions: [
        ...this.starterKit(),
        ...(options.trailingNode === false ? [] : [TrailingNode]),
        ...(options.placeholders === false
          ? []
          : [
              Placeholder.configure({
                showOnlyCurrent: false,
                includeChildren: true,
                placeholder: ({ node }) => placeholders[node.type.name] ?? '',
              }),
            ]),
        ...this.blockList.flatMap((b) => b.extensions),
        ...(options.unknownBlocks === false ? [] : [UnknownBlock.configure({ onRetry: (type) => this.loadBlock(type) })]),
        // Image par défaut, sauf si l'application fournit son propre nœud "image"
        ...(has('image') ? [] : [AssetImage.configure({ resolveSrc: (src) => assets?.resolveSrc(src) ?? src })]),
        ...(assets ? [assets.extension()] : []),
        this.activeBlockExtension(),
        ...(options.extensions ?? []),
      ],
      editorProps: {
        attributes: {
          class: options.className ?? 'rich-content',
          ...(options.contentWidth && { style: `--block-content-width: ${options.contentWidth}` }),
        },
      },
      content,
      onUpdate: () => this.emit('update', { html: this.getHTML() }),
      onSelectionUpdate: () => this.emit('selectionUpdate', {}),
    })
  }
}

function resolveElement(target: HTMLElement | string) {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
  if (!el) throw new Error(`Élément introuvable : ${String(target)}`)
  return el
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
 * Variante chaînable de `new BlockEditor(options)`. Chaque méthode retourne le
 * builder ; build() crée l'éditeur.
 */
export class BlockEditorBuilder {
  private readonly opts: Partial<BlockEditorOptions> & {
    blocks: BlockDefinition[]
    asyncBlocks: Record<string, BlockLoader>
    extensions: AnyExtension[]
    views: BlockEditorView[]
  } = { blocks: [], asyncBlocks: {}, extensions: [], views: [] }
  private readonly subscriptions: ((editor: BlockEditor) => void)[] = []

  /** Élément (ou sélecteur CSS) où monter l'éditeur — obligatoire */
  mount(target: HTMLElement | string) {
    this.opts.element = resolveElement(target)
    return this
  }

  content(html: string) {
    this.opts.content = html
    return this
  }

  block(...blocks: BlockDefinition[]) {
    this.opts.blocks.push(...blocks)
    return this
  }

  blocks(blocks: Iterable<BlockDefinition>) {
    return this.block(...blocks)
  }

  asyncBlock(name: string, loader: BlockLoader) {
    if (name in this.opts.asyncBlocks) throw new Error(`Bloc "${name}" ajouté deux fois`)
    this.opts.asyncBlocks[name] = loader
    return this
  }

  asyncBlocks(loaders: Record<string, BlockLoader>) {
    for (const [name, loader] of Object.entries(loaders)) this.asyncBlock(name, loader)
    return this
  }

  extension(...extensions: AnyExtension[]) {
    this.opts.extensions.push(...extensions)
    return this
  }

  starterKit(options: Partial<StarterKitOptions> | false) {
    this.opts.starterKit = options
    return this
  }

  trailingNode(enabled = true) {
    this.opts.trailingNode = enabled
    return this
  }

  placeholders(enabled = true) {
    this.opts.placeholders = enabled
    return this
  }

  unknownBlocks(enabled = true) {
    this.opts.unknownBlocks = enabled
    return this
  }

  className(cls: string) {
    this.opts.className = cls
    return this
  }

  contentWidth(width: string) {
    this.opts.contentWidth = width
    return this
  }

  /** Module de fichiers (upload + références `asset:id`) */
  assets(adapter: AssetAdapter) {
    this.opts.assets = adapter
    return this
  }

  /** Branche des vues (BlockLibrary, BlockSettings, Toolbar, Sidebar, ou la vôtre) */
  use(...views: BlockEditorView[]) {
    this.opts.views.push(...views)
    return this
  }

  on<K extends keyof BlockEditorEvents>(event: K, listener: BlockEditorListener<K>) {
    this.subscriptions.push((editor) => editor.on(event, listener))
    return this
  }

  onUpdate(listener: BlockEditorListener<'update'>) {
    return this.on('update', listener)
  }

  onSelectionUpdate(listener: BlockEditorListener<'selectionUpdate'>) {
    return this.on('selectionUpdate', listener)
  }

  onBlocksChange(listener: BlockEditorListener<'blocksChange'>) {
    return this.on('blocksChange', listener)
  }

  build(): BlockEditor {
    if (!this.opts.element) throw new Error('build() : appeler mount() avant')
    const { views, ...rest } = this.opts
    const editor = new BlockEditor({ ...rest, element: this.opts.element })
    for (const subscribe of this.subscriptions) subscribe(editor)
    for (const view of views) editor.use(view)
    return editor
  }
}
