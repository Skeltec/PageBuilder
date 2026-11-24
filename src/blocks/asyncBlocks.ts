import type { BlockDefinition } from '../lib'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Blocs chargés à la demande. En vrai : import() d'un chunk, fetch d'un template
 * depuis une API, plugin tiers… Le délai simule le réseau.
 */
export const asyncBlocks: Record<string, () => Promise<BlockDefinition>> = {
  testimonial: async () => {
    await delay(600)
    return (await import('./async/testimonial')).testimonial
  },
}
