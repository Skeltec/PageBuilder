import { Node, mergeAttributes } from '@tiptap/core'

export interface AssetImageOptions {
  /** src (URL ou référence `asset:id`) → URL affichable dans l'éditeur */
  resolveSrc: (src: string) => string | Promise<string>
}

/** Pas de javascript:, vbscript:… dans un src chargé depuis du HTML externe */
function safeSrc(src: string | null) {
  if (!src) return null
  return /^\s*(javascript|vbscript|data:(?!image\/))/i.test(src) ? null : src
}

/**
 * Image (bloc). Le HTML sauvegardé garde le src tel quel — une référence
 * `asset:42` pour un fichier téléversé ; seule la vue dans l'éditeur affiche
 * l'URL résolue.
 */
export const AssetImage = Node.create<AssetImageOptions>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { resolveSrc: (src) => src }
  },

  addAttributes() {
    return {
      src: { default: null, parseHTML: (el) => safeSrc(el.getAttribute('src')) },
      alt: { default: null },
      title: { default: null },
      // Téléversement en cours (src = blob: temporaire) ; rendu pour survivre à
      // une recréation de l'éditeur, retiré une fois le fichier envoyé
      uploadId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-upload-id'),
        renderHTML: (attrs) => (attrs.uploadId ? { 'data-upload-id': attrs.uploadId } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: (el) => (safeSrc(el.getAttribute('src')) ? null : false) }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img')
      let current = node
      const apply = (n: typeof node) => {
        current = n
        img.alt = n.attrs.alt ?? ''
        if (n.attrs.title) img.title = n.attrs.title
        img.classList.toggle('is-uploading', Boolean(n.attrs.uploadId))
        const src: string | null = n.attrs.src
        if (!src) return img.removeAttribute('src')
        Promise.resolve(this.options.resolveSrc(src)).then(
          (url) => {
            // Ignore une résolution arrivée après un changement de src
            if (current.attrs.src === src) img.src = url
          },
          () => img.classList.add('is-broken'),
        )
      }
      apply(node)
      return {
        dom: img,
        update: (updated) => {
          if (updated.type !== node.type) return false
          if (updated.attrs.src !== current.attrs.src || updated.attrs.uploadId !== current.attrs.uploadId
              || updated.attrs.alt !== current.attrs.alt) {
            apply(updated)
          }
          return true
        },
      }
    }
  },
})
