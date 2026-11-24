import { o as paramDefaults, t as BlockEditor } from "./BlockEditor-tlMKRuPA.js";
import { computed, defineComponent, h, inject, onBeforeUnmount, onMounted, onScopeDispose, provide, ref, shallowRef, toValue, watch } from "vue";
//#region src/vue/context.ts
var BlockEditorKey = Symbol("BlockEditor");
/**
* Crée l'éditeur au montage du composant, le détruit au démontage, et le
* fournit aux composants descendants (BlockLibrary, BlockSettings, Toolbar,
* EditorContent…) qui n'ont alors pas besoin de la prop `editor`.
*
*   const editor = useBlockEditor({ blocks, content, assets })
*   // <EditorContent /> affiche la zone éditable
*/
function useBlockEditor(options = {}) {
	const editor = shallowRef();
	onMounted(() => {
		editor.value = new BlockEditor(typeof options === "function" ? options() : options);
	});
	onBeforeUnmount(() => {
		editor.value?.destroy();
		editor.value = void 0;
	});
	provide(BlockEditorKey, editor);
	return editor;
}
/** Fournit un éditeur créé ailleurs (ex. `new BlockEditor(...)` hors de Vue) */
function provideBlockEditor(editor) {
	const ref = computed(() => toValue(editor));
	provide(BlockEditorKey, ref);
	return ref;
}
/** Éditeur de la prop `editor` si fournie, sinon celui fourni par un parent */
function useEditor(prop) {
	const injected = inject(BlockEditorKey, void 0);
	return computed(() => prop() ?? injected?.value);
}
/** S'abonne à un événement de l'éditeur courant (réabonné si l'éditeur change) */
function useEditorEvent(editor, event, listener) {
	let off;
	watch(() => toValue(editor), (e) => {
		off?.();
		off = e?.on(event, listener);
	}, { immediate: true });
	onScopeDispose(() => off?.());
}
/**
* Valeur dérivée de l'éditeur, recalculée à chaque modification, changement
* de sélection ou chargement de bloc. Ex. :
*
*   const isBold = useEditorState(editor, (e) => e.tiptap.isActive('bold'))
*/
function useEditorState(editor, select) {
	const tick = shallowRef(0);
	const bump = () => tick.value++;
	for (const event of [
		"update",
		"selectionUpdate",
		"blocksChange"
	]) useEditorEvent(editor, event, bump);
	return computed(() => {
		tick.value;
		const e = toValue(editor);
		return e ? select(e) : void 0;
	});
}
//#endregion
//#region src/vue/EditorContent.ts
/**
* Zone éditable : insère `editor.element` dans le composant. L'éditeur vient
* de la prop `editor` ou de useBlockEditor() dans un parent.
*/
var EditorContent = defineComponent({
	name: "EditorContent",
	props: { editor: {
		type: Object,
		default: void 0
	} },
	setup(props) {
		const editor = useEditor(() => props.editor);
		const root = ref();
		watch([editor, root], ([e, el], _, onCleanup) => {
			if (!e || !el) return;
			el.append(e.element);
			onCleanup(() => e.element.remove());
		}, {
			immediate: true,
			flush: "post"
		});
		onBeforeUnmount(() => editor.value?.element.remove());
		return () => h("div", {
			ref: root,
			class: "wy-editor-content"
		});
	}
});
//#endregion
//#region src/vue/Toolbar.ts
/** Boutons par défaut ; `editor.tiptap` est relu à chaque appel (l'instance change après un chargement async) */
var defaultToolbarItems = [
	{
		label: "B",
		title: "Gras",
		run: (e) => e.tiptap.chain().focus().toggleBold().run(),
		active: (e) => e.tiptap.isActive("bold")
	},
	{
		label: "I",
		title: "Italique",
		run: (e) => e.tiptap.chain().focus().toggleItalic().run(),
		active: (e) => e.tiptap.isActive("italic")
	},
	{
		label: "H2",
		title: "Titre",
		run: (e) => e.tiptap.chain().focus().toggleHeading({ level: 2 }).run(),
		active: (e) => e.tiptap.isActive("heading", { level: 2 })
	},
	{
		label: "• Liste",
		title: "Liste à puces",
		run: (e) => e.tiptap.chain().focus().toggleBulletList().run(),
		active: (e) => e.tiptap.isActive("bulletList")
	},
	{
		label: "🖼 Image",
		title: "Téléverser une image",
		run: (e) => e.assets?.pickFiles({ accept: "image/*" }),
		visible: (e) => e.assets !== null
	},
	{
		label: "🔗 Page",
		title: "Lien vers une page",
		run: (e) => e.links?.insert(),
		active: (e) => e.links?.activeScheme() != null,
		visible: (e) => e.links !== null
	},
	{
		label: "📎 Fichier",
		title: "Joindre un fichier",
		run: (e) => e.assets?.pickFiles(),
		visible: (e) => e.assets !== null
	},
	{
		label: "✕ Supprimer bloc",
		title: "Supprimer le bloc courant",
		run: (e) => e.deleteCurrentBlock()
	}
];
/**
* Barre d'outils : mise en forme + téléversement (si `assets` est configuré)
* et état des envois. Slot par défaut : boutons supplémentaires.
*/
var Toolbar = defineComponent({
	name: "Toolbar",
	props: {
		editor: {
			type: Object,
			default: void 0
		},
		items: {
			type: Array,
			default: () => defaultToolbarItems
		}
	},
	setup(props, { slots }) {
		const editor = useEditor(() => props.editor);
		const pressed = useEditorState(editor, (e) => props.items.map((i) => i.active?.(e)));
		const uploading = ref(0);
		const message = ref("");
		const error = ref(false);
		useEditorEvent(editor, "uploadStart", () => {
			uploading.value++;
			message.value = "";
		});
		useEditorEvent(editor, "uploadEnd", () => uploading.value--);
		useEditorEvent(editor, "uploadError", ({ file, error: err, stage }) => {
			if (stage === "upload") uploading.value = Math.max(0, uploading.value - 1);
			message.value = stage === "validation" && err instanceof Error ? err.message : `Échec de l'envoi : ${file.name}`;
			error.value = true;
		});
		return () => {
			const e = editor.value;
			const status = uploading.value ? `Envoi de ${uploading.value} fichier(s)…` : message.value;
			return h("div", {
				class: "wy-toolbar",
				role: "toolbar"
			}, [
				...props.items.map((item, i) => !e || (item.visible?.(e) ?? true) ? h("button", {
					type: "button",
					class: "wy-btn",
					title: item.title,
					disabled: !e,
					"aria-pressed": item.active ? String(Boolean(pressed.value?.[i])) : void 0,
					onMousedown: (ev) => ev.preventDefault(),
					onClick: () => e && item.run(e)
				}, item.label) : null),
				slots.default?.({ editor: e }),
				h("span", {
					class: "wy-toolbar-status",
					"aria-live": "polite",
					"data-error": !uploading.value && error.value && status ? "" : void 0
				}, status)
			]);
		};
	}
});
//#endregion
//#region src/vue/utils.ts
/** Minuscules, sans accents : « Témoignage » trouvé avec « temoi » */
function normalize(text) {
	return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}
