import { Editor, Extension, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder, TrailingNode } from "@tiptap/extensions";
import { DOMSerializer } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import DOMPurify from "dompurify";
//#region src/assets/AssetImage.ts
/** Pas de javascript:, vbscript:… dans un src chargé depuis du HTML externe */
function safeSrc(src) {
	if (!src) return null;
	return /^\s*(javascript|vbscript|data:(?!image\/))/i.test(src) ? null : src;
}
/**
* Image (bloc). Le HTML sauvegardé garde le src tel quel — une référence
* `asset:42` pour un fichier téléversé ; seule la vue dans l'éditeur affiche
* l'URL résolue.
*/
var AssetImage = Node.create({
	name: "image",
	group: "block",
	atom: true,
	draggable: true,
	selectable: true,
	addOptions() {
		return { resolveSrc: (src) => src };
	},
	addAttributes() {
		return {
			src: {
				default: null,
				parseHTML: (el) => safeSrc(el.getAttribute("src"))
			},
			alt: { default: null },
			title: { default: null },
			uploadId: {
				default: null,
				parseHTML: (el) => el.getAttribute("data-upload-id"),
				renderHTML: (attrs) => attrs.uploadId ? { "data-upload-id": attrs.uploadId } : {}
			}
		};
	},
	parseHTML() {
		return [{
			tag: "img[src]",
			getAttrs: (el) => safeSrc(el.getAttribute("src")) ? null : false
		}];
	},
	renderHTML({ HTMLAttributes }) {
		return ["img", mergeAttributes(HTMLAttributes)];
	},
	addNodeView() {
		return ({ node }) => {
			const img = document.createElement("img");
			let current = node;
			const apply = (n) => {
				current = n;
				img.alt = n.attrs.alt ?? "";
				if (n.attrs.title) img.title = n.attrs.title;
				img.classList.toggle("is-uploading", Boolean(n.attrs.uploadId));
				const src = n.attrs.src;
				if (!src) return img.removeAttribute("src");
				Promise.resolve(this.options.resolveSrc(src)).then((url) => {
					if (current.attrs.src === src) img.src = url;
				}, () => img.classList.add("is-broken"));
			};
			apply(node);
			return {
				dom: img,
				update: (updated) => {
					if (updated.type !== node.type) return false;
					if (updated.attrs.src !== current.attrs.src || updated.attrs.uploadId !== current.attrs.uploadId || updated.attrs.alt !== current.attrs.alt) apply(updated);
					return true;
				}
			};
		};
	}
});
//#endregion
//#region src/core/insertion.ts
/**
* Où insérer un nœud de bloc près de `pos` sans couper le texte : à la place
* d'un paragraphe vide, sinon juste après le nœud courant, au premier niveau
* qui accepte ce type (pas dans un titre de Hero, par exemple). En dernier
* recours : fin du document.
*/
function insertionRangeAt(state, pos, type) {
	const fits = (at) => {
		const $at = state.doc.resolve(at);
		return $at.parent.canReplaceWith($at.index(), $at.index(), type);
	};
	const $from = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
	for (let d = $from.depth; d >= 1; d--) {
		const current = $from.node(d);
		const parent = $from.node(d - 1);
		const index = $from.index(d - 1);
		if (d === $from.depth && current.isTextblock && !current.content.size && parent.canReplaceWith(index, index + 1, type)) return {
			from: $from.before(d),
			to: $from.after(d)
		};
		if (fits($from.after(d))) return {
			from: $from.after(d),
			to: $from.after(d)
		};
	}
	if (fits($from.pos)) return {
		from: $from.pos,
		to: $from.pos
	};
	const end = state.doc.content.size;
	return {
		from: end,
		to: end
	};
}
/** Comme insertionRangeAt, à partir de la sélection courante */
function insertionRange(state, type) {
	const { selection } = state;
	if (selection instanceof NodeSelection) {
		const $to = state.doc.resolve(selection.to);
		if ($to.parent.canReplaceWith($to.index(), $to.index(), type)) return {
			from: selection.to,
			to: selection.to
		};
	}
	return insertionRangeAt(state, selection.from, type);
}
//#endregion
//#region src/refs/refs.ts
/** Schéma valide : lettres, chiffres, + . - (RFC 3986), commence par une lettre */
function assertScheme(scheme) {
	if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) throw new Error(`Schéma de référence invalide : ${scheme}`);
	return scheme;
}
function toRef(scheme, id) {
	return `${scheme}:${encodeURIComponent(id)}`;
}
/** `page:42` → "42" ; null si ce n'est pas une référence de ce schéma */
function parseRef(value, scheme) {
	if (!value?.startsWith(`${scheme}:`)) return null;
	try {
		return decodeURIComponent(value.slice(scheme.length + 1)) || null;
	} catch {
		return null;
	}
}
/** Ids référencés dans un HTML pour un schéma (ex. fichiers orphelins, liens sortants) */
function listRefIds(html, scheme) {
	const ids = /* @__PURE__ */ new Set();
	for (const m of html.matchAll(attrPattern([scheme]))) {
		const id = parseRef(`${scheme}:${m[4]}`, scheme);
		if (id) ids.add(id);
	}
	return [...ids];
}
/**
* Remplace chaque référence (attributs src / href) par l'URL retournée par le
* resolver de son schéma. Schémas absents de `resolvers` : laissés tels quels.
* Un resolver qui retourne "" laisse aussi la référence intacte.
*
*   const html = await resolveRefs(saved, {
*     asset: (id) => `/api/files/${id}`,
*     page: (id) => router.resolve({ name: 'page', params: { id } }).href,
*   })
*/
async function resolveRefs(html, resolvers) {
	const schemes = Object.keys(resolvers).map(assertScheme);
	if (!schemes.length) return html;
	const urls = /* @__PURE__ */ new Map();
	await Promise.all(schemes.flatMap((scheme) => listRefIds(html, scheme).map(async (id) => urls.set(`${scheme}:${id}`, await resolvers[scheme](id)))));
	return html.replace(attrPattern(schemes), (whole, attr, quote, scheme, raw) => {
		const id = parseRef(`${scheme}:${raw}`, scheme);
		const url = id && urls.get(`${scheme}:${id}`);
		return url ? `${attr}=${quote}${escapeAttr(url)}${quote}` : whole;
	});
}
var escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Groupes : 1 attribut, 2 guillemet, 3 schéma, 4 id encodé */
function attrPattern(schemes) {
	return new RegExp(`\\b(src|href)=(["'])(${schemes.map(escapeRegExp).join("|")}):([^"']*)\\2`, "g");
}
//#endregion
//#region src/assets/refs.ts
/**
* Références de fichiers (`asset:42`) : raccourcis des références génériques
* (refs/refs.ts) pour le schéma des fichiers.
*/
var DEFAULT_SCHEME = "asset";
function toAssetRef(id, scheme = DEFAULT_SCHEME) {
	return toRef(scheme, id);
}
/** `asset:42` → "42" ; null si ce n'est pas une référence */
function parseAssetRef(value, scheme = DEFAULT_SCHEME) {
	return parseRef(value, scheme);
}
/** Ids de fichiers référencés dans un HTML (ex. pour nettoyer les orphelins) */
function listAssetIds(html, scheme = DEFAULT_SCHEME) {
	return listRefIds(html, scheme);
}
/**
* Remplace chaque référence `asset:id` par l'URL retournée par `resolve`.
* Pour plusieurs schémas à la fois (fichiers + liens), voir resolveRefs.
*/
function resolveAssetRefs(html, resolve, scheme = DEFAULT_SCHEME) {
	return resolveRefs(html, { [scheme]: resolve });
}
//#endregion
//#region src/assets/types.ts
/** Type de fichier → rendu : image en ligne, sinon lien de téléchargement */
function isImage(file) {
	return file.type.startsWith("image/");
}
/** Le fichier respecte-t-il `accept` (même syntaxe que <input accept>) ? */
function acceptsFile(accept, file) {
	if (!accept?.trim()) return true;
	return accept.split(",").some((raw) => {
		const rule = raw.trim().toLowerCase();
		if (!rule) return false;
		if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule);
		if (rule.endsWith("/*")) return file.type.toLowerCase().startsWith(rule.slice(0, -1));
		return file.type.toLowerCase() === rule;
	});
}
//#endregion
//#region src/assets/AssetManager.ts
/** `accept` ne vise que des images (image/*, image/png…) */
var onlyImages = (accept) => !!accept?.trim() && accept.split(",").every((rule) => rule.trim().toLowerCase().startsWith("image/"));
/** Positions des fichiers joints en cours d'envoi, suivies au fil des modifications */
var pendingKey = new PluginKey("assetPending");
/**
* Gère les fichiers de l'éditeur : téléversement (bouton, coller, glisser-
* déposer), insertion (image ou lien) et résolution des références `asset:id`.
* Accessible via `editor.assets` quand un AssetAdapter est configuré.
*/
var AssetManager = class {
	adapter;
	host;
	scheme;
	urls = /* @__PURE__ */ new Map();
	abort = new AbortController();
	/** @internal Créé par BlockEditor */
	constructor(adapter, host) {
		this.adapter = adapter;
		this.host = host;
		this.scheme = adapter.scheme ?? "asset";
	}
	get accept() {
		return this.adapter.accept;
	}
	/** Référence à stocker dans le HTML pour cet id (`asset:42`) */
	ref(id) {
		return toAssetRef(id, this.scheme);
	}
	/** id → URL (mise en cache ; une erreur n'est pas mise en cache) */
	resolveUrl(id) {
		let url = this.urls.get(id);
		if (!url) {
			url = Promise.resolve(this.adapter.resolve(id));
			url.catch(() => this.urls.delete(id));
			this.urls.set(id, url);
		}
		return url;
	}
	/** src / href quelconque → URL affichable (les URLs normales passent telles quelles) */
	resolveSrc(src) {
		const id = parseAssetRef(src, this.scheme);
		return id ? this.resolveUrl(id) : src;
	}
	/**
	* Ouvre le sélecteur de fichiers puis téléverse et insère ; [] si annulé.
	* Avec `adapter.pick` : choisit des fichiers existants et les insère.
	*/
	async pickFiles({ accept = this.adapter.accept, multiple = true } = {}) {
		if (this.adapter.pick) {
			const refs = await this.adapter.pick({
				accept,
				multiple,
				current: null
			}) ?? [];
			const chosen = multiple ? refs : refs.slice(0, 1);
			this.insert(chosen, void 0, accept);
			return chosen;
		}
		return new Promise((resolve) => {
			const input = document.createElement("input");
			input.type = "file";
			input.multiple = multiple;
			if (accept) input.accept = accept;
			input.addEventListener("change", () => resolve(this.upload(Array.from(input.files ?? []))));
			input.addEventListener("cancel", () => resolve([]));
			input.click();
		});
	}
	/**
	* Ouvre le sélecteur, téléverse un seul fichier et retourne sa référence
	* (`asset:42`) sans rien insérer : valeur d'un paramètre image de bloc.
	* null si annulé ou refusé (uploadError émis).
	* Avec `adapter.pick` : choisit un fichier existant ; `current` (référence ou
	* URL actuelle) lui est transmis pour présélection.
	*/
	async pickRef({ accept = "image/*", current = null } = {}) {
		if (this.adapter.pick) {
			const refs = await this.adapter.pick({
				accept,
				multiple: false,
				current: parseAssetRef(current, this.scheme)
			});
			return refs?.length ? this.ref(refs[0].id) : null;
		}
		return new Promise((resolve) => {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = accept;
			input.addEventListener("change", () => {
				const file = input.files?.[0];
				resolve(file ? this.uploadRef(file) : null);
			});
			input.addEventListener("cancel", () => resolve(null));
			input.click();
		});
	}
	/**
	* Insère des fichiers déjà téléversés (ex. choisis dans une médiathèque) :
	* images en bloc <img> (alt de la référence), autres fichiers en lien.
	* Image ou lien selon `ref.type`, à défaut selon `accept`. `at` : position
	* d'insertion (défaut : curseur).
	*/
	insert(refs, at, accept) {
		let pos = at;
		for (const ref of refs) pos = (ref.type ? ref.type.startsWith("image/") : onlyImages(accept)) ? this.insertImage(ref, pos) : this.insertLink(this.ref(ref.id), ref.name ?? ref.id, pos);
	}
	/** Téléverse un fichier sans l'insérer ; retourne sa référence, null si refusé ou en erreur */
	async uploadRef(file) {
		const problem = this.validate(file);
		if (problem) {
			this.host.emit("uploadError", {
				file,
				error: new Error(problem),
				stage: "validation"
			});
			return null;
		}
		this.host.emit("uploadStart", { file });
		try {
			const ref = await this.adapter.upload(file, { signal: this.abort.signal });
			if (this.abort.signal.aborted) return null;
			this.host.emit("uploadEnd", {
				file,
				ref
			});
			return this.ref(ref.id);
		} catch (error) {
			if (!this.abort.signal.aborted) this.host.emit("uploadError", {
				file,
				error,
				stage: "upload"
			});
			return null;
		}
	}
	/**
	* Téléverse et insère des fichiers : images en bloc <img>, autres fichiers en
	* lien. `at` : position d'insertion (défaut : curseur). Les fichiers refusés
	* (accept, maxSize) émettent uploadError.
	*/
	async upload(files, at) {
		const editor = this.host.tiptap();
		let pos = at ?? editor.state.selection.from;
		const jobs = [];
		for (const file of files) {
			const problem = this.validate(file);
			if (problem) {
				this.host.emit("uploadError", {
					file,
					error: new Error(problem),
					stage: "validation"
				});
				continue;
			}
			const token = Math.random().toString(36).slice(2, 10);
			pos = isImage(file) ? this.insertImagePlaceholder(file, token, pos) : this.trackPending(token, pos);
			jobs.push(this.send(file, token));
		}
		return (await Promise.all(jobs)).filter((r) => r !== null);
	}
	/** @internal Extension : coller / déposer des fichiers, suivi des positions */
	extension() {
		const manager = this;
		return Extension.create({
			name: "assetUpload",
			addProseMirrorPlugins: () => [new Plugin({
				key: pendingKey,
				state: {
					init: () => /* @__PURE__ */ new Map(),
					apply(tr, value) {
						const meta = tr.getMeta(pendingKey);
						if (!tr.docChanged && !meta) return value;
						const next = /* @__PURE__ */ new Map();
						for (const [k, p] of value) next.set(k, tr.mapping.map(p));
						if (meta?.add) next.set(...meta.add);
						if (meta?.remove) next.delete(meta.remove);
						return next;
					}
				},
				props: {
					handlePaste(_view, event) {
						const files = Array.from(event.clipboardData?.files ?? []);
						if (!files.length) return false;
						manager.upload(files);
						return true;
					},
					handleDrop(view, event, _slice, moved) {
						const files = Array.from(event.dataTransfer?.files ?? []);
						if (moved || !files.length) return false;
						event.preventDefault();
						const hit = view.posAtCoords({
							left: event.clientX,
							top: event.clientY
						});
						manager.upload(files, hit?.pos);
						return true;
					}
				}
			})]
		});
	}
	/** @internal */
	destroy() {
		this.abort.abort();
	}
	validate(file) {
		if (!acceptsFile(this.adapter.accept, file)) return `Type de fichier refusé : ${file.name}`;
		if (this.adapter.maxSize !== void 0 && file.size > this.adapter.maxSize) return `Fichier trop volumineux : ${file.name}`;
		return null;
	}
	async send(file, token) {
		this.host.emit("uploadStart", { file });
		try {
			const ref = await this.adapter.upload(file, { signal: this.abort.signal });
			if (this.abort.signal.aborted) return null;
			if (isImage(file)) this.finishImage(token, this.ref(ref.id));
			else this.insertFileLink(token, this.ref(ref.id), ref.name ?? file.name);
			this.host.emit("uploadEnd", {
				file,
				ref
			});
			return ref;
		} catch (error) {
			if (this.abort.signal.aborted) return null;
			if (isImage(file)) this.removeImage(token);
			else this.untrack(token);
			this.host.emit("uploadError", {
				file,
				error,
				stage: "upload"
			});
			return null;
		}
	}
	/** Image affichée tout de suite (blob:), en attente de son id ; retourne la position suivante */
	insertImagePlaceholder(file, token, pos) {
		const { state, view } = this.host.tiptap();
		const type = state.schema.nodes.image;
		const node = type.create({
			src: URL.createObjectURL(file),
			alt: file.name,
			uploadId: token
		});
		const range = insertionRangeAt(state, pos, type);
		const tr = state.tr.replaceWith(range.from, range.to, node);
		view.dispatch(tr.scrollIntoView());
		return range.from + node.nodeSize;
	}
	/** Image déjà téléversée ; retourne la position suivante */
	insertImage(ref, pos) {
		const { state, view } = this.host.tiptap();
		const type = state.schema.nodes.image;
		const node = type.create({
			src: this.ref(ref.id),
			alt: ref.alt ?? ref.name ?? ""
		});
		const range = pos === void 0 ? insertionRange(state, type) : insertionRangeAt(state, pos, type);
		view.dispatch(state.tr.replaceWith(range.from, range.to, node).scrollIntoView());
		return range.from + node.nodeSize;
	}
	findImage(token) {
		const { state } = this.host.tiptap();
		let found = null;
		state.doc.descendants((node, pos) => {
			if (found) return false;
			if (node.type.name === "image" && node.attrs.uploadId === token) found = {
				pos,
				src: node.attrs.src
			};
		});
		return found;
	}
	finishImage(token, ref) {
		const found = this.findImage(token);
		if (!found) return;
		const { state, view } = this.host.tiptap();
		const node = state.doc.nodeAt(found.pos);
		view.dispatch(state.tr.setNodeMarkup(found.pos, void 0, {
			...node.attrs,
			src: ref,
			uploadId: null
		}));
		setTimeout(() => URL.revokeObjectURL(found.src), 3e4);
	}
	removeImage(token) {
		const found = this.findImage(token);
		if (!found) return;
		const { state, view } = this.host.tiptap();
		view.dispatch(state.tr.delete(found.pos, found.pos + state.doc.nodeAt(found.pos).nodeSize));
		URL.revokeObjectURL(found.src);
	}
	/** Mémorise la position d'un fichier joint ; retourne la position suivante */
	trackPending(token, pos) {
		const { state, view } = this.host.tiptap();
		view.dispatch(state.tr.setMeta(pendingKey, { add: [token, pos] }));
		return pos;
	}
	untrack(token) {
		const { state, view } = this.host.tiptap();
		view.dispatch(state.tr.setMeta(pendingKey, { remove: token }));
	}
	/** Lien d'un fichier en cours d'envoi, à la position suivie */
	insertFileLink(token, ref, name) {
		const { state } = this.host.tiptap();
		const tracked = pendingKey.getState(state)?.get(token);
		this.insertLink(ref, name, tracked, token);
	}
	/**
	* Lien vers le fichier : dans le texte si la position est dans un paragraphe,
	* sinon nouveau paragraphe ; retourne la position suivante.
	*/
	insertLink(ref, name, at, token) {
		const { state, view, schema } = this.host.tiptap();
		const pos = Math.min(at ?? state.selection.from, state.doc.content.size);
		const link = schema.marks.link;
		const text = schema.text(name, link ? [link.create({ href: ref })] : []);
		const $pos = state.doc.resolve(pos);
		const tr = token ? state.tr.setMeta(pendingKey, { remove: token }) : state.tr;
		let next;
		if ($pos.parent.inlineContent && (!link || $pos.parent.type.allowsMarkType(link))) {
			tr.insert(pos, text);
			next = pos + text.nodeSize;
		} else {
			const paragraph = schema.nodes.paragraph.create(null, text);
			const range = at === void 0 ? insertionRange(state, paragraph.type) : insertionRangeAt(state, pos, paragraph.type);
			tr.replaceWith(range.from, range.to, paragraph);
			next = range.from + paragraph.nodeSize;
		}
		view.dispatch(tr.scrollIntoView());
		return next;
	}
};
//#endregion
//#region src/refs/LinkManager.ts
/**
* Insère et résout les liens internes. Accessible via `editor.links` quand au
* moins un LinkAdapter est configuré.
*/
var LinkManager = class {
	host;
	adapters;
	/** @internal Créé par BlockEditor */
	constructor(adapters, host) {
		this.host = host;
		const seen = /* @__PURE__ */ new Set();
		for (const a of adapters) {
			assertScheme(a.scheme);
			if (seen.has(a.scheme)) throw new Error(`Schéma de lien "${a.scheme}" déclaré deux fois`);
			seen.add(a.scheme);
		}
		this.adapters = [...adapters];
	}
	get schemes() {
		return this.adapters.map((a) => a.scheme);
	}
	/** Adaptateur d'un schéma (défaut : le premier) */
	adapter(scheme) {
		const found = scheme === void 0 ? this.adapters[0] : this.adapters.find((a) => a.scheme === scheme);
		if (!found) throw new Error(`Aucun lien de schéma "${scheme}"`);
		return found;
	}
	/** Référence à stocker dans le HTML (`page:42`) */
	ref(id, scheme) {
		return toRef(this.adapter(scheme).scheme, id);
	}
	/** Resolvers par schéma, pour resolveRefs */
	resolvers() {
		return Object.fromEntries(this.adapters.map((a) => [a.scheme, (id) => a.resolve(id)]));
	}
	/**
	* Ouvre le sélecteur puis pose le lien : sur la sélection, sur le lien
	* existant sous le curseur, ou en insérant le libellé de la cible.
	* Retourne la cible, ou null si annulé.
	*/
	async insert(scheme) {
		const adapter = this.adapter(scheme);
		const before = this.host.tiptap();
		if (!before.schema.marks.link) throw new Error("Extension Link absente : liens internes impossibles");
		const { from, to } = before.state.selection;
		const inLink = before.isActive("link");
		const href = before.getAttributes("link").href;
		const current = parseRef(href, adapter.scheme);
		const text = before.state.doc.textBetween(from, to, " ");
		const target = await adapter.pick({
			current,
			text
		});
		if (!target) return null;
		const editor = this.host.tiptap();
		const size = editor.state.doc.content.size;
		const range = {
			from: Math.min(from, size),
			to: Math.min(to, size)
		};
		const link = { href: toRef(adapter.scheme, target.id) };
		const chain = editor.chain().focus().setTextSelection(range);
		if (range.from !== range.to) chain.setLink(link);
		else if (inLink) chain.extendMarkRange("link").setLink(link);
		else chain.insertContent({
			type: "text",
			text: target.label,
			marks: [{
				type: "link",
				attrs: link
			}]
		});
		chain.run();
		return target;
	}
	/** Retire le lien sous la sélection */
	remove() {
		this.host.tiptap().chain().focus().extendMarkRange("link").unsetLink().run();
	}
	/** Schéma interne lié à la sélection, ou null */
	activeScheme() {
		const href = this.host.tiptap().getAttributes("link").href;
		return this.adapters.find((a) => parseRef(href, a.scheme) !== null)?.scheme ?? null;
	}
};
//#endregion
//#region src/core/defineBlock.ts
var SLOT_TAGS = {
	Wysiwyg: "rich",
	MultiLine: "multi",
	SingleLine: "single"
};
var BLOCK_TAG = "Block";
var REPEAT_TAG = "Repeat";
var SLOT_CONTENT = {
	rich: "block+",
	multi: "inline*",
	single: "text*"
};
/**
* Groupe ProseMirror des parties sans slot (contenu fixe). Un bloc dont le parent
* est dans ce groupe est un enfant <Block /> figé. Porté par le schéma : aucun
* état global, plusieurs éditeurs peuvent cohabiter.
*/
var STRUCTURE_GROUP = "blockStructure";
/**
* Définitions par nom, pour résoudre <Block type="…" />. Les définitions sont
* des templates compilés (indépendants de tout éditeur) : un registre global est
* sans risque, comme customElements.
*/
var registry = /* @__PURE__ */ new Map();
function defineBlock(name, template, options = {}) {
	const xml = new DOMParser().parseFromString(`<template>${template.trim()}</template>`, "application/xml");
	const error = xml.querySelector("parsererror");
	if (error) throw new Error(`[${name}] template XML invalide : ${error.textContent}`);
	const roots = Array.from(xml.documentElement.children);
	if (roots.length !== 1) throw new Error(`[${name}] le template doit avoir un seul élément racine`);
	if (registry.has(name)) throw new Error(`[${name}] bloc déjà défini`);
	const params = options.params ?? {};
	validateParams(name, params);
	const ctx = {
		blockName: name,
		params
	};
	const tree = compile(roots[0], ctx, name, true);
	const parts = flatten(tree);
	const definition = {
		name,
		label: options.label ?? name,
		description: options.description,
		icon: options.icon,
		thumbnail: options.thumbnail,
		params,
		extensions: parts.map((p) => toExtension(p, params, name)),
		placeholders: Object.fromEntries(parts.flatMap((p) => p.slot?.placeholder ? [[p.typeName, p.slot.placeholder]] : [])),
		dependencies: [...new Set(parts.flatMap((p) => p.children.map(itemOf).filter(isRef).map((c) => c.ref)))],
		emptyContent: () => buildJSON(tree, params, false),
		sampleContent: () => buildJSON(tree, params, true),
		applyParams: (node, patch) => {
			const values = sanitizeParams(params, {
				...node.attrs?.params,
				...patch
			});
			return rebuild(tree, node, values, params);
		}
	};
	registry.set(name, definition);
	return definition;
}
function validateParams(blockName, params) {
	for (const [key, def] of Object.entries(params)) {
		if (!/^\w+$/.test(key)) throw new Error(`[${blockName}] nom de paramètre invalide : ${key}`);
		if (def.type === "select" && !(def.default in def.options)) throw new Error(`[${blockName}] ${key} : la valeur par défaut doit faire partie des options`);
		if (def.type === "focus" && params[def.image]?.type !== "image") throw new Error(`[${blockName}] ${key} : image="${def.image}" doit nommer un paramètre image`);
	}
}
function compile(el, ctx, typeName, isRoot) {
	const { blockName } = ctx;
	if (el.tagName in SLOT_TAGS || el.tagName === BLOCK_TAG || el.tagName === REPEAT_TAG) throw new Error(`[${blockName}] <${el.tagName} /> doit être enveloppé dans un élément HTML`);
	const isImg = el.tagName === "img";
	const attrs = {};
	for (const a of Array.from(el.attributes)) {
		for (const [, ref] of a.value.matchAll(/\{(\w+)\}/g)) {
			if (!(ref in ctx.params)) throw new Error(`[${blockName}] {${ref}} : paramètre non déclaré`);
			if (ctx.params[ref].type === "image" && !(isImg && a.name === "src" && a.value === `{${ref}}`)) throw new Error(`[${blockName}] {${ref}} : un paramètre image s'utilise seul, en src d'un <img>`);
		}
		attrs[a.name] = a.value;
	}
	if (isImg) {
		const src = /^\{(\w+)\}$/.exec(attrs.src ?? "");
		if (!src || ctx.params[src[1]].type !== "image") throw new Error(`[${blockName}] <img> : src="{param}" requis (paramètre image)`);
		if (isRoot) throw new Error(`[${blockName}] <img> ne peut pas être la racine du template`);
		if (el.childNodes.length) throw new Error(`[${blockName}] <img> doit être vide`);
		return {
			typeName,
			tag: "img",
			attrs,
			isRoot,
			leaf: true,
			children: []
		};
	}
	const elements = Array.from(el.children);
	if (Array.from(el.childNodes).some((n) => n.nodeType === n.TEXT_NODE && n.textContent?.trim())) throw new Error(`[${blockName}] texte statique non supporté dans <${el.tagName}> (POC)`);
	const slotEl = elements.find((c) => c.tagName in SLOT_TAGS);
	if (slotEl && elements.length > 1) throw new Error(`[${blockName}] <${slotEl.tagName} /> doit être le seul enfant de <${el.tagName}>`);
	if (!slotEl && elements.length === 0) throw new Error(`[${blockName}] <${el.tagName}> ne contient aucun slot (POC)`);
	const child = (c, i) => c.tagName === BLOCK_TAG ? compileRef(c, blockName) : compile(c, ctx, `${typeName}_${i}`, false);
	return {
		typeName,
		tag: el.tagName,
		attrs,
		isRoot,
		slot: slotEl && {
			kind: SLOT_TAGS[slotEl.tagName],
			placeholder: slotEl.getAttribute("placeholder") ?? void 0
		},
		children: slotEl ? [] : elements.map((c, i) => c.tagName === REPEAT_TAG ? compileRepeat(c, i, ctx, child) : child(c, i))
	};
}
function compileRef(el, blockName) {
	const ref = el.getAttribute("type");
	if (!ref) throw new Error(`[${blockName}] <${BLOCK_TAG}> requiert un attribut type="…"`);
	if (ref === blockName) throw new Error(`[${blockName}] un bloc ne peut pas se contenir lui-même`);
	if (el.children.length || el.textContent?.trim()) throw new Error(`[${blockName}] <${BLOCK_TAG} type="${ref}"> doit être vide`);
	return { ref };
}
function compileRepeat(el, index, ctx, child) {
	const count = el.getAttribute("count") ?? "";
	if (ctx.params[count]?.type !== "number") throw new Error(`[${ctx.blockName}] <${REPEAT_TAG} count="${count}"> : paramètre number requis`);
	if (el.children.length !== 1) throw new Error(`[${ctx.blockName}] <${REPEAT_TAG}> doit contenir exactement un élément`);
	return {
		repeat: count,
		item: child(el.children[0], index)
	};
}
function isRef(c) {
	return "ref" in c;
}
function isRepeat(c) {
	return "repeat" in c;
}
function itemOf(c) {
	return isRepeat(c) ? c.item : c;
}
function typeOf(c) {
	return isRef(c) ? c.ref : c.typeName;
}
/** Parties propres à ce bloc ; les <Block /> référencés ont déjà leurs extensions */
function flatten(part) {
	return [part, ...part.children.map(itemOf).filter((c) => !isRef(c)).flatMap(flatten)];
}
/** Le bloc à `pos` est-il un enfant <Block /> figé dans un autre template ? */
function isFixedBlock(editor, pos) {
	return (editor.state.doc.resolve(pos).parent.type.spec.group ?? "").split(" ").includes(STRUCTURE_GROUP);
}
/** Le curseur est-il directement dans un nœud de ce type ? */
function inside(editor, typeName) {
	return editor.state.selection.$from.parent.type.name === typeName;
}
var FOCUS_CENTER = "50% 50%";
function defaultOf(def) {
	if (def.type === "image") return "";
	if (def.type === "focus") return safeFocusValue(def.default) || FOCUS_CENTER;
	return def.default;
}
/** Point de cadrage "x% y%", entiers bornés à 0–100 ; '' si invalide */
function safeFocusValue(value) {
	const m = typeof value === "string" ? /^\s*(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/.exec(value) : null;
	if (!m) return "";
	const clamp = (n) => Math.min(100, Math.max(0, Math.round(Number(n))));
	return `${clamp(m[1])}% ${clamp(m[2])}%`;
}
function paramDefaults(defs) {
	return Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, defaultOf(d)]));
}
/**
* Valeur d'un paramètre image : référence `schéma:id` (asset:42) ou URL
* http(s) / relative. Refuse javascript:, data:, etc. et tout caractère
* pouvant sortir de l'attribut.
*/
function safeImageValue(value) {
	if (typeof value !== "string") return "";
	const v = value.trim();
	if (!v || /[\s"'<>`\\]/.test(v)) return "";
	if (v.startsWith("/") && !v.startsWith("//")) return v;
	const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1].toLowerCase();
	if (!scheme || [
		"javascript",
		"vbscript",
		"data",
		"file",
		"blob",
		"about"
	].includes(scheme)) return "";
	return v;
}
/** Ne garde que des valeurs valides : le HTML chargé n'est pas une source de confiance */
function sanitizeParams(defs, raw = {}) {
	const out = {};
	for (const [key, def] of Object.entries(defs)) {
		const v = raw[key];
		if (def.type === "number") {
			const n = Number(v);
			out[key] = Number.isFinite(n) && v !== "" && v != null ? Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n)) : def.default;
		} else if (def.type === "select") out[key] = typeof v === "string" && v in def.options ? v : def.default;
		else if (def.type === "image") out[key] = safeImageValue(v);
		else if (def.type === "focus") out[key] = safeFocusValue(v) || defaultOf(def);
		else out[key] = typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : def.default;
	}
	return out;
}
function resolveParam(def, value) {
	if (def.type === "boolean") return value ? def.on ?? "" : def.off ?? "";
	return String(value);
}
function interpolate(attrs, defs, params) {
	const out = {};
	for (const [name, raw] of Object.entries(attrs)) out[name] = raw.replace(/\{(\w+)\}/g, (_, key) => resolveParam(defs[key], params[key] ?? defaultOf(defs[key]))).replace(/\s+/g, " ").trim();
	return out;
}
function readParams(el, defs) {
	const root = el.hasAttribute("data-block-root") ? el : el.closest("[data-block-root]");
	try {
		return sanitizeParams(defs, JSON.parse(root?.getAttribute("data-params") ?? "{}"));
	} catch {
		return paramDefaults(defs);
	}
}
function toExtension(part, defs, rootName) {
	if (part.leaf) return toImageExtension(part, defs, rootName);
	const hasParams = Object.keys(defs).length > 0;
	const defaults = paramDefaults(defs);
	const marker = part.isRoot ? { "data-block-root": "" } : {};
	const slotAttrs = part.slot ? { "data-slot": part.slot.kind } : {};
	const paramsOf = (attrs) => attrs.params ?? defaults;
	return Node.create({
		name: part.typeName,
		group: [part.isRoot && "block", !part.slot && STRUCTURE_GROUP].filter(Boolean).join(" ") || void 0,
		content: part.slot ? SLOT_CONTENT[part.slot.kind] : part.children.map((c) => {
			if (!isRepeat(c)) return typeOf(c);
			const def = defs[c.repeat];
			return `${typeOf(c.item)}{${Math.max(1, def.min ?? 1)},${def.max ?? ""}}`;
		}).join(" "),
		marks: part.slot?.kind === "single" ? "" : void 0,
		isolating: !part.isRoot,
		defining: true,
		draggable: part.isRoot,
		selectable: part.isRoot,
		addAttributes() {
			if (!hasParams) return {};
			return { params: {
				default: defaults,
				rendered: false,
				parseHTML: (el) => readParams(el, defs)
			} };
		},
		addKeyboardShortcuts() {
			if (part.slot?.kind === "single") {
				const block = () => inside(this.editor, part.typeName);
				return {
					Enter: block,
					"Shift-Enter": block
				};
			}
			if (part.slot?.kind === "multi") return { Enter: () => inside(this.editor, part.typeName) && this.editor.commands.command(({ tr, state }) => {
				tr.replaceSelectionWith(state.schema.nodes.hardBreak.create()).scrollIntoView();
				return true;
			}) };
			return {};
		},
		parseHTML() {
			return [{
				tag: `${part.tag}[data-type="${part.typeName}"]`,
				priority: 100
			}];
		},
		renderHTML({ node, HTMLAttributes }) {
			const params = paramsOf(node.attrs);
			const paramsAttr = part.isRoot && hasParams ? { "data-params": JSON.stringify(params) } : {};
			return [
				part.tag,
				mergeAttributes(interpolate(part.attrs, defs, params), { "data-type": part.typeName }, marker, slotAttrs, paramsAttr, HTMLAttributes),
				0
			];
		},
		addNodeView: part.isRoot ? () => ({ node, editor, getPos }) => {
			const dom = document.createElement("div");
			dom.className = "block-wrapper";
			dom.setAttribute("data-block-root", "");
			const fixed = () => {
				const pos = getPos();
				return pos !== void 0 && isFixedBlock(editor, pos);
			};
			dom.classList.toggle("is-fixed", fixed());
			dom.addEventListener("dragstart", (e) => {
				if (e.target === dom && fixed()) e.preventDefault();
			});
			const handle = document.createElement("div");
			handle.className = "drag-handle";
			handle.contentEditable = "false";
			handle.draggable = true;
			handle.title = "Glisser pour déplacer";
			handle.textContent = "⠿";
			const contentDOM = document.createElement(part.tag);
			const applyAttrs = (params) => {
				for (const [k, v] of Object.entries(interpolate(part.attrs, defs, params))) contentDOM.setAttribute(k, v);
			};
			applyAttrs(paramsOf(node.attrs));
			contentDOM.setAttribute("data-type", part.typeName);
			if (part.slot) contentDOM.setAttribute("data-slot", part.slot.kind);
			dom.append(handle, contentDOM);
			return {
				dom,
				contentDOM,
				update: (updated) => {
					if (updated.type !== node.type) return false;
					applyAttrs(paramsOf(updated.attrs));
					dom.classList.toggle("is-fixed", fixed());
					return true;
				}
			};
		} : void 0
	});
}
var SAMPLE_TEXT = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
function buildJSON(part, defs, sample) {
	const defaults = paramDefaults(defs);
	const build = (p) => {
		if (p.slot?.kind === "rich") return {
			type: p.typeName,
			content: [{
				type: "paragraph",
				...sample && textContent(SAMPLE_TEXT)
			}]
		};
		if (p.slot) return {
			type: p.typeName,
			...sample && textContent(p.slot.placeholder ?? "Texte")
		};
		if (p.leaf) return { type: p.typeName };
		return {
			type: p.typeName,
			content: p.children.flatMap(childJSON)
		};
	};
	const one = (c) => {
		if (!isRef(c)) return build(c);
		const block = registry.get(c.ref);
		if (!block) throw new Error(`<${BLOCK_TAG} type="${c.ref}"> : bloc inconnu`);
		return sample ? block.sampleContent() : block.emptyContent();
	};
	const childJSON = (c) => isRepeat(c) ? Array.from({ length: Number(defaults[c.repeat]) }, () => one(c.item)) : [one(c)];
	return build(part);
}
function textContent(text) {
	return { content: [{
		type: "text",
		text
	}] };
}
/**
* Reconstruit le JSON d'un bloc avec de nouveaux paramètres : recopie les
* valeurs sur chaque partie et ajuste le nombre d'éléments des <Repeat>. Les
* éléments retirés d'une zone Wysiwyg sont fusionnés dans le dernier conservé ;
* ailleurs ils sont supprimés (annulable avec Ctrl+Z).
*/
function rebuild(part, node, params, defs) {
	const out = {
		...node,
		attrs: {
			...node.attrs,
			params
		}
	};
	if (part.slot || part.leaf) return out;
	const kids = node.content ?? [];
	const content = [];
	let i = 0;
	const next = (c) => {
		const kid = kids[i++] ?? emptyItem(c, defs);
		return isRef(c) ? kid : rebuild(c, kid, params, defs);
	};
	for (const child of part.children) {
		if (!isRepeat(child)) {
			content.push(next(child));
			continue;
		}
		const type = typeOf(child.item);
		const group = [];
		while (i < kids.length && kids[i].type === type) group.push(kids[i++]);
		const count = Math.max(1, Number(params[child.repeat]));
		const kept = group.slice(0, count);
		const removed = group.slice(count);
		while (kept.length < count) kept.push(emptyItem(child.item, defs));
		const item = child.item;
		if (removed.length && !isRef(item) && item.slot?.kind === "rich") {
			const last = kept[kept.length - 1];
			const extra = removed.flatMap((r) => r.content ?? []).filter((n) => n.content?.length || n.type !== "paragraph");
			last.content = [...(last.content ?? []).filter((n) => n.content?.length || n.type !== "paragraph"), ...extra];
			if (!last.content.length) last.content = [{ type: "paragraph" }];
		}
		content.push(...kept.map((k) => isRef(item) ? k : rebuild(item, k, params, defs)));
	}
	return {
		...out,
		content
	};
}
/** Élément neuf ; ses propres <Repeat> sont ensuite ajustés par rebuild() */
function emptyItem(c, defs) {
	if (isRef(c)) {
		const block = registry.get(c.ref);
		if (!block) throw new Error(`<${BLOCK_TAG} type="${c.ref}"> : bloc inconnu`);
		return block.emptyContent();
	}
	return buildJSON(c, defs, false);
}
/**
* <img src="{param}"> du template : feuille non éditable. Dans l'éditeur, le
* src passe par le resolveSrc du nœud "image" (références `asset:id`) ; un
* clic sélectionne le bloc, dont le panneau permet de choisir l'image.
*/
function toImageExtension(part, defs, rootName) {
	const defaults = paramDefaults(defs);
	const paramsOf = (attrs) => attrs.params ?? defaults;
	const render = (params) => {
		const attrs = interpolate(part.attrs, defs, params);
		if (!attrs.src) delete attrs.src;
		return attrs;
	};
	return Node.create({
		name: part.typeName,
		group: STRUCTURE_GROUP,
		atom: true,
		selectable: false,
		draggable: false,
		addAttributes() {
			return { params: {
				default: defaults,
				rendered: false,
				parseHTML: (el) => readParams(el, defs)
			} };
		},
		parseHTML() {
			return [{
				tag: `img[data-type="${part.typeName}"]`,
				priority: 100
			}];
		},
		renderHTML({ node }) {
			return ["img", mergeAttributes(render(paramsOf(node.attrs)), { "data-type": part.typeName })];
		},
		addNodeView() {
			return ({ node, editor, getPos }) => {
				const img = document.createElement("img");
				img.setAttribute("data-type", part.typeName);
				img.draggable = false;
				const resolveSrc = (editor.extensionManager.extensions.find((e) => e.name === "image")?.options)?.resolveSrc ?? ((src) => src);
				let token = 0;
				const apply = (params) => {
					const attrs = render(params);
					for (const a of Array.from(img.attributes)) if (a.name !== "data-type" && a.name !== "src" && !(a.name in attrs)) img.removeAttribute(a.name);
					for (const [k, v] of Object.entries(attrs)) if (k !== "src") img.setAttribute(k, v);
					img.classList.toggle("is-unset", !attrs.src);
					img.classList.remove("is-broken");
					const current = ++token;
					if (!attrs.src) {
						img.removeAttribute("src");
						return;
					}
					Promise.resolve(resolveSrc(attrs.src)).then((url) => current === token && img.setAttribute("src", url)).catch(() => current === token && img.classList.add("is-broken"));
				};
				apply(paramsOf(node.attrs));
				img.addEventListener("mousedown", (e) => {
					const pos = getPos();
					if (pos === void 0) return;
					const $pos = editor.state.doc.resolve(pos);
					for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === rootName) {
						e.preventDefault();
						editor.chain().focus().setNodeSelection($pos.before(d)).run();
						return;
					}
				});
				return {
					dom: img,
					update: (updated) => {
						if (updated.type !== node.type) return false;
						apply(paramsOf(updated.attrs));
						return true;
					},
					ignoreMutation: () => true
				};
			};
		}
	});
}
//#endregion
//#region src/core/unknownBlock.ts
/**
* HTML assaini : pas de <script>, pas de onerror=…, pas de javascript:.
* DOMPurify retire les schémas inconnus (`asset:42`) : on ajoute ceux de
* l'éditeur à sa liste d'URIs permises (même expression que son défaut).
*/
function sanitize(html, schemes) {
	if (!schemes.length) return DOMPurify.sanitize(html);
	const allowed = [
		"https?",
		"ftps?",
		"mailto",
		"tel",
		"callto",
		"sms",
		"cid",
		"xmpp",
		"matrix",
		...schemes.map((s) => s.replace(/[.+-]/g, "\\$&"))
	].join("|");
	return DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP: new RegExp(`^(?:(?:${allowed}):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))`, "i") });
}
function toElement(html) {
	const template = document.createElement("template");
	template.innerHTML = html;
	return template.content.firstElementChild ?? document.createElement("div");
}
/** Retire nos marqueurs pour que la conversion ne recrée pas un unknownBlock */
function stripBlockMarkers(html) {
	const root = toElement(html);
	for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
		el.removeAttribute("data-type");
		el.removeAttribute("data-block-root");
		el.removeAttribute("data-slot");
	}
	return root.outerHTML;
}
var UnknownBlock = Node.create({
	name: "unknownBlock",
	group: "block",
	atom: true,
	selectable: true,
	draggable: true,
	addOptions() {
		return {
			onRetry: async () => false,
			schemes: []
		};
	},
	addAttributes() {
		return {
			blockType: {
				default: null,
				rendered: false
			},
			html: {
				default: "",
				rendered: false
			}
		};
	},
	parseHTML() {
		const editor = this.editor;
		const { schemes } = this.options;
		return [{
			tag: "[data-type]",
			priority: 90,
			getAttrs: (el) => {
				const type = el.getAttribute("data-type");
				const schema = editor?.schema;
				if (schema && (schema.nodes[type] || schema.marks[type])) return false;
				return {
					blockType: type,
					html: sanitize(el.outerHTML, schemes)
				};
			}
		}];
	},
	renderHTML({ node }) {
		return toElement(node.attrs.html);
	},
	addNodeView() {
		return ({ node, editor, getPos }) => {
			const dom = document.createElement("div");
			dom.className = "unknown-block";
			dom.contentEditable = "false";
			const bar = document.createElement("div");
			bar.className = "unknown-block-bar";
			const label = document.createElement("span");
			label.textContent = `Bloc inconnu : ${node.attrs.blockType}`;
			const status = document.createElement("span");
			status.className = "unknown-block-status";
			const button = (text, onClick) => {
				const b = document.createElement("button");
				b.type = "button";
				b.textContent = text;
				b.addEventListener("click", onClick);
				return b;
			};
			const retry = button("↻ Réessayer", async () => {
				retry.disabled = true;
				status.textContent = "Chargement…";
				if (!await this.options.onRetry(node.attrs.blockType)) status.textContent = "Toujours indisponible";
				retry.disabled = false;
			});
			const convert = button("⇄ Convertir", () => {
				const pos = getPos();
				if (pos === void 0) return;
				editor.chain().focus().insertContentAt({
					from: pos,
					to: pos + node.nodeSize
				}, stripBlockMarkers(node.attrs.html)).run();
			});
			bar.append(label, status, retry, convert);
			const content = document.createElement("div");
			content.className = "unknown-block-content";
			content.innerHTML = node.attrs.html;
			dom.append(bar, content);
			return {
				dom,
				stopEvent: (e) => bar.contains(e.target),
				ignoreMutation: () => true
			};
		};
	}
});
//#endregion
//#region src/core/BlockEditor.ts
/**
* Cœur de l'éditeur de blocs — la seule classe nécessaire. Enveloppe Tiptap,
* compose les extensions et gère le cycle de vie (un schéma ProseMirror est
* immuable : charger un bloc async recrée l'instance Tiptap — `tiptap` pointe
* toujours sur l'instance courante). Aucune interface n'est imposée : les
* composants Vue (`page-builder/vue`) n'utilisent que l'API publique ; une
* intégration sans framework peut se brancher avec use().
*
*   const editor = new BlockEditor({
*     element: '#editor',
*     blocks: myBlocks,
*     content: html,
*     assets: { upload, resolve: (id) => `/files/${id}` },
*     on: { update: ({ html }) => save(html) },
*   })
*   editor.use(new BlockLibrary({ mount: '#library' }))
*/
var BlockEditor = class {
	options;
	/** Variante chaînable du constructeur */
	static builder() {
		return new BlockEditorBuilder();
	}
	/** Module de fichiers ; null si aucun AssetAdapter n'est configuré */
	assets;
	/** Liens internes ; null si aucun LinkAdapter n'est configuré */
	links;
	element;
	instance;
	blockList;
	asyncLoaders;
	cleanups = [];
	listeners = {
		update: /* @__PURE__ */ new Set(),
		selectionUpdate: /* @__PURE__ */ new Set(),
		blocksChange: /* @__PURE__ */ new Set(),
		uploadStart: /* @__PURE__ */ new Set(),
		uploadEnd: /* @__PURE__ */ new Set(),
		uploadError: /* @__PURE__ */ new Set()
	};
	constructor(options) {
		this.options = options;
		this.element = options.element === void 0 ? document.createElement("div") : resolveElement(options.element);
		this.element.classList.add("block-editor");
		if (options.contentWidth !== void 0 && !/^[\d.]+(rem|em|px|ch|%)$/.test(options.contentWidth)) throw new Error(`Largeur invalide : ${options.contentWidth}`);
		this.blockList = [];
		this.asyncLoaders = /* @__PURE__ */ new Map();
		for (const b of options.blocks ?? []) {
			if (this.blockList.some((x) => x.name === b.name)) throw new Error(`Bloc "${b.name}" ajouté deux fois`);
			this.blockList.push(b);
		}
		for (const [name, loader] of Object.entries(options.asyncBlocks ?? {})) {
			if (this.blockList.some((x) => x.name === name)) throw new Error(`Bloc "${name}" ajouté deux fois`);
			this.asyncLoaders.set(name, loader);
		}
		assertDependencies(this.blockList);
		this.assets = options.assets ? new AssetManager(options.assets, {
			tiptap: () => this.instance,
			emit: (event, payload) => this.emit(event, payload)
		}) : null;
		this.links = options.links?.length ? new LinkManager(options.links, { tiptap: () => this.instance }) : null;
		for (const [event, listener] of Object.entries(options.on ?? {})) if (listener) this.on(event, listener);
		this.instance = this.createTiptap(options.content ?? "");
		const onMarginClick = (e) => this.focusFromMargin(e);
		this.element.addEventListener("mousedown", onMarginClick);
		this.cleanups.push(() => this.element.removeEventListener("mousedown", onMarginClick));
		for (const view of options.views ?? []) this.use(view);
	}
	/** Instance Tiptap courante (change après un chargement de bloc async) */
	get tiptap() {
		return this.instance;
	}
	/** Blocs disponibles dans le schéma courant */
	get blocks() {
		return this.blockList;
	}
	/** HTML à sauvegarder : les fichiers y sont des références `asset:id` */
	getHTML() {
		return this.instance.getHTML();
	}
	/** HTML avec les références (`asset:id`, `page:id`…) remplacées par leurs URLs (rendu public) */
	getResolvedHTML() {
		return resolveRefs(this.getHTML(), this.resolvers());
	}
	/** Resolvers par schéma (fichiers + liens), pour resolveRefs côté application */
	resolvers() {
		const { assets, links } = this;
		return {
			...assets && { [assets.scheme]: (id) => assets.resolveUrl(id) },
			...links?.resolvers()
		};
	}
	/** Schémas de références gérés (fichiers + liens) */
	get schemes() {
		return [...this.assets ? [this.assets.scheme] : [], ...this.links?.schemes ?? []];
	}
	/** Remplace le contenu ; ce qui n'est pas dans le schéma devient unknownBlock (ou est ignoré) */
	setContent(html, { emitUpdate = true } = {}) {
		this.instance.commands.setContent(html, { emitUpdate });
	}
	getBlock(name) {
		return this.blockList.find((b) => b.name === name);
	}
	/**
	* Blocs contenant la sélection, du plus externe au plus interne (un bloc
	* sélectionné comme nœud est inclus).
	*/
	selectedBlocks() {
		return this.blocksAtSelection(this.instance.state);
	}
	/** Modifie les paramètres du bloc à `pos` (sans déplacer le focus) */
	setBlockParams(pos, patch) {
		const { state, view } = this.instance;
		const node = state.doc.nodeAt(pos);
		const block = node && this.getBlock(node.type.name);
		if (!node || !block) return false;
		const updated = state.schema.nodeFromJSON(block.applyParams(node.toJSON(), patch));
		const { selection } = state;
		const tr = state.tr.replaceWith(pos, pos + node.nodeSize, updated);
		if (selection instanceof NodeSelection && selection.from === pos) tr.setSelection(NodeSelection.create(tr.doc, pos));
		else {
			const end = pos + updated.nodeSize - 1;
			const at = Math.min(Math.max(selection.from, pos + 1), end);
			tr.setSelection(Selection.near(tr.doc.resolve(at)));
		}
		view.dispatch(tr);
		return true;
	}
	/** Supprime le bloc à `pos` ; refuse un enfant <Block /> figé */
	deleteBlockAt(pos) {
		const node = this.instance.state.doc.nodeAt(pos);
		if (!node || isFixedBlock(this.instance, pos)) return false;
		return this.instance.chain().deleteRange({
			from: pos,
			to: pos + node.nodeSize
		}).run();
	}
	/** HTML d'un bloc vide (ou d'exemple), tel que getHTML() le produirait */
	blockHTML(name, { sample = false } = {}) {
		const el = document.createElement("div");
		el.append(this.renderBlock(name, { sample }));
		return el.innerHTML;
	}
	/** Rendu DOM d'un bloc d'exemple (placeholders en texte), pour les aperçus */
	renderBlock(name, { sample = true } = {}) {
		const block = this.getBlock(name);
		if (!block) throw new Error(`Bloc inconnu : ${name}`);
		const { schema } = this.instance;
		const node = schema.nodeFromJSON(sample ? block.sampleContent() : block.emptyContent());
		return DOMSerializer.fromSchema(schema).serializeNode(node);
	}
	/**
	* Insère un bloc vide près du curseur, sans couper le texte (voir
	* insertionRange). Le curseur est ensuite placé dans le premier slot.
	*/
	insertBlock(name) {
		const block = this.getBlock(name);
		if (!block) throw new Error(`Bloc inconnu : ${name}`);
		const { state, view } = this.instance;
		const node = state.schema.nodeFromJSON(block.emptyContent());
		const range = insertionRange(state, node.type);
		const tr = state.tr.replaceWith(range.from, range.to, node);
		tr.setSelection(Selection.near(tr.doc.resolve(range.from + 1)));
		view.dispatch(tr.scrollIntoView());
		view.focus();
		return true;
	}
	/**
	* Supprime le bloc le plus proche contenant le curseur. Un enfant <Block />
	* figé ne peut pas être retiré seul : on remonte à son parent.
	*/
	deleteCurrentBlock() {
		const { $from } = this.instance.state.selection;
		for (let d = $from.depth; d > 0; d--) {
			const name = $from.node(d).type.name;
			if (this.blockList.some((b) => b.name === name) && !isFixedBlock(this.instance, $from.before(d))) return this.instance.chain().focus().deleteRange({
				from: $from.before(d),
				to: $from.after(d)
			}).run();
		}
		return false;
	}
	/**
	* Charge un bloc déclaré dans asyncBlocks puis recrée l'éditeur pour l'ajouter
	* au schéma. Le contenu passe par getHTML() : les unknownBlock ressortent leur
	* HTML d'origine, reparsé avec le nouveau bloc. Retourne false si aucun loader.
	*/
	async loadBlock(name) {
		if (this.blockList.some((b) => b.name === name)) return true;
		const loader = this.asyncLoaders.get(name);
		if (!loader) return false;
		const block = await loader();
		if (block.name !== name) throw new Error(`Le loader "${name}" a retourné le bloc "${block.name}"`);
		assertDependencies([...this.blockList, block]);
		this.blockList.push(block);
		const html = this.instance.getHTML();
		this.instance.destroy();
		this.instance = this.createTiptap(html);
		this.emit("blocksChange", { blocks: this.blockList });
		this.emit("update", { html: this.getHTML() });
		return true;
	}
	/** S'abonne à un événement ; retourne la fonction de désabonnement */
	on(event, listener) {
		this.listeners[event].add(listener);
		return () => this.off(event, listener);
	}
	off(event, listener) {
		this.listeners[event].delete(listener);
	}
	/**
	* Branche une vue sans framework (objet avec attach()). Retourne la fonction pour la débrancher ; destroy() le fait aussi.
	*/
	use(view, target) {
		const cleanup = view.attach(this, target) ?? (() => {});
		let done = false;
		const detach = () => {
			if (done) return;
			done = true;
			const i = this.cleanups.indexOf(detach);
			if (i >= 0) this.cleanups.splice(i, 1);
			cleanup();
		};
		this.cleanups.push(detach);
		return detach;
	}
	destroy() {
		for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
		this.assets?.destroy();
		this.instance.destroy();
		for (const set of Object.values(this.listeners)) set.clear();
	}
	blocksAtSelection(state) {
		const { selection } = state;
		const found = [];
		const add = (node, pos) => {
			const block = this.getBlock(node.type.name);
			if (block) found.push({
				block,
				pos,
				node,
				fixed: isFixedBlock({ state }, pos)
			});
		};
		const { $from } = selection;
		for (let d = 1; d <= $from.depth; d++) add($from.node(d), $from.before(d));
		if (selection instanceof NodeSelection) add(selection.node, selection.from);
		return found;
	}
	/**
	* Clic hors du contenu (marges autour de la zone éditable, ou vide sous le
	* dernier bloc) : curseur au point le plus proche du contenu
	*/
	focusFromMargin(e) {
		const { view } = this.instance;
		if (e.button !== 0 || e.target !== this.element && e.target !== view.dom) return;
		const last = view.dom.lastElementChild;
		const rect = view.dom.getBoundingClientRect();
		const bottom = last ? last.getBoundingClientRect().bottom : rect.bottom;
		if (e.target === view.dom && e.clientY <= bottom) return;
		const clamp = (v, min, max) => Math.min(Math.max(v, min + 1), max - 1);
		const hit = view.posAtCoords({
			left: clamp(e.clientX, rect.left, rect.right),
			top: clamp(e.clientY, rect.top, bottom)
		});
		if (!hit) return;
		e.preventDefault();
		this.instance.chain().setTextSelection(hit.pos).focus().run();
	}
	/** Classe .is-active sur le bloc le plus interne contenant la sélection */
	activeBlockExtension() {
		const editor = this;
		return Extension.create({
			name: "activeBlock",
			addProseMirrorPlugins: () => [new Plugin({ props: { decorations(state) {
				const active = editor.blocksAtSelection(state).at(-1);
				if (!active) return null;
				return DecorationSet.create(state.doc, [Decoration.node(active.pos, active.pos + active.node.nodeSize, { class: "is-active" })]);
			} } })]
		});
	}
	emit(event, payload) {
		for (const listener of this.listeners[event]) listener(payload);
	}
	/** StarterKit, avec le lien configuré pour accepter les références (`asset:`, `page:`…) */
	starterKit() {
		const options = this.options.starterKit ?? {};
		if (options === false) return [];
		const { schemes } = this;
		if (!schemes.length || options.link === false) return [StarterKit.configure(options)];
		const link = options.link ?? {};
		return [StarterKit.configure({
			...options,
			link: {
				openOnClick: false,
				...link,
				protocols: [...link.protocols ?? [], ...schemes]
			}
		})];
	}
	createTiptap(content) {
		const { options, assets } = this;
		const placeholders = Object.assign({}, ...this.blockList.map((b) => b.placeholders));
		const has = (name) => options.extensions?.some((e) => e.name === name);
		return new Editor({
			element: this.element,
			extensions: [
				...this.starterKit(),
				...options.trailingNode === false ? [] : [TrailingNode],
				...options.placeholders === false ? [] : [Placeholder.configure({
					showOnlyCurrent: false,
					includeChildren: true,
					placeholder: ({ node }) => placeholders[node.type.name] ?? ""
				})],
				...this.blockList.flatMap((b) => b.extensions),
				...options.unknownBlocks === false ? [] : [UnknownBlock.configure({
					onRetry: (type) => this.loadBlock(type),
					schemes: this.schemes
				})],
				...has("image") ? [] : [AssetImage.configure({ resolveSrc: (src) => assets?.resolveSrc(src) ?? src })],
				...assets ? [assets.extension()] : [],
				this.activeBlockExtension(),
				...options.extensions ?? []
			],
			editorProps: { attributes: {
				class: options.className ?? "rich-content",
				...options.contentWidth && { style: `--block-content-width: ${options.contentWidth}` }
			} },
			content,
			onUpdate: () => this.emit("update", { html: this.getHTML() }),
			onSelectionUpdate: () => this.emit("selectionUpdate", {})
		});
	}
};
function resolveElement(target) {
	const el = typeof target === "string" ? document.querySelector(target) : target;
	if (!el) throw new Error(`Élément introuvable : ${String(target)}`);
	return el;
}
/** Chaque <Block type="…" /> doit pointer vers un bloc présent dans l'éditeur */
function assertDependencies(blocks) {
	const names = new Set(blocks.map((b) => b.name));
	for (const block of blocks) {
		const missing = block.dependencies.filter((d) => !names.has(d));
		if (missing.length) throw new Error(`Le bloc "${block.name}" requiert : ${missing.join(", ")} (ajouter via .block())`);
	}
}
/**
* Variante chaînable de `new BlockEditor(options)`. Chaque méthode retourne le
* builder ; build() crée l'éditeur.
*/
var BlockEditorBuilder = class {
	opts = {
		blocks: [],
		asyncBlocks: {},
		extensions: [],
		views: []
	};
	subscriptions = [];
	/** Élément (ou sélecteur CSS) où monter l'éditeur (sinon : editor.element détaché) */
	mount(target) {
		this.opts.element = resolveElement(target);
		return this;
	}
	content(html) {
		this.opts.content = html;
		return this;
	}
	block(...blocks) {
		this.opts.blocks.push(...blocks);
		return this;
	}
	blocks(blocks) {
		return this.block(...blocks);
	}
	asyncBlock(name, loader) {
		if (name in this.opts.asyncBlocks) throw new Error(`Bloc "${name}" ajouté deux fois`);
		this.opts.asyncBlocks[name] = loader;
		return this;
	}
	asyncBlocks(loaders) {
		for (const [name, loader] of Object.entries(loaders)) this.asyncBlock(name, loader);
		return this;
	}
	extension(...extensions) {
		this.opts.extensions.push(...extensions);
		return this;
	}
	starterKit(options) {
		this.opts.starterKit = options;
		return this;
	}
	trailingNode(enabled = true) {
		this.opts.trailingNode = enabled;
		return this;
	}
	placeholders(enabled = true) {
		this.opts.placeholders = enabled;
		return this;
	}
	unknownBlocks(enabled = true) {
		this.opts.unknownBlocks = enabled;
		return this;
	}
	className(cls) {
		this.opts.className = cls;
		return this;
	}
	contentWidth(width) {
		this.opts.contentWidth = width;
		return this;
	}
	/** Module de fichiers (upload + références `asset:id`) */
	assets(adapter) {
		this.opts.assets = adapter;
		return this;
	}
	/** Liens internes (`page:id`…) */
	links(...adapters) {
		this.opts.links = [...this.opts.links ?? [], ...adapters];
		return this;
	}
	/** Branche des vues sans framework (objets avec attach()) */
	use(...views) {
		this.opts.views.push(...views);
		return this;
	}
	on(event, listener) {
		this.subscriptions.push((editor) => editor.on(event, listener));
		return this;
	}
	onUpdate(listener) {
		return this.on("update", listener);
	}
	onSelectionUpdate(listener) {
		return this.on("selectionUpdate", listener);
	}
	onBlocksChange(listener) {
		return this.on("blocksChange", listener);
	}
	build() {
		const { views, ...rest } = this.opts;
		const editor = new BlockEditor(rest);
		for (const subscribe of this.subscriptions) subscribe(editor);
		for (const view of views) editor.use(view);
		return editor;
	}
};
//#endregion
export { resolveRefs as _, isFixedBlock as a, LinkManager as c, listAssetIds as d, parseAssetRef as f, parseRef as g, listRefIds as h, defineBlock as i, AssetManager as l, toAssetRef as m, BlockEditorBuilder as n, paramDefaults as o, resolveAssetRefs as p, UnknownBlock as r, safeFocusValue as s, BlockEditor as t, DEFAULT_SCHEME as u, toRef as v, AssetImage as y };

//# sourceMappingURL=BlockEditor-KK4osgZj.js.map