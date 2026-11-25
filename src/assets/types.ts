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
  upload(file: File, context: AssetUploadContext): Promise<AssetRef>
  /** id → URL affichable. Peut être asynchrone (URL signée, etc.) */
  resolve(id: string): string | Promise<string>
  /** Types acceptés, format de l'attribut accept d'un <input type="file"> (défaut : tous) */
  accept?: string
  /** Taille max en octets (défaut : illimitée) */
  maxSize?: number
  /** Préfixe des références dans le HTML (défaut : "asset" → `asset:42`) */
  scheme?: string
  /**
   * Choisir des fichiers existants (médiathèque de l'application) au lieu du
   * sélecteur natif : utilisé par `pickFiles` et `pickRef` (boutons, paramètres
   * image de bloc). Coller / glisser-déposer passent toujours par `upload`.
   * null ou [] si annulé. L'application peut y proposer son propre téléversement.
   */
  pick?(options: AssetPickOptions): Promise<AssetRef[] | null>
}

export interface AssetPickOptions {
  /** Types acceptés (syntaxe <input accept>) */
  accept?: string
  /** Plusieurs fichiers permis */
  multiple: boolean
  /** id actuellement choisi (paramètre image de bloc), sinon null */
  current: string | null
}

export interface AssetUploadContext {
  /** Annulé si l'éditeur est détruit pendant l'envoi */
  signal: AbortSignal
}

export interface AssetRef {
  id: string
  /** Nom affiché pour un fichier joint (défaut : nom du fichier) */
  name?: string
  /** Texte alternatif d'une image insérée depuis `pick` */
  alt?: string
  /**
   * Type MIME, pour insérer un fichier choisi par `pick` en image ou en lien.
   * Absent : image si `accept` ne vise que des images, sinon lien.
   */
  type?: string
}

/** Type de fichier → rendu : image en ligne, sinon lien de téléchargement */
export function isImage(file: Pick<File, 'type'>) {
  return file.type.startsWith('image/')
}

/** Le fichier respecte-t-il `accept` (même syntaxe que <input accept>) ? */
export function acceptsFile(accept: string | undefined, file: Pick<File, 'type' | 'name'>) {
  if (!accept?.trim()) return true
  return accept.split(',').some((raw) => {
    const rule = raw.trim().toLowerCase()
    if (!rule) return false
    if (rule.startsWith('.')) return file.name.toLowerCase().endsWith(rule)
    if (rule.endsWith('/*')) return file.type.toLowerCase().startsWith(rule.slice(0, -1))
    return file.type.toLowerCase() === rule
  })
}
