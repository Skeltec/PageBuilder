import { Node } from '@tiptap/core';
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
    onRetry: (blockType: string) => Promise<boolean>;
    /** Schémas de références à conserver dans src / href (`asset:`, `page:`…) */
    schemes: string[];
}
export declare const UnknownBlock: Node<UnknownBlockOptions, any>;
