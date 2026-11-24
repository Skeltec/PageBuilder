/**
 * Références relatives dans le HTML : `<schéma>:<id>` dans src / href.
 *
 *   <img src="asset:42">            fichier téléversé
 *   <a href="page:9f2c…">           page de l'application
 *
 * Le contenu sauvegardé ne contient que des ids ; l'URL réelle est calculée à
 * l'affichage par le resolver du schéma. Renommer une page, changer de CDN…
 * ne touche pas au contenu.
 *
 * Fonctions sans DOM : utilisables côté serveur (rendu public, SSR).
 */

export type RefResolver = (id: string) => string | Promise<string>

/** Schéma valide : lettres, chiffres, + . - (RFC 3986), commence par une lettre */
export function assertScheme(scheme: string) {
  if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) throw new Error(`Schéma de référence invalide : ${scheme}`)
  return scheme
}

export function toRef(scheme: string, id: string) {
  return `${scheme}:${encodeURIComponent(id)}`
}

/** `page:42` → "42" ; null si ce n'est pas une référence de ce schéma */
export function parseRef(value: string | null | undefined, scheme: string): string | null {
  if (!value?.startsWith(`${scheme}:`)) return null
  try {
    return decodeURIComponent(value.slice(scheme.length + 1)) || null
  } catch {
    return null
  }
}

/** Ids référencés dans un HTML pour un schéma (ex. fichiers orphelins, liens sortants) */
export function listRefIds(html: string, scheme: string): string[] {
  const ids = new Set<string>()
  for (const m of html.matchAll(attrPattern([scheme]))) {
    const id = parseRef(`${scheme}:${m[4]}`, scheme)
    if (id) ids.add(id)
  }
  return [...ids]
}

/**
 * Remplace chaque référence (attributs src / href) par l'URL retournée par le
 * resolver de son schéma. Schémas absents de `resolvers` : laissés tels quels.
 * Un resolver qui retourne "" laisse aussi la référence intacte.
 *
 *   const html = await resolveRefs(saved, {
 *     asset: (id) => `/api/files/${id}`,
 *     page: (id) => router.resolve({ name: 'page', params: { id } }).href,
 *   })
 */
export async function resolveRefs(html: string, resolvers: Record<string, RefResolver>): Promise<string> {
  const schemes = Object.keys(resolvers).map(assertScheme)
  if (!schemes.length) return html

  const urls = new Map<string, string>()
  await Promise.all(
    schemes.flatMap((scheme) =>
      listRefIds(html, scheme).map(async (id) => urls.set(`${scheme}:${id}`, await resolvers[scheme](id))),
    ),
  )
  return html.replace(attrPattern(schemes), (whole, attr: string, quote: string, scheme: string, raw: string) => {
    const id = parseRef(`${scheme}:${raw}`, scheme)
    const url = id && urls.get(`${scheme}:${id}`)
    return url ? `${attr}=${quote}${escapeAttr(url)}${quote}` : whole
  })
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Groupes : 1 attribut, 2 guillemet, 3 schéma, 4 id encodé */
function attrPattern(schemes: string[]) {
  return new RegExp(`\\b(src|href)=(["'])(${schemes.map(escapeRegExp).join('|')}):([^"']*)\\2`, 'g')
}
