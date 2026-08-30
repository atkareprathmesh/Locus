import { hasTopSites } from './env'

export async function topSites(): Promise<{ title: string; url: string }[]> {
  if (!hasTopSites) return []
  const items = await chrome.topSites.get()
  return items.map((i) => ({ title: i.title || i.url, url: i.url }))
}
