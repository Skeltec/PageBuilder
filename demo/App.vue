<script setup lang="ts">
import { ref, watch } from 'vue'
import { BlockLibrary, BlockSettings, EditorContent, Sidebar, Toolbar, useBlockEditor } from 'page-builder/vue'
import { assets } from './assets'
import { links } from './links'
import { blocks } from './blocks'
import { asyncBlocks } from './blocks/asyncBlocks'

// Contenu de démo : un bloc connu, un bloc chargeable en async (testimonial) et
// un bloc qui n'existe nulle part (pricingTable)
const initialContent = `
<h2>Démo</h2>
<p>Texte avant le bloc 2 colonnes.</p>
<div class="flex gap-8" data-type="columns" data-block-root="" data-params='{"columns":2,"gap":"gap-8"}'><div class="min-w-0 flex-1" data-type="columns_0" data-slot="rich"><p>Gauche</p></div><div class="min-w-0 flex-1" data-type="columns_0" data-slot="rich"><p>Droite</p></div></div>
<figure class="rounded-xl bg-slate-900 p-8 text-white" data-type="testimonial" data-block-root=""><blockquote class="text-xl italic text-white" data-type="testimonial_0" data-slot="multi">Super outil,<br>vraiment.</blockquote><figcaption class="mt-4 text-sm text-slate-300" data-type="testimonial_1" data-slot="single">— Une utilisatrice</figcaption></figure>
<div class="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-6" data-type="pricingTable" data-block-root=""><div data-type="pricingTable_0"><h3>Gratuit</h3><p>0 $ / mois</p></div><div data-type="pricingTable_1"><h3>Pro</h3><p>29 $ / mois</p></div></div>
<p>Fichier joint : <a href="asset:guide.pdf">guide.pdf</a> — voir aussi la <a href="page:faq">FAQ</a>.</p>
<p></p>
`

// Le cœur (BlockEditor) est créé au montage et fourni aux composants enfants ;
// chacun (Sidebar, BlockLibrary, BlockSettings, Toolbar) est remplaçable.
const editor = useBlockEditor({
  contentWidth: '48rem',
  blocks,
  asyncBlocks,
  content: initialContent,
  assets,
  links,
  on: { update: render },
})

// Premier rendu dès que l'éditeur existe
watch(editor, render)

const output = ref('')
const preview = ref('')
const status = ref('')
// Vrai dès que l'utilisateur modifie le textarea : on arrête alors de l'écraser
let outputDirty = false

function onOutputInput() {
  outputDirty = true
  status.value = 'Modifié — cliquer pour appliquer'
}

function reload() {
  // Le HTML passe par les règles parseHTML : ce qui n'est pas dans le schéma est ignoré
  editor.value?.setContent(output.value)
  outputDirty = false
  status.value = 'Éditeur rechargé'
  render()
}

let renderId = 0
async function render() {
  const e = editor.value
  if (!e) return
  if (!outputDirty) output.value = formatHTML(e.getHTML())
  // Rendu public : même HTML, références asset:id résolues en URLs
  const id = ++renderId
  const resolved = await e.getResolvedHTML()
  if (id === renderId) preview.value = resolved
}

/**
 * Retour à la ligne après les balises de bloc seulement : couper entre des
 * balises inline (<strong><em>) ajouterait des espaces au rechargement.
 */
function formatHTML(html: string) {
  return html.replace(/(<\/?(?:p|h[1-6]|div|section|aside|ul|ol|li|blockquote|hr)\b[^>]*>)(?=<)/g, '$1\n')
}
</script>

<template>
  <div class="flex h-full">
    <Sidebar side="left" title="Blocs" persist-key="left">
      <BlockLibrary view="grid" />
    </Sidebar>

    <!-- Centre : éditeur (+ rendu et HTML pour la démo) -->
    <main class="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white">
      <Toolbar class="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur" />
      <EditorContent class="flex-1" />

      <!-- Démo : rendu final et HTML, sous l'éditeur -->
      <div class="space-y-4 border-t border-slate-200 bg-slate-50 p-6">
        <details class="rounded-xl bg-white p-4 shadow-sm">
          <summary class="cursor-pointer font-semibold">Rendu (HTML final, sans l'éditeur)</summary>
          <div class="rich-content mx-auto mt-3 max-w-3xl border-t border-slate-200 pt-4" v-html="preview" />
        </details>

        <details class="rounded-xl bg-white p-4 shadow-sm">
          <summary class="cursor-pointer font-semibold">HTML généré</summary>
          <textarea
            v-model="output"
            spellcheck="false"
            class="mt-3 block h-80 w-full resize-y rounded bg-slate-900 p-4 font-mono text-xs text-slate-100"
            @input="onOutputInput"
          />
          <div class="mt-2 flex items-center gap-3">
            <button
              type="button"
              class="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              @click="reload"
            >
              Recharger l'éditeur avec ce contenu
            </button>
            <span class="text-xs text-slate-500">{{ status }}</span>
          </div>
        </details>
      </div>
    </main>

    <Sidebar side="right" title="Paramètres" persist-key="right">
      <BlockSettings />
    </Sidebar>
  </div>
</template>
