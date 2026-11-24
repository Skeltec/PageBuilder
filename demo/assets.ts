import type { AssetAdapter } from 'page-builder'

/**
 * Module de fichiers factice : garde les fichiers en mémoire (blob:) avec un
 * délai simulé. En vrai : POST vers votre API, et resolve(id) → URL du CDN.
 * Le HTML sauvegardé ne contient que des références `asset:<id>`.
 */
const files = new Map<string, string>()
let nextId = 1

export const assets: AssetAdapter = {
  async upload(file, { signal }) {
    await new Promise((r) => setTimeout(r, 800))
    signal.throwIfAborted()
    const id = String(nextId++)
    files.set(id, URL.createObjectURL(file))
    return { id, name: file.name }
  },
  // Fichier inconnu de ce stockage factice : URL de démo
  resolve: (id) => files.get(id) ?? `https://example.com/files/${encodeURIComponent(id)}`,
  maxSize: 10 * 1024 * 1024,
}
