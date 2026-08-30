import { isExtension } from './env'

export type IncognitoResult = 'ok' | 'not-allowed' | 'unavailable'

/** Open a fresh incognito window. Requires "Allow in Incognito" for the ext. */
export async function openIncognito(): Promise<IncognitoResult> {
  if (!isExtension || typeof chrome.windows === 'undefined') return 'unavailable'
  try {
    await chrome.windows.create({ incognito: true })
    return 'ok'
  } catch {
    return 'not-allowed'
  }
}
