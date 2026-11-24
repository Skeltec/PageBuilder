import { defineBlock } from 'wysiwyg'
import { icons } from './icons'

// Nombre de colonnes variable : <Repeat> + paramètre number
export const columns = defineBlock(
  'columns',
  `
  <div class="flex {gap}">
    <Repeat count="columns">
      <div class="min-w-0 flex-1"><Wysiwyg /></div>
    </Repeat>
  </div>
  `,
  {
    label: 'Colonnes',
    description: 'Colonnes de largeur égale, chacune avec du contenu libre.',
    icon: icons.columns,
    params: {
      columns: { type: 'number', label: 'Colonnes', default: 2, min: 1, max: 4 },
      // Classes complètes en valeur : Tailwind ne détecte pas "gap-{n}"
      gap: { type: 'select', label: 'Espacement', default: 'gap-8', options: { 'gap-0': 'Aucun', 'gap-4': 'Petit', 'gap-8': 'Moyen', 'gap-16': 'Grand' } },
    },
  },
)

export const callout = defineBlock(
  'callout',
  `
  <aside class="rounded-xl border p-6 {tone}">
    <Wysiwyg />
  </aside>
  `,
  {
    label: 'Encadré',
    description: 'Met en évidence une note, un conseil ou un avertissement.',
    icon: icons.callout,
    // Vignette fournie (sinon : aperçu généré à partir du template)
    thumbnail: '/thumbnails/callout.svg',
    params: {
      tone: {
        type: 'select',
        label: 'Couleur',
        default: 'border-amber-200 bg-amber-50',
        options: {
          'border-amber-200 bg-amber-50': 'Ambre',
          'border-sky-200 bg-sky-50': 'Ciel',
          'border-rose-200 bg-rose-50': 'Rose',
          'border-emerald-200 bg-emerald-50': 'Vert',
        },
      },
    },
  },
)

// SingleLine (titre, texte brut) + MultiLine (texte avec <br>) + Wysiwyg
export const hero = defineBlock(
  'hero',
  `
  <section class="rounded-xl bg-indigo-50 p-10 {align}">
    <h1 class="text-4xl font-bold text-indigo-950"><SingleLine placeholder="Titre" /></h1>
    <p class="mt-2 text-lg text-indigo-800"><MultiLine placeholder="Sous-titre (Enter = nouvelle ligne)" /></p>
    <div class="mt-6"><Wysiwyg /></div>
  </section>
  `,
  {
    label: 'Hero',
    description: 'Grand titre d’introduction avec sous-titre et contenu.',
    icon: icons.hero,
    params: {
      align: { type: 'select', label: 'Alignement', default: 'text-left', options: { 'text-left': 'Gauche', 'text-center': 'Centré' } },
    },
  },
)

// Composition : une carte réutilisable…
export const card = defineBlock(
  'card',
  `
  <article class="rounded-xl border border-slate-200 bg-white p-6 {shadow}">
    <h3 class="text-lg font-semibold"><SingleLine placeholder="Titre de la carte" /></h3>
    <div class="mt-2 text-slate-600"><Wysiwyg /></div>
  </article>
  `,
  {
    label: 'Carte',
    description: 'Titre et texte dans un cadre.',
    icon: icons.card,
    params: {
      shadow: { type: 'boolean', label: 'Ombre portée', default: true, on: 'shadow-md' },
    },
  },
)

// …répétée en grille : <Repeat> d'un <Block />
export const cardGrid = defineBlock(
  'cardGrid',
  `
  <div class="grid gap-6 {columns}">
    <Repeat count="cards">
      <Block type="card" />
    </Repeat>
  </div>
  `,
  {
    label: 'Grille de cartes',
    description: 'Plusieurs cartes alignées en grille.',
    icon: icons.grid,
    params: {
      cards: { type: 'number', label: 'Nombre de cartes', default: 3, min: 1, max: 9 },
      columns: {
        type: 'select',
        label: 'Colonnes',
        default: 'grid-cols-3',
        options: { 'grid-cols-1': '1', 'grid-cols-2': '2', 'grid-cols-3': '3', 'grid-cols-4': '4' },
      },
    },
  },
)

export const blocks = [columns, callout, hero, card, cardGrid]
