/**
 * Références de fichiers (`asset:42`) : raccourcis des références génériques
 * (refs/refs.ts) pour le schéma des fichiers.
 */
import { listRefIds, parseRef, resolveRefs, toRef, type RefResolver } from '../refs/refs'

export const DEFAULT_SCHEME = 'asset'

export function toAssetRef(id: string, scheme = DEFAULT_SCHEME) {
  return toRef(scheme, id)
}

/** `asset:42` → "42" ; null si ce n'est pas une référence */
export function parseAssetRef(value: string | null | undefined, scheme = DEFAULT_SCHEME): string | null {
  return parseRef(value, scheme)
}

/** Ids de fichiers référencés dans un HTML (ex. pour nettoyer les orphelins) */
export function listAssetIds(html: string, scheme = DEFAULT_SCHEME): string[] {
  return listRefIds(html, scheme)
}

/**
 * Remplace chaque référence `asset:id` par l'URL retournée par `resolve`.
 * Pour plusieurs schémas à la fois (fichiers + liens), voir resolveRefs.
 */
export function resolveAssetRefs(html: string, resolve: RefResolver, scheme = DEFAULT_SCHEME): Promise<string> {
  return resolveRefs(html, { [scheme]: resolve })
}
