import { Node } from '@tiptap/core';
export interface AssetImageOptions {
    /** src (URL ou référence `asset:id`) → URL affichable dans l'éditeur */
    resolveSrc: (src: string) => string | Promise<string>;
}
/**
 * Image (bloc). Le HTML sauvegardé garde le src tel quel — une référence
 * `asset:42` pour un fichier téléversé ; seule la vue dans l'éditeur affiche
 * l'URL résolue.
 */
export declare const AssetImage: Node<AssetImageOptions, any>;
