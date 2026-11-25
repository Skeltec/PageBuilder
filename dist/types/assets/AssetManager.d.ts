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
    /**
     * Ouvre le sélecteur de fichiers puis téléverse et insère ; [] si annulé.
     * Avec `adapter.pick` : choisit des fichiers existants et les insère.
     */
    pickFiles({ accept, multiple }?: {
        accept?: string;
        multiple?: boolean;
    }): Promise<AssetRef[]>;
    /**
     * Ouvre le sélecteur, téléverse un seul fichier et retourne sa référence
     * (`asset:42`) sans rien insérer : valeur d'un paramètre image de bloc.
     * null si annulé ou refusé (uploadError émis).
     * Avec `adapter.pick` : choisit un fichier existant ; `current` (référence ou
     * URL actuelle) lui est transmis pour présélection.
     */
    pickRef({ accept, current }?: {
        accept?: string;
        current?: string | null;
    }): Promise<string | null>;
    /**
     * Insère des fichiers déjà téléversés (ex. choisis dans une médiathèque) :
     * images en bloc <img> (alt de la référence), autres fichiers en lien.
     * Image ou lien selon `ref.type`, à défaut selon `accept`. `at` : position
     * d'insertion (défaut : curseur).
     */
    insert(refs: Iterable<AssetRef>, at?: number, accept?: string): void;
    /** Téléverse un fichier sans l'insérer ; retourne sa référence, null si refusé ou en erreur */
    uploadRef(file: File): Promise<string | null>;
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
    /** Image déjà téléversée ; retourne la position suivante */
    private insertImage;
    private findImage;
    private finishImage;
    private removeImage;
    /** Mémorise la position d'un fichier joint ; retourne la position suivante */
    private trackPending;
    private untrack;
    /** Lien d'un fichier en cours d'envoi, à la position suivie */
    private insertFileLink;
    /**
     * Lien vers le fichier : dans le texte si la position est dans un paragraphe,
     * sinon nouveau paragraphe ; retourne la position suivante.
     */
    private insertLink;
}
export {};
