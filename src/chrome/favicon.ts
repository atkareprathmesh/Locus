import { extensionId, isExtension } from './env'

/**
 * URL for a page's favicon via the MV3 `_favicon/` API (needs the "favicon"
 * permission). Returns null under `vite dev` so callers show the letter tile.
 */
export function faviconUrl(pageUrl: string, size = 32): string | null {
  if (!isExtension || !pageUrl) return null
  const u = new URL(`chrome-extension://${extensionId}/_favicon/`)
  u.searchParams.set('pageUrl', pageUrl)
  u.searchParams.set('size', String(size))
  return u.toString()
}
