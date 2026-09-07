import type { Engine, Priority } from '../types'

export interface ImportBookmark {
  title: string
  url: string
}
export interface ImportBoard {
  name: string
  bookmarks: ImportBookmark[]
}
export interface ImportTask {
  title: string
  due: string
  time: string
  priority: Priority
  completed: boolean
  /** Only Locus's own backups carry this; other formats leave it undefined. */
  remind?: string
}

export interface ImportHabit {
  name: string
  /** Completion dates, present only when restoring a Locus backup. */
  done?: string[]
}
export interface ImportJournal {
  date: string
  title: string
  desc: string
  category: string
}

export interface ImportResult {
  /** Human-readable name of the detected format. */
  source: string
  /** 'exact' = a known format we map precisely; 'heuristic' = best-effort guess. */
  confidence: 'exact' | 'heuristic'
  boards: ImportBoard[]
  notes: { title: string; text: string }[]
  tasks: ImportTask[]
  habits: ImportHabit[]
  journal: ImportJournal[]
  settings: { h24?: boolean; engine?: Engine }
  warnings: string[]
}

export interface DetectInput {
  filename: string
  text: string
  /** Parsed JSON, or null if the file isn't JSON. */
  json: unknown | null
  /** Parsed HTML document, or null if the file isn't HTML. */
  doc: Document | null
}

export interface Adapter {
  id: string
  label: string
  /** 0 = definitely not this format, 1 = definitely is. */
  detect: (input: DetectInput) => number
  parse: (input: DetectInput) => ImportResult
}

export const emptyResult = (source: string, confidence: ImportResult['confidence']): ImportResult => ({
  source,
  confidence,
  boards: [],
  notes: [],
  tasks: [],
  habits: [],
  journal: [],
  settings: {},
  warnings: [],
})

const ENGINE_MAP: Record<string, Engine> = {
  google: 'Google',
  images: 'Images',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  ddg: 'DuckDuckGo',
  youtube: 'YouTube',
}
export const toEngine = (v: unknown): Engine | undefined =>
  typeof v === 'string' ? ENGINE_MAP[v.trim().toLowerCase()] : undefined

export const toPriority = (v: unknown): Priority => {
  const s = String(v ?? '').toLowerCase()
  if (s === 'easy' || s === 'low' || s === 'p3') return 'easy'
  if (s === 'hard' || s === 'high' || s === 'urgent' || s === 'p1') return 'hard'
  return 'medium'
}

export const epochToIso = (v: unknown): string => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return ''
  const ms = n < 1e12 ? n * 1000 : n // seconds vs milliseconds
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export const looksLikeUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^(https?:\/\/|chrome:\/\/|edge:\/\/|about:|file:\/\/)/i.test(v.trim())

export const cleanText = (v: unknown, fallback = ''): string => {
  if (typeof v === 'string') return v.trim()
  if (v == null) return fallback
  return String(v)
}
