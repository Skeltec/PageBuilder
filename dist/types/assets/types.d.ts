/**
 * Module de fichiers (images, pièces jointes) — fourni par l'application.
 *
 * Le contenu sauvegardé ne contient jamais d'URL absolue de fichier téléversé,
 * seulement une référence relative à un id : `asset:42` (dans src / href).
 * L'URL réelle est résolue à l'affichage via `resolve(id)` : on peut ainsi
 * changer de CDN, signer les URLs, renommer un bucket… sans toucher au contenu.
 *
 *   const editor = new BlockEditor({
 *     element: '#editor',
 *     assets: {
 *       async upload(file) {
 *         const body = new FormData()
 *         body.append('file', file)
 *         const res = await fetch('/api/files', { method: 'POST', body })
 *         const { id } = await res.json()
 *         return { id }
 *       },
 *       resolve: (id) => `/api/files/${id}`,
 *       accept: 'image/*,application/pdf',
 *     },
 *   })
 */
export interface AssetAdapter {
    /** Téléverse un fichier et retourne sa référence (au minimum son id) */
    upload(file: File, context: AssetUploadContext): Promise<AssetRef>;
    /** id → URL affichable. Peut être asynchrone (URL signée, etc.) */
    resolve(id: string): string | Promise<string>;
    /** Types acceptés, format de l'attribut accept d'un <input type="file"> (défaut : tous) */
    accept?: string;
    /** Taille max en octets (défaut : illimitée) */
    maxSize?: number;
    /** Préfixe des références dans le HTML (défaut : "asset" → `asset:42`) */
    scheme?: string;
}
export interface AssetUploadContext {
    /** Annulé si l'éditeur est détruit pendant l'envoi */
    signal: AbortSignal;
}
export interface AssetRef {
    id: string;
    /** Nom affiché pour un fichier joint (défaut : nom du fichier) */
    name?: string;
}
/** Type de fichier → rendu : image en ligne, sinon lien de téléchargement */
export declare function isImage(file: Pick<File, 'type'>): boolean;
/** Le fichier respecte-t-il `accept` (même syntaxe que <input accept>) ? */
export declare function acceptsFile(accept: string | undefined, file: Pick<File, 'type' | 'name'>): boolean;
