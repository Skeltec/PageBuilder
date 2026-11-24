import { Editor, type AnyExtension } from '@tiptap/core';
import { type StarterKitOptions } from '@tiptap/starter-kit';
import { type Node as PMNode } from '@tiptap/pm/model';
import { AssetManager, type AssetEvents } from '../assets/AssetManager';
import { LinkManager, type LinkAdapter } from '../refs/LinkManager';
import { type RefResolver } from '../refs/refs';
import type { AssetAdapter } from '../assets/types';
import { type BlockDefinition, type BlockParams } from './defineBlock';
/**
 * Vue sans framework branchée sur l'éditeur avec use() (les composants Vue de
 * `page-builder/vue` n'en ont pas besoin). `target` : élément où s'afficher, fourni
 * par un éventuel conteneur. Retourne son nettoyage.
 */
export interface BlockEditorView {
    attach(editor: BlockEditor, target?: HTMLElement): void | (() => void);
}
/** @deprecated Renommé BlockEditorView */
export type BlockEditorPlugin = BlockEditorView;
/** Un bloc du document, avec sa position (pour setBlockParams, deleteBlockAt…) */
export interface BlockInstance {
    block: BlockDefinition;
    pos: number;
    node: PMNode;
    /** Enfant <Block /> figé dans un autre template */
    fixed: boolean;
}
export type BlockLoader = () => Promise<BlockDefinition>;
export interface BlockEditorEvents extends AssetEvents {
    /** Le document a changé */
    update: {
        html: string;
    };
    /** La sélection a changé (utile pour l'état d'une toolbar) */
    selectionUpdate: Record<string, never>;
    /** La liste des blocs a changé (bloc async chargé) */
    blocksChange: {
        blocks: readonly BlockDefinition[];
    };
}
export type BlockEditorListener<K extends keyof BlockEditorEvents> = (payload: BlockEditorEvents[K]) => void;
export interface BlockEditorOptions {
    /**
     * Élément (ou sélecteur CSS) où monter la zone éditable. Absent : un <div>
     * détaché est créé (`editor.element`), à insérer où l'on veut — c'est ce que
     * fait le composant Vue EditorContent.
     */
    element?: HTMLElement | string;
    /** Contenu HTML initial */
    content?: string;
    /** Blocs disponibles (définis avec defineBlock) */
    blocks?: Iterable<BlockDefinition>;
    /** Blocs chargés à la demande, par nom (voir loadBlock) */
    asyncBlocks?: Record<string, BlockLoader>;
    /** Extensions Tiptap supplémentaires */
    extensions?: AnyExtension[];
    /** Options de StarterKit, ou false pour fournir ses propres extensions de base */
    starterKit?: Partial<StarterKitOptions> | false;
    /** Paragraphe vide forcé en fin de document (défaut : true) */
    trailingNode?: boolean;
    /** Placeholders des slots (défaut : true) */
    placeholders?: boolean;
    /** Conserver les data-type inconnus en lecture seule (défaut : true) */
    unknownBlocks?: boolean;
    /** Classe CSS de la zone éditable (défaut : "rich-content") */
    className?: string;
    /** Largeur max du contenu (ex. "48rem"), centré */
    contentWidth?: string;
    /** Module de fichiers (upload + résolution des références `asset:id`) */
    assets?: AssetAdapter;
    /** Liens internes (`page:id`…) : sélecteur + résolution fournis par l'application */
    links?: LinkAdapter[];
    /** Vues à brancher dès la création */
    views?: BlockEditorView[];
    /** Écouteurs d'événements */
    on?: {
        [K in keyof BlockEditorEvents]?: BlockEditorListener<K>;
    };
}
/**
 * Cœur de l'éditeur de blocs — la seule classe nécessaire. Enveloppe Tiptap,
 * compose les extensions et gère le cycle de vie (un schéma ProseMirror est
 * immuable : charger un bloc async recrée l'instance Tiptap — `tiptap` pointe
 * toujours sur l'instance courante). Aucune interface n'est imposée : les
 * composants Vue (`page-builder/vue`) n'utilisent que l'API publique ; une
 * intégration sans framework peut se brancher avec use().
 *
 *   const editor = new BlockEditor({
 *     element: '#editor',
 *     blocks: myBlocks,
 *     content: html,
 *     assets: { upload, resolve: (id) => `/files/${id}` },
 *     on: { update: ({ html }) => save(html) },
 *   })
 *   editor.use(new BlockLibrary({ mount: '#library' }))
 */
