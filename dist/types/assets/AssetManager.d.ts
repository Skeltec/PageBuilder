import { Extension, type Editor } from '@tiptap/core';
import { type AssetAdapter, type AssetRef } from './types';
/** Événements émis pendant un téléversement (relayés par BlockEditor) */
export interface AssetEvents {
    uploadStart: {
        file: File;
    };
    uploadEnd: {
        file: File;
        ref: AssetRef;
    };
    /** stage "validation" : refusé avant l'envoi (accept, maxSize), sans uploadStart */
    uploadError: {
        file: File;
        error: unknown;
        stage: 'validation' | 'upload';
    };
}
interface Host {
    /** Instance Tiptap courante (peut changer : chargement de bloc async) */
    tiptap(): Editor;
    emit<K extends keyof AssetEvents>(event: K, payload: AssetEvents[K]): void;
}
/**
 * Gère les fichiers de l'éditeur : téléversement (bouton, coller, glisser-
 * déposer), insertion (image ou lien) et résolution des références `asset:id`.
 * Accessible via `editor.assets` quand un AssetAdapter est configuré.
 */
export declare class AssetManager {
    private readonly adapter;
    private readonly host;
    readonly scheme: string;
    private readonly urls;
    private readonly abort;
    /** @internal Créé par BlockEditor */
    constructor(adapter: AssetAdapter, host: Host);
    get accept(): string | undefined;
    /** Référence à stocker dans le HTML pour cet id (`asset:42`) */
    ref(id: string): string;
    /** id → URL (mise en cache ; une erreur n'est pas mise en cache) */
    resolveUrl(id: string): Promise<string>;
    /** src / href quelconque → URL affichable (les URLs normales passent telles quelles) */
    resolveSrc(src: string): string | Promise<string>;
    /** Ouvre le sélecteur de fichiers puis téléverse ; [] si annulé */
    pickFiles({ accept, multiple }?: {
        accept?: string;
        multiple?: boolean;
    }): Promise<AssetRef[]>;
    /**
     * Téléverse et insère des fichiers : images en bloc <img>, autres fichiers en
     * lien. `at` : position d'insertion (défaut : curseur). Les fichiers refusés
     * (accept, maxSize) émettent uploadError.
     */
    upload(files: Iterable<File>, at?: number): Promise<AssetRef[]>;
    /** @internal Extension : coller / déposer des fichiers, suivi des positions */
    extension(): Extension<any, any>;
    /** @internal */
    destroy(): void;
    private validate;
    private send;
    /** Image affichée tout de suite (blob:), en attente de son id ; retourne la position suivante */
    private insertImagePlaceholder;
    private findImage;
    private finishImage;
    private removeImage;
    /** Mémorise la position d'un fichier joint ; retourne la position suivante */
    private trackPending;
    private untrack;
    /** Lien vers le fichier : dans le texte si la position est dans un paragraphe, sinon nouveau paragraphe */
    private insertFileLink;
}
export {};
