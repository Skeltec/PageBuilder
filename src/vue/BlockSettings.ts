import { defineComponent, h, type PropType, type VNode } from 'vue'
import type { BlockEditor, BlockInstance } from '../core/BlockEditor'
import { paramDefaults, type BlockParams, type ParamDefinition, type ParamValue } from '../core/defineBlock'
import { useEditor, useEditorState } from './context'
import { iconProps } from './utils'

let uid = 0

function paramsOf(instance: BlockInstance): BlockParams {
  return (instance.node.attrs.params as BlockParams | undefined) ?? paramDefaults(instance.block.params)
}

/** Champ de paramètre : nombre (curseur si borné), case à cocher, choix (segmenté ≤ 4 options, sinon liste) */
export const ParamField = defineComponent({
  name: 'ParamField',
  props: {
    name: { type: String, required: true },
    definition: { type: Object as PropType<ParamDefinition>, required: true },
    value: { type: [Number, String, Boolean] as PropType<ParamValue>, required: true },
  },
  emits: { change: (_value: ParamValue) => true },
  setup(props, { emit }) {
    const id = `wy-param-${++uid}`
    return (): VNode => {
      const def = props.definition
      const label = def.label ?? props.name
      const value = props.value

      if (def.type === 'number') {
        const bounded = def.min !== undefined && def.max !== undefined
        return h('div', [
          h('div', { class: 'wy-field-head' }, [
            h('label', { for: id, class: 'wy-label' }, label),
            bounded ? h('span', { class: 'wy-value' }, String(value)) : null,
          ]),
          h('input', {
            id,
            type: bounded ? 'range' : 'number',
            class: bounded ? 'wy-range' : 'wy-input',
            min: def.min,
            max: def.max,
            step: def.step ?? 1,
            value,
            onInput: (ev: Event) => {
              const raw = (ev.target as HTMLInputElement).value
              if (raw !== '') emit('change', Number(raw))
            },
          }),
        ])
      }

      if (def.type === 'boolean') {
        return h('label', { for: id, class: 'wy-check' }, [
          h('input', {
            id,
            type: 'checkbox',
            class: 'wy-checkbox',
            checked: Boolean(value),
            onChange: (ev: Event) => emit('change', (ev.target as HTMLInputElement).checked),
          }),
          label,
        ])
      }

      const entries = Object.entries(def.options)
      if (entries.length <= 4) {
        return h('div', { role: 'group', 'aria-label': label }, [
          h('span', { class: 'wy-label' }, label),
          h(
            'div',
            { class: 'wy-segmented' },
            entries.map(([v, l]) =>
              h('button', { key: v, type: 'button', 'aria-pressed': String(v === value), onClick: () => emit('change', v) }, l),
            ),
          ),
        ])
      }
      return h('div', [
        h('label', { for: id, class: 'wy-label' }, label),
        h(
          'select',
          { id, class: 'wy-input', value, onChange: (ev: Event) => emit('change', (ev.target as HTMLSelectElement).value) },
          entries.map(([v, l]) => h('option', { key: v, value: v }, l)),
        ),
      ])
    }
  },
})

/**
 * Fenêtre d'édition : paramètres des blocs contenant la sélection, une section
 * par bloc, du plus externe au plus interne (ex. « 3 cartes » puis « Carte »).
 * Slot `empty` : contenu affiché sans bloc sélectionné.
 */
export const BlockSettings = defineComponent({
  name: 'BlockSettings',
  props: {
    editor: { type: Object as PropType<BlockEditor>, default: undefined },
  },
  setup(props, { slots }) {
    const editor = useEditor(() => props.editor)
    const instances = useEditorState(editor, (e) => e.selectedBlocks())

    const section = (e: BlockEditor, instance: BlockInstance, parent: BlockInstance | undefined, active: boolean) => {
      const { block } = instance
      const params = paramsOf(instance)
      const fields = Object.entries(block.params)
      // Clé par type : les champs ne sont pas recréés quand la position change
      return h('section', { key: block.name, class: 'wy-section', 'data-active': active ? '' : undefined }, [
        h('header', { class: 'wy-section-header' }, [
          h('span', { class: 'wy-icon', ...iconProps(block.icon) }),
          h('div', { class: 'wy-section-title' }, [
            h('h3', block.label),
            block.description ? h('p', { class: 'wy-muted' }, block.description) : null,
          ]),
        ]),
        fields.length
          ? h(
              'div',
              { class: 'wy-fields' },
              fields.map(([name, def]) =>
                h(ParamField, {
                  key: name,
                  name,
                  definition: def,
                  value: params[name],
                  onChange: (value: ParamValue) => e.setBlockParams(instance.pos, { [name]: value }),
                }),
              ),
            )
          : h('p', { class: 'wy-muted' }, 'Aucun paramètre'),
        h('div', { class: 'wy-section-footer' }, [
          instance.fixed && parent
            ? h('span', { class: 'wy-muted' }, `Intégré à « ${parent.block.label} »`)
            : h('button', { type: 'button', class: 'wy-btn wy-btn-danger', onClick: () => e.deleteBlockAt(instance.pos) }, 'Supprimer le bloc'),
        ]),
      ])
    }

    return () => {
      const e = editor.value
      const list = instances.value ?? []
      return h(
        'div',
        { class: 'wy-settings' },
        e && list.length
          ? list.map((instance, i) => section(e, instance, list[i - 1], i === list.length - 1))
          : (slots.empty?.() ?? h('p', { class: 'wy-empty' }, 'Placez le curseur dans un bloc pour voir ses paramètres.')),
      )
    }
  },
})
