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
export type RefResolver = (id: string) => string | Promise<string>;
/** Schéma valide : lettres, chiffres, + . - (RFC 3986), commence par une lettre */
export declare function assertScheme(scheme: string): string;
export declare function toRef(scheme: string, id: string): string;
/** `page:42` → "42" ; null si ce n'est pas une référence de ce schéma */
export declare function parseRef(value: string | null | undefined, scheme: string): string | null;
/** Ids référencés dans un HTML pour un schéma (ex. fichiers orphelins, liens sortants) */
export declare function listRefIds(html: string, scheme: string): string[];
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
export declare function resolveRefs(html: string, resolvers: Record<string, RefResolver>): Promise<string>;