export declare class BlockEditor {
    private readonly options;
    /** Variante chaînable du constructeur */
    static builder(): BlockEditorBuilder;
    /** Module de fichiers ; null si aucun AssetAdapter n'est configuré */
    readonly assets: AssetManager | null;
    /** Liens internes ; null si aucun LinkAdapter n'est configuré */
    readonly links: LinkManager | null;
    readonly element: HTMLElement;
    private instance;
    private readonly blockList;
    private readonly asyncLoaders;
    private readonly cleanups;
    private readonly listeners;
    constructor(options: BlockEditorOptions);
    /** Instance Tiptap courante (change après un chargement de bloc async) */
    get tiptap(): Editor;
    /** Blocs disponibles dans le schéma courant */
    get blocks(): readonly BlockDefinition[];
    /** HTML à sauvegarder : les fichiers y sont des références `asset:id` */
    getHTML(): string;
    /** HTML avec les références (`asset:id`, `page:id`…) remplacées par leurs URLs (rendu public) */
    getResolvedHTML(): Promise<string>;
    /** Resolvers par schéma (fichiers + liens), pour resolveRefs côté application */
    resolvers(): Record<string, RefResolver>;
    /** Schémas de références gérés (fichiers + liens) */
    get schemes(): string[];
    /** Remplace le contenu ; ce qui n'est pas dans le schéma devient unknownBlock (ou est ignoré) */
    setContent(html: string, { emitUpdate }?: {
        emitUpdate?: boolean | undefined;
    }): void;
    getBlock(name: string): BlockDefinition | undefined;
    /**
     * Blocs contenant la sélection, du plus externe au plus interne (un bloc
     * sélectionné comme nœud est inclus).
     */
    selectedBlocks(): BlockInstance[];
    /** Modifie les paramètres du bloc à `pos` (sans déplacer le focus) */
    setBlockParams(pos: number, patch: BlockParams): boolean;
    /** Supprime le bloc à `pos` ; refuse un enfant <Block /> figé */
    deleteBlockAt(pos: number): boolean;
    /** HTML d'un bloc vide (ou d'exemple), tel que getHTML() le produirait */
    blockHTML(name: string, { sample }?: {
        sample?: boolean | undefined;
    }): string;
    /** Rendu DOM d'un bloc d'exemple (placeholders en texte), pour les aperçus */
    renderBlock(name: string, { sample }?: {
        sample?: boolean | undefined;
    }): HTMLElement | Text;
    /**
     * Insère un bloc vide près du curseur, sans couper le texte (voir
     * insertionRange). Le curseur est ensuite placé dans le premier slot.
     */
    insertBlock(name: string): boolean;
    /**
     * Supprime le bloc le plus proche contenant le curseur. Un enfant <Block />
     * figé ne peut pas être retiré seul : on remonte à son parent.
     */
    deleteCurrentBlock(): boolean;
    /**
     * Charge un bloc déclaré dans asyncBlocks puis recrée l'éditeur pour l'ajouter
     * au schéma. Le contenu passe par getHTML() : les unknownBlock ressortent leur
     * HTML d'origine, reparsé avec le nouveau bloc. Retourne false si aucun loader.
     */
    loadBlock(name: string): Promise<boolean>;
    /** S'abonne à un événement ; retourne la fonction de désabonnement */
    on<K extends keyof BlockEditorEvents>(event: K, listener: BlockEditorListener<K>): () => void;
    off<K extends keyof BlockEditorEvents>(event: K, listener: BlockEditorListener<K>): void;
    /**
     * Branche une vue sans framework (objet avec attach()). Retourne la fonction pour la débrancher ; destroy() le fait aussi.
     */
    use(view: BlockEditorView, target?: HTMLElement): () => void;
    destroy(): void;
    private blocksAtSelection;
    /**
     * Clic hors du contenu (marges autour de la zone éditable, ou vide sous le
     * dernier bloc) : curseur au point le plus proche du contenu
     */
    private focusFromMargin;
    /** Classe .is-active sur le bloc le plus interne contenant la sélection */
    private activeBlockExtension;
    private emit;
    /** StarterKit, avec le lien configuré pour accepter les références (`asset:`, `page:`…) */
    private starterKit;
    private createTiptap;
}
/**
 * Variante chaînable de `new BlockEditor(options)`. Chaque méthode retourne le
 * builder ; build() crée l'éditeur.
 */
export declare class BlockEditorBuilder {
    private readonly opts;
    private readonly subscriptions;
    /** Élément (ou sélecteur CSS) où monter l'éditeur (sinon : editor.element détaché) */
    mount(target: HTMLElement | string): this;
    content(html: string): this;
    block(...blocks: BlockDefinition[]): this;
    blocks(blocks: Iterable<BlockDefinition>): this;
    asyncBlock(name: string, loader: BlockLoader): this;
    asyncBlocks(loaders: Record<string, BlockLoader>): this;
    extension(...extensions: AnyExtension[]): this;
    starterKit(options: Partial<StarterKitOptions> | false): this;
    trailingNode(enabled?: boolean): this;
    placeholders(enabled?: boolean): this;
    unknownBlocks(enabled?: boolean): this;
    className(cls: string): this;
    contentWidth(width: string): this;
    /** Module de fichiers (upload + références `asset:id`) */
    assets(adapter: AssetAdapter): this;
    /** Liens internes (`page:id`…) */
    links(...adapters: LinkAdapter[]): this;
    /** Branche des vues sans framework (objets avec attach()) */
    use(...views: BlockEditorView[]): this;
    on<K extends keyof BlockEditorEvents>(event: K, listener: BlockEditorListener<K>): this;
    onUpdate(listener: BlockEditorListener<'update'>): this;
    onSelectionUpdate(listener: BlockEditorListener<'selectionUpdate'>): this;
    onBlocksChange(listener: BlockEditorListener<'blocksChange'>): this;
    build(): BlockEditor;
}
