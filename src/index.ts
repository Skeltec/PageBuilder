// Cœur : une seule classe (BlockEditor) + définition de blocs + fichiers.
// Les vues par défaut sont dans le point d'entrée séparé `ui`.
export { BlockEditor, BlockEditorBuilder } from './core/BlockEditor'
export type {
  BlockEditorEvents,
  BlockEditorListener,
  BlockEditorOptions,
  BlockEditorPlugin,
  BlockEditorView,
  BlockInstance,
  BlockLoader,
} from './core/BlockEditor'
export { defineBlock, isFixedBlock } from './core/defineBlock'
export type { BlockDefinition, BlockOptions, BlockParams, ParamDefinition, ParamValue } from './core/defineBlock'
export { UnknownBlock } from './core/unknownBlock'
export type { UnknownBlockOptions } from './core/unknownBlock'

export { AssetManager } from './assets/AssetManager'
export type { AssetEvents } from './assets/AssetManager'
export { AssetImage } from './assets/AssetImage'
export type { AssetImageOptions } from './assets/AssetImage'
export { DEFAULT_SCHEME, listAssetIds, parseAssetRef, resolveAssetRefs, toAssetRef } from './assets/refs'
export type { AssetAdapter, AssetPickOptions, AssetRef, AssetUploadContext } from './assets/types'
export { listRefIds, parseRef, resolveRefs, toRef } from './refs/refs'
export type { RefResolver } from './refs/refs'
export { LinkManager } from './refs/LinkManager'
export type { LinkAdapter, LinkPickContext, LinkTarget } from './refs/LinkManager'
