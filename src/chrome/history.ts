import type { HistoryRow } from '../types'
import { hasHistory } from './env'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function relTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const yest = new Date(now)
  yest.setDate(now.getDate() - 1)
  const isYest =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  if (isYest) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export async function recentHistory(maxResults = 30): Promise<HistoryRow[]> {
  if (!hasHistory) return []
  const items = await chrome.history.search({ text: '', maxResults, startTime: 0 })
  return items
    .filter((i) => i.url)
    .map((i) => ({
      title: i.title || i.url!,
      url: i.url!,
      host: hostOf(i.url!),
      time: relTime(i.lastVisitTime ?? Date.now()),
    }))
}

export async function clearHistory(): Promise<void> {
  if (!hasHistory) return
  await chrome.history.deleteAll()
}
