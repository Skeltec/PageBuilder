import type { BlockEditor, BlockEditorPlugin, BlockInstance } from '../BlockEditor'
import { paramDefaults, type BlockParams, type ParamDefinition, type ParamValue } from '../defineBlock'
import { el, resolveMount, setIcon } from './dom'

export interface BlockSettingsOptions {
  /** Élément (ou sélecteur) où afficher les paramètres */
  mount: HTMLElement | string
}

/** Champ de formulaire : sait se resynchroniser avec la valeur courante */
interface Field {
  element: HTMLElement
  sync: (value: ParamValue) => void
}

/**
 * Paramètres des blocs contenant la sélection : une section par bloc, du plus
 * externe au plus interne (ex. « 3 cartes » puis « Carte »).
 */
export class BlockSettings implements BlockEditorPlugin {
  constructor(private readonly options: BlockSettingsOptions) {}

  attach(editor: BlockEditor) {
    const root = resolveMount(this.options.mount)
    let structure: string | null = null
    let fields: { instance: number; key: string; field: Field }[] = []

    const render = () => {
      const instances = editor.selectedBlocks()
      const key = instances.map((i) => `${i.block.name}@${i.pos}`).join('|')

      // Même blocs sélectionnés : on met juste les valeurs à jour, sans recréer
      // les champs (sinon un slider perdrait le focus pendant qu'on le tire)
      if (key === structure) {
        for (const f of fields) {
          if (f.field.element.contains(document.activeElement) && document.activeElement?.tagName === 'INPUT') continue
          f.field.sync(paramsOf(instances[f.instance])[f.key])
        }
        return
      }

      structure = key
      fields = []
      if (!instances.length) {
        root.replaceChildren(
          el('p', { class: 'py-6 text-center text-sm text-slate-400' }, 'Placez le curseur dans un bloc pour voir ses paramètres.'),
        )
        return
      }
      root.replaceChildren(
        ...instances.map((instance, index) => {
          const isActive = index === instances.length - 1
          const sectionFields = Object.entries(instance.block.params).map(([name, def]) => {
            const field = createField(def, name, paramsOf(instance)[name], (value) =>
              editor.setBlockParams(instance.pos, { [name]: value }),
            )
            fields.push({ instance: index, key: name, field })
            return field.element
          })
          return this.section(editor, instance, instances[index - 1], isActive, sectionFields)
        }),
      )
    }

    render()
    const offs = [editor.on('update', render), editor.on('selectionUpdate', render), editor.on('blocksChange', render)]
    return () => {
      offs.forEach((off) => off())
      root.replaceChildren()
    }
  }

  private section(
    editor: BlockEditor,
    instance: BlockInstance,
    parent: BlockInstance | undefined,
    isActive: boolean,
    fields: HTMLElement[],
  ) {
    const { block } = instance
    const icon = el('span', { class: 'flex size-7 shrink-0 items-center justify-center rounded bg-indigo-50 text-indigo-600' })
    setIcon(icon, block.icon)

    const body = fields.length
      ? el('div', { class: 'mt-3 flex flex-col gap-3' }, ...fields)
      : el('p', { class: 'mt-2 text-xs text-slate-400' }, 'Aucun paramètre')

    const footer = el('div', { class: 'mt-3 flex items-center justify-between border-t border-slate-100 pt-2' })
    if (instance.fixed && parent) {
      footer.append(el('span', { class: 'text-xs text-slate-400' }, `Intégré à « ${parent.block.label} »`))
    } else {
      const remove = el('button', { type: 'button', class: 'ml-auto rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50' }, 'Supprimer le bloc')
      remove.addEventListener('click', () => editor.deleteBlockAt(instance.pos))
      footer.append(remove)
    }

    return el(
      'section',
      {
        class:
          'mb-3 rounded-lg border bg-white p-3 ' + (isActive ? 'border-indigo-300 ring-2 ring-indigo-50' : 'border-slate-200'),
      },
      el(
        'header',
        { class: 'flex items-start gap-2' },
        icon,
        el(
          'div',
          { class: 'min-w-0' },
          el('h3', { class: 'text-sm font-semibold text-slate-800' }, block.label),
          block.description ? el('p', { class: 'text-xs text-slate-500' }, block.description) : '',
        ),
      ),
      body,
      footer,
    )
  }
}

