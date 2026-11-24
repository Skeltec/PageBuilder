/**
 * Références de fichiers (`asset:42`) : raccourcis des références génériques
 * (refs/refs.ts) pour le schéma des fichiers.
 */
import { type RefResolver } from '../refs/refs';
export declare const DEFAULT_SCHEME = "asset";
export declare function toAssetRef(id: string, scheme?: string): string;
/** `asset:42` → "42" ; null si ce n'est pas une référence */
export declare function parseAssetRef(value: string | null | undefined, scheme?: string): string | null;
/** Ids de fichiers référencés dans un HTML (ex. pour nettoyer les orphelins) */
export declare function listAssetIds(html: string, scheme?: string): string[];
/**
 * Remplace chaque référence `asset:id` par l'URL retournée par `resolve`.
 * Pour plusieurs schémas à la fois (fichiers + liens), voir resolveRefs.
 */
export declare function resolveAssetRefs(html: string, resolve: RefResolver, scheme?: string): Promise<string>;
