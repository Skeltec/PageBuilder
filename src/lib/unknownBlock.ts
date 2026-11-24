import { Node } from '@tiptap/core'
import DOMPurify from 'dompurify'

/**
 * Filet de sécurité pour les data-type que le schéma ne connaît pas (bloc
 * supprimé, renommé, ou pas encore chargé en async).
 *
 * Le HTML d'origine est conservé tel quel (assaini) et affiché en lecture seule ;
 * getHTML() le ressort intact, donc rien n'est perdu à la sauvegarde. Deux actions :
 *   - Réessayer : demande à l'application de charger la définition (onRetry)
 *   - Convertir : remplace le bloc par du contenu standard éditable
 */

export interface UnknownBlockOptions {
  /** Charge la définition du bloc ; true si chargé (l'éditeur sera recréé) */
  onRetry: (blockType: string) => Promise<boolean>
}

/** HTML assaini : pas de <script>, pas de onerror=…, pas de javascript: */
function sanitize(html: string) {
  return DOMPurify.sanitize(html)
}

function toElement(html: string) {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content.firstElementChild ?? document.createElement('div')
}

/** Retire nos marqueurs pour que la conversion ne recrée pas un unknownBlock */
function stripBlockMarkers(html: string) {
  const root = toElement(html)
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    el.removeAttribute('data-type')
    el.removeAttribute('data-block-root')
    el.removeAttribute('data-slot')
  }
  return root.outerHTML
}

export const UnknownBlock = Node.create<UnknownBlockOptions>({
  name: 'unknownBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { onRetry: async () => false }
  },

  addAttributes() {
    return {
      blockType: { default: null, rendered: false },
      html: { default: '', rendered: false },
    }
  },

  parseHTML() {
    const editor = this.editor
    return [
      {
        tag: '[data-type]',
        // Sous les règles des blocs connus (100), au-dessus de p/div/h1… (50)
        priority: 90,
        getAttrs: (el) => {
          const type = el.getAttribute('data-type')!
          const schema = editor?.schema
          // Type connu (bloc, partie de bloc, nœud/mark d'une autre extension) : pas pour nous
          if (schema && (schema.nodes[type] || schema.marks[type])) return false
          return { blockType: type, html: sanitize(el.outerHTML) }
        },
      },
    ]
  },

  renderHTML({ node }) {
    // On ressort le HTML d'origine, pas un wrapper : la sauvegarde est sans perte
    return toElement(node.attrs.html)
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.className = 'unknown-block'
      dom.contentEditable = 'false'

      const bar = document.createElement('div')
      bar.className = 'unknown-block-bar'

      const label = document.createElement('span')
      label.textContent = `Bloc inconnu : ${node.attrs.blockType}`

      const status = document.createElement('span')
      status.className = 'unknown-block-status'

      const button = (text: string, onClick: () => void) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = text
        b.addEventListener('click', onClick)
        return b
      }

      const retry = button('↻ Réessayer', async () => {
        retry.disabled = true
        status.textContent = 'Chargement…'
        const loaded = await this.options.onRetry(node.attrs.blockType)
        // Si chargé, l'éditeur est recréé et cette vue disparaît
        if (!loaded) status.textContent = 'Toujours indisponible'
        retry.disabled = false
      })

      const convert = button('⇄ Convertir', () => {
        const pos = getPos()
        if (pos === undefined) return
        editor
          .chain()
          .focus()
          .insertContentAt({ from: pos, to: pos + node.nodeSize }, stripBlockMarkers(node.attrs.html))
          .run()
      })

      bar.append(label, status, retry, convert)

      // Aperçu en lecture seule du HTML d'origine (déjà assaini au parsing)
      const content = document.createElement('div')
      content.className = 'unknown-block-content'
      content.innerHTML = node.attrs.html

      dom.append(bar, content)

      return {
        dom,
        // Les clics sur la barre ne doivent pas être interprétés par ProseMirror
        stopEvent: (e) => bar.contains(e.target as globalThis.Node),
        ignoreMutation: () => true,
      }
    }
  },
})
