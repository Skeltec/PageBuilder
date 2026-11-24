import type { LinkAdapter } from 'page-builder'

/**
 * Liens internes factices : quelques pages en mémoire, choisies par un prompt.
 * En vrai : modale de sélection de l'application, et resolve(id) → URL du routeur.
 * Le HTML sauvegardé ne contient que des références `page:<id>`.
 */
const pages = [
  { id: 'accueil', title: 'Accueil', slug: 'accueil' },
  { id: 'commandes', title: 'Passer une commande', slug: 'commandes/passer' },
  { id: 'faq', title: 'FAQ', slug: 'faq' },
]

export const links: LinkAdapter[] = [
  {
    scheme: 'page',
    label: 'Lien vers une page',
    async pick({ current }) {
      const list = pages.map((p, i) => `${i + 1}. ${p.title}${p.id === current ? ' (actuel)' : ''}`).join('\n')
      const answer = window.prompt(`Page à lier :\n${list}`, '1')
      const page = answer ? pages[Number(answer) - 1] : undefined
      return page ? { id: page.id, label: page.title } : null
    },
    resolve: (id) => `/guide/${pages.find((p) => p.id === id)?.slug ?? id}`,
  },
]
