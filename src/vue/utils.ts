/** Minuscules, sans accents : « Témoignage » trouvé avec « temoi » */
export function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/** localStorage peut être indisponible (navigation privée, bloqué, SSR) */
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

const DEFAULT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'

/**
 * Props d'une icône de bloc : SVG inline (fourni par la définition du bloc,
 * donc par le développeur) ou texte (emoji).
 */
export function iconProps(icon = DEFAULT_ICON) {
  return icon.trimStart().startsWith('<svg')
    ? { innerHTML: icon.replace('<svg', '<svg class="wy-icon-svg"') }
    : { textContent: icon }
}
