import type { AssetAdapter } from 'page-builder'

/**
 * Module de fichiers factice : garde les fichiers en mémoire (blob:) avec un
 * délai simulé. En vrai : POST vers votre API, et resolve(id) → URL du CDN.
 * Le HTML sauvegardé ne contient que des références `asset:<id>`.
 */
const files = new Map<string, string>()
const library = new Map<string, { name: string; type: string; alt?: string }>()
let nextId = 1

/** Médiathèque factice (démo avec `?mediatheque`) : une image d'exemple */
const sample = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#6366f1"/></svg>`
files.set('exemple', `data:image/svg+xml,${encodeURIComponent(sample)}`)
library.set('exemple', { name: 'Exemple', type: 'image/svg+xml', alt: 'Rectangle indigo' })
library.set('guide', { name: 'Guide.pdf', type: 'application/pdf' })

export const assets: AssetAdapter = {
  async upload(file, { signal }) {
    await new Promise((r) => setTimeout(r, 800))
    signal.throwIfAborted()
    const id = String(nextId++)
    files.set(id, URL.createObjectURL(file))
    library.set(id, { name: file.name, type: file.type })
    return { id, name: file.name }
  },
  // Fichier inconnu de ce stockage factice : URL de démo
  resolve: (id) => files.get(id) ?? `https://example.com/files/${encodeURIComponent(id)}`,
  maxSize: 10 * 1024 * 1024,
  // Choix dans la médiathèque au lieu du sélecteur natif (boutons, paramètres image)
  pick: new URLSearchParams(location.search).has('mediatheque')
    ? async ({ accept, multiple, current }) => {
        const lines = [...library].map(([id, f]) => `${id} — ${f.name} (${f.type})`).join('\n')
        const answer = prompt(`Médiathèque (${accept ?? 'tous types'}) — id${multiple ? 's séparés par des virgules' : ''} :\n${lines}`, current ?? '')
        if (!answer) return null
        return answer
          .split(',')
          .map((id) => id.trim())
          .filter((id) => library.has(id))
          .map((id) => ({ id, ...library.get(id)! }))
      }
    : undefined,
}
