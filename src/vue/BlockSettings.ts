import { defineComponent, h, shallowRef, watchEffect, type PropType, type VNode } from 'vue'
import type { BlockEditor, BlockInstance } from '../core/BlockEditor'
import { paramDefaults, safeFocusValue, type BlockParams, type ParamDefinition, type ParamValue } from '../core/defineBlock'
import { useEditor, useEditorState } from './context'
import { iconProps } from './utils'

let uid = 0

function paramsOf(instance: BlockInstance): BlockParams {
  return (instance.node.attrs.params as BlockParams | undefined) ?? paramDefaults(instance.block.params)
}

type FocusDefinition = Extract<ParamDefinition, { type: 'focus' }>

/** "x% y%" → [x, y] */
function focusPoint(value: unknown): [number, number] {
  const [x, y] = (safeFocusValue(value) || '50% 50%').split(' ').map((v) => parseInt(v, 10))
  return [x, y]
}

/**
 * Champ de paramètre : nombre (curseur si borné), case à cocher, choix (segmenté ≤ 4 options,
 * sinon liste), image. Un paramètre focus s'affiche dans le champ de son image (cible sur l'aperçu).
 */
export const ParamField = defineComponent({
  name: 'ParamField',
  props: {
    name: { type: String, required: true },
    definition: { type: Object as PropType<ParamDefinition>, required: true },
    value: { type: [Number, String, Boolean] as PropType<ParamValue>, required: true },
    /** Requis pour un paramètre image (téléversement via editor.assets) */
    editor: { type: Object as PropType<BlockEditor>, default: undefined },
    /** Paramètre image : point de cadrage associé (paramètre focus) */
    focus: { type: Object as PropType<{ definition: FocusDefinition; value: ParamValue }>, default: undefined },
  },
  emits: { change: (_value: ParamValue) => true, focusChange: (_value: string) => true },
  setup(props, { emit }) {
    const id = `wy-param-${++uid}`
    const preview = shallowRef<{ src: string; url: string } | null>(null)
    const busy = shallowRef(false)
    // Point en cours de glissement : un seul changement (une étape d'annulation) au relâchement
    const dragging = shallowRef<[number, number] | null>(null)

    const pointAt = (ev: PointerEvent): [number, number] => {
      const box = (ev.currentTarget as HTMLElement).getBoundingClientRect()
      const pct = (v: number, size: number) => Math.min(100, Math.max(0, Math.round((v / size) * 100)))
      return [pct(ev.clientX - box.left, box.width), pct(ev.clientY - box.top, box.height)]
    }
    const onFocusDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return
      ev.preventDefault()
      ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
      ;(ev.currentTarget as HTMLElement).focus()
      dragging.value = pointAt(ev)
    }
    const onFocusMove = (ev: PointerEvent) => {
      if (dragging.value) dragging.value = pointAt(ev)
    }
    const onFocusUp = () => {
      const point = dragging.value
      dragging.value = null
      if (point) emit('focusChange', `${point[0]}% ${point[1]}%`)
    }
    const onFocusKey = (ev: KeyboardEvent) => {
      const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const move = moves[ev.key]
      if (!move || !props.focus) return
      ev.preventDefault()
      const step = ev.shiftKey ? 1 : 5
      const [x, y] = focusPoint(props.focus.value)
      const clamp = (n: number) => Math.min(100, Math.max(0, n))
      emit('focusChange', `${clamp(x + move[0] * step)}% ${clamp(y + move[1] * step)}%`)
    }

    // URL affichable de la référence (asset:42 → /api/…)
    watchEffect(async () => {
      const src = props.definition.type === 'image' ? String(props.value) : ''
      if (!src) return (preview.value = null)
      if (preview.value?.src === src) return
      const url = await (props.editor?.assets?.resolveSrc(src) ?? src)
      if (String(props.value) === src) preview.value = { src, url }
    })

    const choose = async () => {
      const assets = props.editor?.assets
      if (!assets || busy.value) return
      busy.value = true
      try {
        const ref = await assets.pickRef({ accept: 'image/*' })
        if (ref) emit('change', ref)
      } finally {
        busy.value = false
      }
    }

    const focusField = (url: string) => {
      const focus = props.focus!
      const focusLabel = focus.definition.label ?? 'Cadrage'
      const [x, y] = dragging.value ?? focusPoint(focus.value)
      return [
        h(
          'div',
          {
            class: 'wy-focus',
            tabindex: 0,
            role: 'group',
            'aria-label': `${focusLabel} : ${x} % × ${y} %`,
            onPointerdown: onFocusDown,
            onPointermove: onFocusMove,
            onPointerup: onFocusUp,
            onPointercancel: onFocusUp,
            onKeydown: onFocusKey,
          },
          [
            h('img', { class: 'wy-focus-image', src: url, alt: '', draggable: false }),
            h('span', { class: 'wy-focus-target', style: { left: `${x}%`, top: `${y}%` }, 'aria-hidden': 'true' }),
          ],
        ),
        h('p', { class: 'wy-muted' }, `${focusLabel} : cliquez sur l'image pour placer la cible`),
      ]
    }

    return (): VNode | null => {
      const def = props.definition
      const label = def.label ?? props.name
      const value = props.value

      // Rendu par le champ de son image
      if (def.type === 'focus') return null

      if (def.type === 'image') {
        const src = String(value)
        const canUpload = !!props.editor?.assets
        const loaded = src && preview.value?.src === src ? preview.value.url : null
        return h('div', { role: 'group', 'aria-label': label }, [
          h('span', { class: 'wy-label' }, label),
          h('div', { class: 'wy-image-field' }, [
            ...(loaded && props.focus
              ? focusField(loaded)
              : [
                  loaded
                    ? h('img', { class: 'wy-image-preview', src: loaded, alt: '' })
                    : h('div', { class: 'wy-image-preview wy-image-empty' }, src ? '…' : 'Aucune image'),
                ]),
            h('div', { class: 'wy-image-actions' }, [
              h(
                'button',
                { type: 'button', class: 'wy-btn', disabled: !canUpload || busy.value, onClick: choose },
                busy.value ? 'Envoi…' : src ? 'Remplacer' : 'Choisir une image',
              ),
              src
                ? h('button', { type: 'button', class: 'wy-btn wy-btn-danger', onClick: () => emit('change', '') }, 'Retirer')
                : null,
            ]),
          ]),
        ])
      }

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
      const focusOf = (image: string) =>
        fields.find((f): f is [string, FocusDefinition] => f[1].type === 'focus' && f[1].image === image)
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
              fields
                .filter(([, def]) => def.type !== 'focus')
                .map(([name, def]) => {
                  const focus = def.type === 'image' ? focusOf(name) : undefined
                  return h(ParamField, {
                    key: name,
                    name,
                    definition: def,
                    value: params[name],
                    editor: e,
                    focus: focus && { definition: focus[1], value: params[focus[0]] },
                    onChange: (value: ParamValue) => e.setBlockParams(instance.pos, { [name]: value }),
                    onFocusChange: (value: string) => focus && e.setBlockParams(instance.pos, { [focus[0]]: value }),
                  })
                }),
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
