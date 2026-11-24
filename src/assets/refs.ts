/**
 * Références de fichiers dans le HTML : `asset:42` dans src / href.
 *
 * Fonctions sans DOM : utilisables côté serveur (rendu public, SSR) pour
 * remplacer les références par les URLs réelles.
 */

export const DEFAULT_SCHEME = 'asset'

export function toAssetRef(id: string, scheme = DEFAULT_SCHEME) {
  return `${scheme}:${encodeURIComponent(id)}`
}

/** `asset:42` → "42" ; null si ce n'est pas une référence */
export function parseAssetRef(value: string | null | undefined, scheme = DEFAULT_SCHEME): string | null {
  if (!value?.startsWith(`${scheme}:`)) return null
  try {
    return decodeURIComponent(value.slice(scheme.length + 1)) || null
  } catch {
    return null
  }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Ids référencés dans un HTML (ex. pour nettoyer les fichiers orphelins) */
export function listAssetIds(html: string, scheme = DEFAULT_SCHEME): string[] {
  const ids = new Set<string>()
  for (const m of html.matchAll(attrPattern(scheme))) {
    const id = parseAssetRef(`${scheme}:${m[3]}`, scheme)
    if (id) ids.add(id)
  }
  return [...ids]
}

/**
 * Remplace chaque référence `asset:id` (attributs src / href) par l'URL
 * retournée par `resolve`. Pour le rendu public du contenu sauvegardé.
 *
 *   const html = await resolveAssetRefs(saved, (id) => `https://cdn.exemple.com/${id}`)
 */
export async function resolveAssetRefs(
  html: string,
  resolve: (id: string) => string | Promise<string>,
  scheme = DEFAULT_SCHEME,
): Promise<string> {
  const ids = listAssetIds(html, scheme)
  const urls = new Map(await Promise.all(ids.map(async (id) => [id, await resolve(id)] as const)))
  return html.replace(attrPattern(scheme), (whole, attr: string, quote: string, raw: string) => {
    const id = parseAssetRef(`${scheme}:${raw}`, scheme)
    const url = id && urls.get(id)
    return url ? `${attr}=${quote}${escapeAttr(url)}${quote}` : whole
  })
}

function attrPattern(scheme: string) {
  return new RegExp(`\\b(src|href)=(["'])${escapeRegExp(scheme)}:([^"']*)\\2`, 'g')
}
