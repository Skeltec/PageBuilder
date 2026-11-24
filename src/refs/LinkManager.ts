import type { Editor } from '@tiptap/core'
import { assertScheme, parseRef, toRef, type RefResolver } from './refs'

/** Cible choisie par l'application pour un lien interne */
export interface LinkTarget {
  id: string
  /** Texte inséré quand rien n'est sélectionné */
  label: string
}

export interface LinkPickContext {
  /** Id déjà lié à la sélection (modification d'un lien existant), sinon null */
  current: string | null
  /** Texte sélectionné ("" si curseur seul) */
  text: string
}

/**
 * Liens internes vers des entités de l'application (pages, commandes…) — fourni
 * par l'application. Le HTML ne contient que `<schéma>:<id>` ; l'URL est
 * calculée à l'affichage : renommer ou déplacer la cible ne casse pas le lien.
 *
 *   new BlockEditor({
 *     links: [{
 *       scheme: 'page',
 *       label: 'Lien vers une page',
 *       pick: ({ current }) => openPagePicker(current),   // { id, label } | null
 *       resolve: (id) => pageUrl(id),
 *     }],
 *   })
 */
export interface LinkAdapter {
  /** Préfixe dans le HTML : "page" → `href="page:42"` */
  scheme: string
  /** Libellé pour les interfaces de l'application (menu de liens…) */
  label?: string
  /** Ouvre le sélecteur de l'application ; null si annulé */
  pick(context: LinkPickContext): Promise<LinkTarget | null>
  /** id → URL (rendu public, getResolvedHTML). Peut être asynchrone */
  resolve: RefResolver
}

interface Host {
  /** Instance Tiptap courante (peut changer : chargement de bloc async) */
  tiptap(): Editor
}

/**
 * Insère et résout les liens internes. Accessible via `editor.links` quand au
 * moins un LinkAdapter est configuré.
 */
export class LinkManager {
  readonly adapters: readonly LinkAdapter[]

  /** @internal Créé par BlockEditor */
  constructor(
    adapters: LinkAdapter[],
    private readonly host: Host,
  ) {
    const seen = new Set<string>()
    for (const a of adapters) {
      assertScheme(a.scheme)
      if (seen.has(a.scheme)) throw new Error(`Schéma de lien "${a.scheme}" déclaré deux fois`)
      seen.add(a.scheme)
    }
    this.adapters = [...adapters]
  }

  get schemes() {
    return this.adapters.map((a) => a.scheme)
  }

  /** Adaptateur d'un schéma (défaut : le premier) */
  adapter(scheme?: string) {
    const found = scheme === undefined ? this.adapters[0] : this.adapters.find((a) => a.scheme === scheme)
    if (!found) throw new Error(`Aucun lien de schéma "${scheme}"`)
    return found
  }

  /** Référence à stocker dans le HTML (`page:42`) */
  ref(id: string, scheme?: string) {
    return toRef(this.adapter(scheme).scheme, id)
  }

  /** Resolvers par schéma, pour resolveRefs */
  resolvers(): Record<string, RefResolver> {
    return Object.fromEntries(this.adapters.map((a) => [a.scheme, (id: string) => a.resolve(id)]))
  }

  /**
   * Ouvre le sélecteur puis pose le lien : sur la sélection, sur le lien
   * existant sous le curseur, ou en insérant le libellé de la cible.
   * Retourne la cible, ou null si annulé.
   */
  async insert(scheme?: string): Promise<LinkTarget | null> {
    const adapter = this.adapter(scheme)
    const before = this.host.tiptap()
    if (!before.schema.marks.link) throw new Error('Extension Link absente : liens internes impossibles')

    const { from, to } = before.state.selection
    const inLink = before.isActive('link')
    const href: string | undefined = before.getAttributes('link').href
    const current = parseRef(href, adapter.scheme)
    const text = before.state.doc.textBetween(from, to, ' ')

    const target = await adapter.pick({ current, text })
    if (!target) return null

    // Le sélecteur est asynchrone : l'instance a pu être recréée, le document modifié
    const editor = this.host.tiptap()
    const size = editor.state.doc.content.size
    const range = { from: Math.min(from, size), to: Math.min(to, size) }
    const link = { href: toRef(adapter.scheme, target.id) }
    const chain = editor.chain().focus().setTextSelection(range)

    if (range.from !== range.to) chain.setLink(link)
    else if (inLink) chain.extendMarkRange('link').setLink(link)
    else chain.insertContent({ type: 'text', text: target.label, marks: [{ type: 'link', attrs: link }] })
    chain.run()
    return target
  }

  /** Retire le lien sous la sélection */
  remove() {
    this.host.tiptap().chain().focus().extendMarkRange('link').unsetLink().run()
  }

  /** Schéma interne lié à la sélection, ou null */
  activeScheme(): string | null {
    const href: string | undefined = this.host.tiptap().getAttributes('link').href
    return this.adapters.find((a) => parseRef(href, a.scheme) !== null)?.scheme ?? null
  }
}
