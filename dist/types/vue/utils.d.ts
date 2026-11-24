/** Minuscules, sans accents : « Témoignage » trouvé avec « temoi » */
export declare function normalize(text: string): string;
/** localStorage peut être indisponible (navigation privée, bloqué, SSR) */
export declare const storage: {
    get(key: string): string | null;
    set(key: string, value: string): void;
};
/**
 * Props d'une icône de bloc : SVG inline (fourni par la définition du bloc,
 * donc par le développeur) ou texte (emoji).
 */
export declare function iconProps(icon?: string): {
    innerHTML: string;
    textContent?: undefined;
} | {
    innerHTML?: undefined;
    textContent: string;
};
