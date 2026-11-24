/** Petits utilitaires DOM partagés par les composants UI */

type Child = Node | string

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  node.append(...children)
  return node
}

export function resolveMount(target: HTMLElement | string) {
  const node = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
  if (!node) throw new Error(`Élément introuvable : ${String(target)}`)
  return node
}

const DEFAULT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'

/**
 * Icône : SVG inline (fourni par la définition du bloc, donc par le développeur)
 * ou texte (emoji).
 */
export function setIcon(target: HTMLElement, icon = DEFAULT_ICON) {
  if (icon.trimStart().startsWith('<svg')) {
    target.innerHTML = icon
    target.querySelector('svg')?.setAttribute('class', 'size-5')
  } else {
    target.textContent = icon
  }
}

/** Minuscules, sans accents : « Témoignage » trouvé avec « temoi » */
export function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/** localStorage peut être indisponible (navigation privée, bloqué) */
export const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // préférence non mémorisée, sans conséquence
    }
  },
}
