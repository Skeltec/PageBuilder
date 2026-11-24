import type { Editor } from '@tiptap/core';
import { type RefResolver } from './refs';
/** Cible choisie par l'application pour un lien interne */
export interface LinkTarget {
    id: string;
    /** Texte inséré quand rien n'est sélectionné */
    label: string;
}
export interface LinkPickContext {
    /** Id déjà lié à la sélection (modification d'un lien existant), sinon null */
    current: string | null;
    /** Texte sélectionné ("" si curseur seul) */
    text: string;
}
/**
 * Liens internes vers des entités de l'application (pages, commandes…) — fourni
 * par l'application. Le HTML ne contient que `<schéma>:<id>` ; l'URL est
 * calculée à l'affichage : renommer ou déplacer la cible ne casse pas le lien.
 *
 *   new BlockEditor({
 *     links: [{
 *       scheme: 'page',
 *       label: 'Lien vers une page',
 *       pick: ({ current }) => openPagePicker(current),   // { id, label } | null
 *       resolve: (id) => pageUrl(id),
 *     }],
 *   })
 */
export interface LinkAdapter {
    /** Préfixe dans le HTML : "page" → `href="page:42"` */
    scheme: string;
    /** Libellé pour les interfaces de l'application (menu de liens…) */
    label?: string;
    /** Ouvre le sélecteur de l'application ; null si annulé */
    pick(context: LinkPickContext): Promise<LinkTarget | null>;
    /** id → URL (rendu public, getResolvedHTML). Peut être asynchrone */
    resolve: RefResolver;
}
interface Host {
    /** Instance Tiptap courante (peut changer : chargement de bloc async) */
    tiptap(): Editor;
}
/**
 * Insère et résout les liens internes. Accessible via `editor.links` quand au
 * moins un LinkAdapter est configuré.
 */
export declare class LinkManager {
    private readonly host;
    readonly adapters: readonly LinkAdapter[];
    /** @internal Créé par BlockEditor */
    constructor(adapters: LinkAdapter[], host: Host);
    get schemes(): string[];
    /** Adaptateur d'un schéma (défaut : le premier) */
    adapter(scheme?: string): LinkAdapter;
    /** Référence à stocker dans le HTML (`page:42`) */
    ref(id: string, scheme?: string): string;
    /** Resolvers par schéma, pour resolveRefs */
    resolvers(): Record<string, RefResolver>;
    /**
     * Ouvre le sélecteur puis pose le lien : sur la sélection, sur le lien
     * existant sous le curseur, ou en insérant le libellé de la cible.
     * Retourne la cible, ou null si annulé.
     */
    insert(scheme?: string): Promise<LinkTarget | null>;
    /** Retire le lien sous la sélection */
    remove(): void;
    /** Schéma interne lié à la sélection, ou null */
    activeScheme(): string | null;
}
export {};