/** localStorage peut être indisponible (navigation privée, bloqué, SSR) */
var storage = {
	get(key) {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	set(key, value) {
		try {
			localStorage.setItem(key, value);
		} catch {}
	}
};
var DEFAULT_ICON = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/></svg>";
/**
* Props d'une icône de bloc : SVG inline (fourni par la définition du bloc,
* donc par le développeur) ou texte (emoji).
*/
function iconProps(icon = DEFAULT_ICON) {
	return icon.trimStart().startsWith("<svg") ? { innerHTML: icon.replace("<svg", "<svg class=\"wy-icon-svg\"") } : { textContent: icon };
}
//#endregion
//#region src/vue/BlockLibrary.ts
var VIEW_KEY = "block-library-view";
/**
* Librairie de blocs (« librairie de composantes ») : recherche, vue liste
* (icône + description) ou vignettes. Clic = insertion au curseur ;
* glisser-déposer dans l'éditeur = insertion à l'endroit du dépôt.
* Slot `item` ({ block, insert }) pour personnaliser le rendu d'un bloc.
*/
var BlockLibrary = defineComponent({
	name: "BlockLibrary",
	props: {
		editor: {
			type: Object,
			default: void 0
		},
		/** Vue initiale (défaut : "list") ; le choix de l'utilisateur est mémorisé */
		view: {
			type: String,
			default: void 0
		}
	},
	emits: { insert: (_block) => true },
	setup(props, { slots, emit }) {
		const editor = useEditor(() => props.editor);
		const blocks = useEditorState(editor, (e) => e.blocks);
		const query = ref("");
		const view = ref(storage.get(VIEW_KEY) ?? props.view ?? "list");
		const setView = (v) => {
			view.value = v;
			storage.set(VIEW_KEY, v);
		};
		const filtered = computed(() => {
			const q = normalize(query.value);
			return (blocks.value ?? []).filter((b) => normalize(`${b.label} ${b.name} ${b.description ?? ""}`).includes(q));
		});
		/** Aperçus HTML générés, par nom de bloc (le template d'un bloc ne change pas) */
		const previews = /* @__PURE__ */ new Map();
		const previewHTML = (e, name) => {
			let html = previews.get(name);
			if (html === void 0) {
				html = e.blockHTML(name, { sample: true });
				previews.set(name, html);
			}
			return html;
		};
		const insert = (block) => {
			editor.value?.insertBlock(block.name);
			emit("insert", block);
		};
		const onDragstart = (block, ev) => {
			const e = editor.value;
			if (!e || !ev.dataTransfer) return;
			ev.dataTransfer.setData("text/html", e.blockHTML(block.name));
			ev.dataTransfer.setData("text/plain", block.label);
			ev.dataTransfer.effectAllowed = "copy";
		};
		const viewButton = (v, label, title) => h("button", {
			type: "button",
			class: "wy-btn",
			title,
			"aria-label": title,
			"aria-pressed": String(view.value === v),
			onClick: () => setView(v)
		}, label);
		const content = (e, block) => view.value === "grid" ? [h("span", { class: "block-thumb wy-library-thumb" }, block.thumbnail ? h("img", {
			src: block.thumbnail,
			alt: ""
		}) : h("span", {
			class: "block-thumb-inner rich-content",
			"aria-hidden": "true",
			innerHTML: previewHTML(e, block.name)
		})), h("span", { class: "wy-library-label" }, block.label)] : [h("span", {
			class: "wy-icon",
			...iconProps(block.icon)
		}), h("span", { class: "wy-library-text" }, [h("span", { class: "wy-library-label" }, block.label), block.description ? h("span", { class: "wy-library-desc" }, block.description) : null])];
		return () => {
			const e = editor.value;
			const list = filtered.value;
			return h("div", { class: "wy-library" }, [h("div", { class: "wy-library-head" }, [h("input", {
				type: "search",
				class: "wy-input",
				placeholder: "Rechercher un bloc…",
				value: query.value,
				onInput: (ev) => query.value = ev.target.value
			}), h("div", { class: "wy-btn-group" }, [viewButton("list", "☰", "Vue liste"), viewButton("grid", "▦", "Vue vignettes")])]), !e || !list.length ? h("p", { class: "wy-empty" }, e ? "Aucun bloc trouvé" : "") : h("div", { class: view.value === "grid" ? "wy-library-grid" : "wy-library-list" }, list.map((block) => slots.item ? slots.item({
				block,
				insert: () => insert(block)
			}) : h("button", {
				key: block.name,
				type: "button",
				draggable: "true",
				class: view.value === "grid" ? "wy-library-tile" : "wy-library-item",
				title: block.description ?? block.label,
				onClick: () => insert(block),
				onDragstart: (ev) => onDragstart(block, ev)
			}, content(e, block))))]);
		};
	}
});
//#endregion
//#region src/vue/BlockSettings.ts
var uid = 0;
function paramsOf(instance) {
	return instance.node.attrs.params ?? paramDefaults(instance.block.params);
}
/** Champ de paramètre : nombre (curseur si borné), case à cocher, choix (segmenté ≤ 4 options, sinon liste) */
var ParamField = defineComponent({
	name: "ParamField",
	props: {
		name: {
			type: String,
			required: true
		},
		definition: {
			type: Object,
			required: true
		},
		value: {
			type: [
				Number,
				String,
				Boolean
			],
			required: true
		}
	},
	emits: { change: (_value) => true },
	setup(props, { emit }) {
		const id = `wy-param-${++uid}`;
		return () => {
			const def = props.definition;
			const label = def.label ?? props.name;
			const value = props.value;
			if (def.type === "number") {
				const bounded = def.min !== void 0 && def.max !== void 0;
				return h("div", [h("div", { class: "wy-field-head" }, [h("label", {
					for: id,
					class: "wy-label"
				}, label), bounded ? h("span", { class: "wy-value" }, String(value)) : null]), h("input", {
					id,
					type: bounded ? "range" : "number",
					class: bounded ? "wy-range" : "wy-input",
					min: def.min,
					max: def.max,
					step: def.step ?? 1,
					value,
					onInput: (ev) => {
						const raw = ev.target.value;
						if (raw !== "") emit("change", Number(raw));
					}
				})]);
			}
			if (def.type === "boolean") return h("label", {
				for: id,
				class: "wy-check"
			}, [h("input", {
				id,
				type: "checkbox",
				class: "wy-checkbox",
				checked: Boolean(value),
				onChange: (ev) => emit("change", ev.target.checked)
			}), label]);
			const entries = Object.entries(def.options);
			if (entries.length <= 4) return h("div", {
				role: "group",
				"aria-label": label
			}, [h("span", { class: "wy-label" }, label), h("div", { class: "wy-segmented" }, entries.map(([v, l]) => h("button", {
				key: v,
				type: "button",
				"aria-pressed": String(v === value),
				onClick: () => emit("change", v)
			}, l)))]);
			return h("div", [h("label", {
				for: id,
				class: "wy-label"
			}, label), h("select", {
				id,
				class: "wy-input",
				value,
				onChange: (ev) => emit("change", ev.target.value)
			}, entries.map(([v, l]) => h("option", {
				key: v,
				value: v
			}, l)))]);
		};
	}
});
/**
* Fenêtre d'édition : paramètres des blocs contenant la sélection, une section
* par bloc, du plus externe au plus interne (ex. « 3 cartes » puis « Carte »).
* Slot `empty` : contenu affiché sans bloc sélectionné.
*/
var BlockSettings = defineComponent({
	name: "BlockSettings",
	props: { editor: {
		type: Object,
		default: void 0
	} },
	setup(props, { slots }) {
		const editor = useEditor(() => props.editor);
		const instances = useEditorState(editor, (e) => e.selectedBlocks());
		const section = (e, instance, parent, active) => {
			const { block } = instance;
			const params = paramsOf(instance);
			const fields = Object.entries(block.params);
			return h("section", {
				key: block.name,
				class: "wy-section",
				"data-active": active ? "" : void 0
			}, [
				h("header", { class: "wy-section-header" }, [h("span", {
					class: "wy-icon",
					...iconProps(block.icon)
				}), h("div", { class: "wy-section-title" }, [h("h3", block.label), block.description ? h("p", { class: "wy-muted" }, block.description) : null])]),
				fields.length ? h("div", { class: "wy-fields" }, fields.map(([name, def]) => h(ParamField, {
					key: name,
					name,
					definition: def,
					value: params[name],
					onChange: (value) => e.setBlockParams(instance.pos, { [name]: value })
				}))) : h("p", { class: "wy-muted" }, "Aucun paramètre"),
				h("div", { class: "wy-section-footer" }, [instance.fixed && parent ? h("span", { class: "wy-muted" }, `Intégré à « ${parent.block.label} »`) : h("button", {
					type: "button",
					class: "wy-btn wy-btn-danger",
					onClick: () => e.deleteBlockAt(instance.pos)
				}, "Supprimer le bloc")])
			]);
		};
		return () => {
			const e = editor.value;
			const list = instances.value ?? [];
			return h("div", { class: "wy-settings" }, e && list.length ? list.map((instance, i) => section(e, instance, list[i - 1], i === list.length - 1)) : slots.empty?.() ?? h("p", { class: "wy-empty" }, "Placez le curseur dans un bloc pour voir ses paramètres."));
		};
	}
});
//#endregion
//#region src/vue/Sidebar.ts
/**
* Panneau latéral repliable : conteneur pour BlockLibrary, BlockSettings ou
* vos propres composants (slot par défaut). Slot `header` pour remplacer le titre.
*
*   <Sidebar title="Blocs" persist-key="left"><BlockLibrary /></Sidebar>
*/
var Sidebar = defineComponent({
	name: "Sidebar",
	props: {
		/** Côté de l'éditeur : oriente le bouton et le rail replié */
		side: {
			type: String,
			default: "left"
		},
		title: {
			type: String,
			default: ""
		},
		collapsible: {
			type: Boolean,
			default: true
		},
		/** État replié (v-model:collapsed) ; sinon géré en interne */
		collapsed: {
			type: Boolean,
			default: void 0
		},
		/** Clé localStorage pour mémoriser l'état replié */
		persistKey: {
			type: String,
			default: void 0
		}
	},
	emits: { "update:collapsed": (_value) => true },
	setup(props, { slots, emit }) {
		const storageKey = () => props.persistKey ? `wy-sidebar-${props.persistKey}` : void 0;
		const key = storageKey();
		const internal = ref(props.collapsed ?? (key ? storage.get(key) === "1" : false));
		watch(() => props.collapsed, (v) => {
			if (v !== void 0) internal.value = v;
		});
		const toggle = () => {
			internal.value = !internal.value;
			const k = storageKey();
			if (k) storage.set(k, internal.value ? "1" : "0");
			emit("update:collapsed", internal.value);
		};
		return () => {
			const collapsed = internal.value;
			return h("aside", {
				class: "wy-sidebar",
				"data-side": props.side,
				"data-collapsed": collapsed ? "" : void 0
			}, [h("div", { class: "wy-sidebar-header" }, [slots.header?.({ collapsed }) ?? h("h2", { class: "wy-sidebar-title" }, props.title), props.collapsible ? h("button", {
				type: "button",
				class: "wy-btn wy-sidebar-toggle",
				"aria-expanded": String(!collapsed),
				"aria-label": `${collapsed ? "Déplier" : "Replier"} ${props.title}`.trim(),
				onClick: toggle
			}, collapsed === (props.side === "left") ? "»" : "«") : null]), h("div", {
				class: "wy-sidebar-body",
				style: collapsed ? { display: "none" } : void 0
			}, slots.default?.())]);
		};
	}
});
//#endregion
export { BlockEditorKey, BlockLibrary, BlockSettings, EditorContent, ParamField, Sidebar, Toolbar, defaultToolbarItems, provideBlockEditor, useBlockEditor, useEditor, useEditorEvent, useEditorState };

//# sourceMappingURL=vue.js.map