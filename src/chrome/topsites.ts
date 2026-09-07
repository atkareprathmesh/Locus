import { hasTopSites, isExtension } from './env'

/** Stand-ins so the top-sites UI is testable under `vite dev`. */
const DEV_SITES = [
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'YouTube', url: 'https://youtube.com' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Google Calendar', url: 'https://calendar.google.com' },
  { title: 'ChatGPT', url: 'https://chatgpt.com' },
  { title: 'Notion', url: 'https://notion.so' },
]

export async function topSites(): Promise<{ title: string; url: string }[]> {
  if (!hasTopSites) return isExtension ? [] : DEV_SITES
  const items = await chrome.topSites.get()
  return items.map((i) => ({ title: i.title || i.url, url: i.url }))
}
