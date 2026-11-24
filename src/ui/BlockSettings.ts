import type { BlockEditor, BlockEditorView, BlockInstance } from '../core/BlockEditor'
import { paramDefaults, type BlockParams, type ParamDefinition, type ParamValue } from '../core/defineBlock'
import { el, resolveMount, setIcon } from './dom'

export interface BlockSettingsOptions {
  /** Élément (ou sélecteur) où s'afficher ; optionnel dans un conteneur (Sidebar) */
  mount?: HTMLElement | string
}

/** Champ de formulaire : sait se resynchroniser avec la valeur courante */
interface Field {
  element: HTMLElement
  sync: (value: ParamValue) => void
}

/**
 * Fenêtre d'édition : paramètres des blocs contenant la sélection : une section par bloc, du plus
 * externe au plus interne (ex. « 3 cartes » puis « Carte »).
 */
export class BlockSettings implements BlockEditorView {
  constructor(private readonly options: BlockSettingsOptions = {}) {}

  attach(editor: BlockEditor, target?: HTMLElement) {
    const root = resolveMount(target ?? this.options.mount)
    root.classList.add('wy-settings')
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
          el('p', { class: 'wy-empty' }, 'Placez le curseur dans un bloc pour voir ses paramètres.'),
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
      root.classList.remove('wy-settings')
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
    const icon = el('span', { class: 'wy-icon' })
    setIcon(icon, block.icon)

    const body = fields.length
      ? el('div', { class: 'wy-fields' }, ...fields)
      : el('p', { class: 'wy-muted' }, 'Aucun paramètre')

    const footer = el('div', { class: 'wy-section-footer' })
    if (instance.fixed && parent) {
      footer.append(el('span', { class: 'wy-muted' }, `Intégré à « ${parent.block.label} »`))
    } else {
      const remove = el('button', { type: 'button', class: 'wy-btn wy-btn-danger' }, 'Supprimer le bloc')
      remove.addEventListener('click', () => editor.deleteBlockAt(instance.pos))
      footer.append(remove)
    }

    return el(
      'section',
      { class: 'wy-section', ...(isActive && { 'data-active': '' }) },
      el(
        'header',
        { class: 'wy-section-header' },
        icon,
        el(
          'div',
          { class: 'wy-section-title' },
          el('h3', {}, block.label),
          block.description ? el('p', { class: 'wy-muted' }, block.description) : '',
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

const labelClass = 'wy-label'

function createField(def: ParamDefinition, name: string, value: ParamValue, onChange: (v: ParamValue) => void): Field {
  const label = def.label ?? name
  const id = `param-${name}-${Math.random().toString(36).slice(2, 8)}`

  if (def.type === 'number') {
    const bounded = def.min !== undefined && def.max !== undefined
    const input = el('input', {
      id,
      type: bounded ? 'range' : 'number',
      step: String(def.step ?? 1),
      class: bounded ? 'wy-range' : 'wy-input',
      ...(def.min !== undefined && { min: String(def.min) }),
      ...(def.max !== undefined && { max: String(def.max) }),
    })
    const output = el('span', { class: 'wy-value' })
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
        el('div', { class: 'wy-field-head' }, el('label', { for: id, class: labelClass }, label), bounded ? output : ''),
        input,
      ),
      sync,
    }
  }

  if (def.type === 'boolean') {
    const input = el('input', { id, type: 'checkbox', class: 'wy-checkbox' })
    input.checked = Boolean(value)
    input.addEventListener('change', () => onChange(input.checked))
    return {
      element: el('label', { for: id, class: 'wy-check' }, input, label),
      sync: (v) => (input.checked = Boolean(v)),
    }
  }

  // select : boutons segmentés jusqu'à 4 options, liste déroulante au-delà
  const entries = Object.entries(def.options)
  if (entries.length <= 4) {
    const buttons = entries.map(([optionValue, optionLabel]) => {
      const b = el(
        'button',
        { type: 'button', 'data-value': optionValue },
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
      }
    }
    sync(value)
    return {
      element: el(
        'div',
        { role: 'group', 'aria-label': label },
        el('span', { class: labelClass }, label),
        el('div', { class: 'wy-segmented' }, ...buttons),
      ),
      sync,
    }
  }

  const select = el(
    'select',
    { id, class: 'wy-input' },
    ...entries.map(([v, l]) => el('option', { value: v }, l)),
  )
  select.value = String(value)
  select.addEventListener('change', () => onChange(select.value))
  return {
    element: el('div', {}, el('label', { for: id, class: labelClass }, label), select),
    sync: (v) => (select.value = String(v)),
  }
}
