import { defineComponent, h, ref, watch, type PropType } from 'vue'
import { storage } from './utils'

/**
 * Panneau latéral repliable : conteneur pour BlockLibrary, BlockSettings ou
 * vos propres composants (slot par défaut). Slot `header` pour remplacer le titre.
 *
 *   <Sidebar title="Blocs" persist-key="left"><BlockLibrary /></Sidebar>
 */
export const Sidebar = defineComponent({
  name: 'Sidebar',
  props: {
    /** Côté de l'éditeur : oriente le bouton et le rail replié */
    side: { type: String as PropType<'left' | 'right'>, default: 'left' },
    title: { type: String, default: '' },
    collapsible: { type: Boolean, default: true },
    /** État replié (v-model:collapsed) ; sinon géré en interne */
    collapsed: { type: Boolean, default: undefined },
    /** Clé localStorage pour mémoriser l'état replié */
    persistKey: { type: String, default: undefined },
  },
  emits: { 'update:collapsed': (_value: boolean) => true },
  setup(props, { slots, emit }) {
    const storageKey = () => (props.persistKey ? `wy-sidebar-${props.persistKey}` : undefined)
    const key = storageKey()
    const internal = ref(props.collapsed ?? (key ? storage.get(key) === '1' : false))
    watch(
      () => props.collapsed,
      (v) => {
        if (v !== undefined) internal.value = v
      },
    )

    const toggle = () => {
      internal.value = !internal.value
      const k = storageKey()
      if (k) storage.set(k, internal.value ? '1' : '0')
      emit('update:collapsed', internal.value)
    }

    return () => {
      const collapsed = internal.value
      return h(
        'aside',
        { class: 'wy-sidebar', 'data-side': props.side, 'data-collapsed': collapsed ? '' : undefined },
        [
          h('div', { class: 'wy-sidebar-header' }, [
            slots.header?.({ collapsed }) ?? h('h2', { class: 'wy-sidebar-title' }, props.title),
            props.collapsible
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'wy-btn wy-sidebar-toggle',
                    'aria-expanded': String(!collapsed),
                    'aria-label': `${collapsed ? 'Déplier' : 'Replier'} ${props.title}`.trim(),
                    onClick: toggle,
                  },
                  collapsed === (props.side === 'left') ? '»' : '«',
                )
              : null,
          ]),
          // v-show plutôt que v-if : les composants enfants gardent leur état
          h('div', { class: 'wy-sidebar-body', style: collapsed ? { display: 'none' } : undefined }, slots.default?.()),
        ],
      )
    }
  },
})