function paramsOf(instance: BlockInstance): BlockParams {
  return (instance.node.attrs.params as BlockParams | undefined) ?? paramDefaults(instance.block.params)
}

const labelClass = 'mb-1 block text-xs font-medium text-slate-600'

function createField(def: ParamDefinition, name: string, value: ParamValue, onChange: (v: ParamValue) => void): Field {
  const label = def.label ?? name
  const id = `param-${name}-${Math.random().toString(36).slice(2, 8)}`

  if (def.type === 'number') {
    const bounded = def.min !== undefined && def.max !== undefined
    const input = el('input', {
      id,
      type: bounded ? 'range' : 'number',
      step: String(def.step ?? 1),
      class: bounded ? 'w-full accent-indigo-600' : 'w-full rounded border border-slate-200 px-2 py-1 text-sm',
      ...(def.min !== undefined && { min: String(def.min) }),
      ...(def.max !== undefined && { max: String(def.max) }),
    })
    const output = el('span', { class: 'text-xs tabular-nums text-slate-500' })
    const sync = (v: ParamValue) => {
      input.value = String(v)
      output.textContent = String(v)
    }
    sync(value)
    input.addEventListener('input', () => {
      if (input.value === '') return
      output.textContent = input.value
      onChange(Number(input.value))
    })
    return {
      element: el(
        'div',
        {},
        el('div', { class: 'flex justify-between' }, el('label', { for: id, class: labelClass }, label), bounded ? output : ''),
        input,
      ),
      sync,
    }
  }

  if (def.type === 'boolean') {
    const input = el('input', { id, type: 'checkbox', class: 'size-4 accent-indigo-600' })
    input.checked = Boolean(value)
    input.addEventListener('change', () => onChange(input.checked))
    return {
      element: el('label', { for: id, class: 'flex items-center gap-2 text-sm text-slate-700' }, input, label),
      sync: (v) => (input.checked = Boolean(v)),
    }
  }

  // select : boutons segmentés jusqu'à 4 options, liste déroulante au-delà
  const entries = Object.entries(def.options)
  if (entries.length <= 4) {
    const buttons = entries.map(([optionValue, optionLabel]) => {
      const b = el(
        'button',
        { type: 'button', class: 'flex-1 rounded px-2 py-1 text-xs', 'data-value': optionValue },
        optionLabel,
      )
      b.addEventListener('click', () => {
        sync(optionValue)
        onChange(optionValue)
      })
      return b
    })
    const sync = (v: ParamValue) => {
      for (const b of buttons) {
        const on = b.dataset.value === v
        b.setAttribute('aria-pressed', String(on))
        b.classList.toggle('bg-white', on)
        b.classList.toggle('shadow-sm', on)
        b.classList.toggle('font-semibold', on)
        b.classList.toggle('text-slate-500', !on)
      }
    }
    sync(value)
    return {
      element: el(
        'div',
        { role: 'group', 'aria-label': label },
        el('span', { class: labelClass }, label),
        el('div', { class: 'flex gap-0.5 rounded-md bg-slate-100 p-0.5' }, ...buttons),
      ),
      sync,
    }
  }

  const select = el(
    'select',
    { id, class: 'w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm' },
    ...entries.map(([v, l]) => el('option', { value: v }, l)),
  )
  select.value = String(value)
  select.addEventListener('change', () => onChange(select.value))
  return {
    element: el('div', {}, el('label', { for: id, class: labelClass }, label), select),
    sync: (v) => (select.value = String(v)),
  }
}
