import { defineBlock } from 'wysiwyg'
import { icons } from '../icons'

// Chargé à la demande (import dynamique) : absent du schéma au démarrage
export const testimonial = defineBlock(
  'testimonial',
  `
  <figure class="rounded-xl bg-slate-900 p-8 text-white">
    <blockquote class="text-xl italic text-white"><MultiLine placeholder="Citation" /></blockquote>
    <figcaption class="mt-4 text-sm text-slate-300"><SingleLine placeholder="Auteur" /></figcaption>
  </figure>
  `,
  {
    label: 'Témoignage',
    description: 'Citation d’un client avec son auteur. Chargé à la demande.',
    icon: icons.quote,
  },
)
