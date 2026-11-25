import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { insertionRange, insertionRangeAt } from '../core/insertion'
import { DEFAULT_SCHEME, parseAssetRef, toAssetRef } from './refs'
import { acceptsFile, isImage, type AssetAdapter, type AssetRef } from './types'

/** `accept` ne vise que des images (image/*, image/png…) */
const onlyImages = (accept: string | undefined) =>
  !!accept?.trim() && accept.split(',').every((rule) => rule.trim().toLowerCase().startsWith('image/'))

/** Événements émis pendant un téléversement (relayés par BlockEditor) */
export interface AssetEvents {
  uploadStart: { file: File }
  uploadEnd: { file: File; ref: AssetRef }
  /** stage "validation" : refusé avant l'envoi (accept, maxSize), sans uploadStart */
  uploadError: { file: File; error: unknown; stage: 'validation' | 'upload' }
}

interface Host {
  /** Instance Tiptap courante (peut changer : chargement de bloc async) */
  tiptap(): Editor
  emit<K extends keyof AssetEvents>(event: K, payload: AssetEvents[K]): void
}

/** Positions des fichiers joints en cours d'envoi, suivies au fil des modifications */
const pendingKey = new PluginKey<Map<string, number>>('assetPending')

/**
 * Gère les fichiers de l'éditeur : téléversement (bouton, coller, glisser-
 * déposer), insertion (image ou lien) et résolution des références `asset:id`.
 * Accessible via `editor.assets` quand un AssetAdapter est configuré.
 */
export class AssetManager {
  readonly scheme: string
  private readonly urls = new Map<string, Promise<string>>()
  private readonly abort = new AbortController()

  /** @internal Créé par BlockEditor */
  constructor(
    private readonly adapter: AssetAdapter,
    private readonly host: Host,
  ) {
    this.scheme = adapter.scheme ?? DEFAULT_SCHEME
  }

  get accept() {
    return this.adapter.accept
  }

  /** Référence à stocker dans le HTML pour cet id (`asset:42`) */
  ref(id: string) {
    return toAssetRef(id, this.scheme)
  }

  /** id → URL (mise en cache ; une erreur n'est pas mise en cache) */
  resolveUrl(id: string): Promise<string> {
    let url = this.urls.get(id)
    if (!url) {
      url = Promise.resolve(this.adapter.resolve(id))
      url.catch(() => this.urls.delete(id))
      this.urls.set(id, url)
    }
    return url
  }

  /** src / href quelconque → URL affichable (les URLs normales passent telles quelles) */
  resolveSrc(src: string): string | Promise<string> {
    const id = parseAssetRef(src, this.scheme)
    return id ? this.resolveUrl(id) : src
  }

  /**
   * Ouvre le sélecteur de fichiers puis téléverse et insère ; [] si annulé.
   * Avec `adapter.pick` : choisit des fichiers existants et les insère.
   */
  async pickFiles({ accept = this.adapter.accept, multiple = true }: { accept?: string; multiple?: boolean } = {}) {
    if (this.adapter.pick) {
      const refs = (await this.adapter.pick({ accept, multiple, current: null })) ?? []
      const chosen = multiple ? refs : refs.slice(0, 1)
      this.insert(chosen, undefined, accept)
      return chosen
    }
    return new Promise<AssetRef[]>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = multiple
      if (accept) input.accept = accept
      input.addEventListener('change', () => resolve(this.upload(Array.from(input.files ?? []))))
      input.addEventListener('cancel', () => resolve([]))
      input.click()
    })
  }

  /**
   * Ouvre le sélecteur, téléverse un seul fichier et retourne sa référence
   * (`asset:42`) sans rien insérer : valeur d'un paramètre image de bloc.
   * null si annulé ou refusé (uploadError émis).
   * Avec `adapter.pick` : choisit un fichier existant ; `current` (référence ou
   * URL actuelle) lui est transmis pour présélection.
   */
  async pickRef({ accept = 'image/*', current = null }: { accept?: string; current?: string | null } = {}) {
    if (this.adapter.pick) {
      const refs = await this.adapter.pick({ accept, multiple: false, current: parseAssetRef(current, this.scheme) })
      return refs?.length ? this.ref(refs[0].id) : null
    }
    return new Promise<string | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        resolve(file ? this.uploadRef(file) : null)
      })
      input.addEventListener('cancel', () => resolve(null))
      input.click()
    })
  }

  /**
   * Insère des fichiers déjà téléversés (ex. choisis dans une médiathèque) :
   * images en bloc <img> (alt de la référence), autres fichiers en lien.
   * Image ou lien selon `ref.type`, à défaut selon `accept`. `at` : position
   * d'insertion (défaut : curseur).
   */
  insert(refs: Iterable<AssetRef>, at?: number, accept?: string) {
    let pos = at
    for (const ref of refs) {
      const image = ref.type ? ref.type.startsWith('image/') : onlyImages(accept)
      pos = image ? this.insertImage(ref, pos) : this.insertLink(this.ref(ref.id), ref.name ?? ref.id, pos)
    }
  }

  /** Téléverse un fichier sans l'insérer ; retourne sa référence, null si refusé ou en erreur */
  async uploadRef(file: File): Promise<string | null> {
    const problem = this.validate(file)
    if (problem) {
      this.host.emit('uploadError', { file, error: new Error(problem), stage: 'validation' })
      return null
    }
    this.host.emit('uploadStart', { file })
    try {
      const ref = await this.adapter.upload(file, { signal: this.abort.signal })
      if (this.abort.signal.aborted) return null
      this.host.emit('uploadEnd', { file, ref })
      return this.ref(ref.id)
    } catch (error) {
      if (!this.abort.signal.aborted) this.host.emit('uploadError', { file, error, stage: 'upload' })
      return null
    }
  }

  /**
   * Téléverse et insère des fichiers : images en bloc <img>, autres fichiers en
   * lien. `at` : position d'insertion (défaut : curseur). Les fichiers refusés
   * (accept, maxSize) émettent uploadError.
   */
  async upload(files: Iterable<File>, at?: number): Promise<AssetRef[]> {
    const editor = this.host.tiptap()
    let pos = at ?? editor.state.selection.from
    const jobs: Promise<AssetRef | null>[] = []

    for (const file of files) {
      const problem = this.validate(file)
      if (problem) {
        this.host.emit('uploadError', { file, error: new Error(problem), stage: 'validation' })
        continue
      }
      const token = Math.random().toString(36).slice(2, 10)
      pos = isImage(file) ? this.insertImagePlaceholder(file, token, pos) : this.trackPending(token, pos)
      jobs.push(this.send(file, token))
    }
    const refs = await Promise.all(jobs)
    return refs.filter((r): r is AssetRef => r !== null)
  }

  /** @internal Extension : coller / déposer des fichiers, suivi des positions */
  extension() {
    const manager = this
    return Extension.create({
      name: 'assetUpload',
      addProseMirrorPlugins: () => [
        new Plugin<Map<string, number>>({
          key: pendingKey,
          state: {
            init: () => new Map(),
            apply(tr, value) {
              const meta = tr.getMeta(pendingKey) as { add?: [string, number]; remove?: string } | undefined
              if (!tr.docChanged && !meta) return value
              const next = new Map<string, number>()
              for (const [k, p] of value) next.set(k, tr.mapping.map(p))
              if (meta?.add) next.set(...meta.add)
              if (meta?.remove) next.delete(meta.remove)
              return next
            },
          },
          props: {
            handlePaste(_view, event) {
              const files = Array.from(event.clipboardData?.files ?? [])
              if (!files.length) return false
              void manager.upload(files)
              return true
            },
            handleDrop(view, event, _slice, moved) {
              const files = Array.from(event.dataTransfer?.files ?? [])
              if (moved || !files.length) return false
              event.preventDefault()
              const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
              void manager.upload(files, hit?.pos)
              return true
            },
          },
        }),
      ],
    })
  }

  /** @internal */
  destroy() {
    this.abort.abort()
  }

  private validate(file: File) {
    if (!acceptsFile(this.adapter.accept, file)) return `Type de fichier refusé : ${file.name}`
    if (this.adapter.maxSize !== undefined && file.size > this.adapter.maxSize) {
      return `Fichier trop volumineux : ${file.name}`
    }
    return null
  }

  private async send(file: File, token: string): Promise<AssetRef | null> {
    this.host.emit('uploadStart', { file })
    try {
      const ref = await this.adapter.upload(file, { signal: this.abort.signal })
      if (this.abort.signal.aborted) return null
      if (isImage(file)) this.finishImage(token, this.ref(ref.id))
      else this.insertFileLink(token, this.ref(ref.id), ref.name ?? file.name)
      this.host.emit('uploadEnd', { file, ref })
      return ref
    } catch (error) {
      if (this.abort.signal.aborted) return null
      if (isImage(file)) this.removeImage(token)
      else this.untrack(token)
      this.host.emit('uploadError', { file, error, stage: 'upload' })
      return null
    }
  }

  /** Image affichée tout de suite (blob:), en attente de son id ; retourne la position suivante */
  private insertImagePlaceholder(file: File, token: string, pos: number) {
    const { state, view } = this.host.tiptap()
    const type = state.schema.nodes.image
    const node = type.create({ src: URL.createObjectURL(file), alt: file.name, uploadId: token })
    const range = insertionRangeAt(state, pos, type)
    const tr = state.tr.replaceWith(range.from, range.to, node)
    view.dispatch(tr.scrollIntoView())
    return range.from + node.nodeSize
  }

  /** Image déjà téléversée ; retourne la position suivante */
  private insertImage(ref: AssetRef, pos?: number) {
    const { state, view } = this.host.tiptap()
    const type = state.schema.nodes.image
    const node = type.create({ src: this.ref(ref.id), alt: ref.alt ?? ref.name ?? '' })
    const range = pos === undefined ? insertionRange(state, type) : insertionRangeAt(state, pos, type)
    view.dispatch(state.tr.replaceWith(range.from, range.to, node).scrollIntoView())
    return range.from + node.nodeSize
  }

  private findImage(token: string) {
    const { state } = this.host.tiptap()
    let found: { pos: number; src: string } | null = null
    state.doc.descendants((node, pos) => {
      if (found) return false
      if (node.type.name === 'image' && node.attrs.uploadId === token) found = { pos, src: node.attrs.src }
    })
    return found as { pos: number; src: string } | null
  }

  private finishImage(token: string, ref: string) {
    const found = this.findImage(token)
    if (!found) return
    const { state, view } = this.host.tiptap()
    const node = state.doc.nodeAt(found.pos)!
    view.dispatch(state.tr.setNodeMarkup(found.pos, undefined, { ...node.attrs, src: ref, uploadId: null }))
    // Garde l'aperçu local le temps que l'URL résolue soit chargée
    setTimeout(() => URL.revokeObjectURL(found.src), 30_000)
  }

  private removeImage(token: string) {
    const found = this.findImage(token)
    if (!found) return
    const { state, view } = this.host.tiptap()
    view.dispatch(state.tr.delete(found.pos, found.pos + state.doc.nodeAt(found.pos)!.nodeSize))
    URL.revokeObjectURL(found.src)
  }

  /** Mémorise la position d'un fichier joint ; retourne la position suivante */
  private trackPending(token: string, pos: number) {
    const { state, view } = this.host.tiptap()
    view.dispatch(state.tr.setMeta(pendingKey, { add: [token, pos] }))
    return pos
  }

  private untrack(token: string) {
    const { state, view } = this.host.tiptap()
    view.dispatch(state.tr.setMeta(pendingKey, { remove: token }))
  }

  /** Lien d'un fichier en cours d'envoi, à la position suivie */
  private insertFileLink(token: string, ref: string, name: string) {
    const { state } = this.host.tiptap()
    const tracked = pendingKey.getState(state)?.get(token)
    this.insertLink(ref, name, tracked, token)
  }

  /**
   * Lien vers le fichier : dans le texte si la position est dans un paragraphe,
   * sinon nouveau paragraphe ; retourne la position suivante.
   */
  private insertLink(ref: string, name: string, at?: number, token?: string) {
    const editor = this.host.tiptap()
    const { state, view, schema } = editor
    const pos = Math.min(at ?? state.selection.from, state.doc.content.size)
    const link = schema.marks.link
    const text = schema.text(name, link ? [link.create({ href: ref })] : [])

    const $pos = state.doc.resolve(pos)
    const tr = token ? state.tr.setMeta(pendingKey, { remove: token }) : state.tr
    let next: number
    if ($pos.parent.inlineContent && (!link || $pos.parent.type.allowsMarkType(link))) {
      tr.insert(pos, text)
      next = pos + text.nodeSize
    } else {
      const paragraph = schema.nodes.paragraph.create(null, text)
      const range = at === undefined ? insertionRange(state, paragraph.type) : insertionRangeAt(state, pos, paragraph.type)
      tr.replaceWith(range.from, range.to, paragraph)
      next = range.from + paragraph.nodeSize
    }
    view.dispatch(tr.scrollIntoView())
    return next
  }
}
