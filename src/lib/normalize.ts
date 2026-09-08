import { nid } from './id'
import { GAPP_CATALOG } from '../state'
import type { DateNote, Habit, Note, PageData, State, Task } from '../types'

const GAPP_KEYS = new Set(GAPP_CATALOG.map((a) => a.key))

/* eslint-disable @typescript-eslint/no-explicit-any */

const isArr = Array.isArray
const isObj = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !isArr(v)
const str = (v: any, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v))
const num = (v: any, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d)
const bool = (v: any) => v === true

const nextId = nid

/** Flatten journal entries written by the removed rich-text editor. */
function plainJournalDesc(value: any): string {
  return str(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(div|p|h[1-6]|li)>/gi, '\n')
    .replace(/<hr\s*\/?\s*>/gi, '\n--------------------\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/^\s*#{1,4}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
}

function normNote(n: any): Note | null {
  if (!isObj(n)) return null
  return { id: num(n.id, nextId()), title: str(n.title), text: str(n.text) }
}

const REMINDS = ['none', 'at', '5', '15', '60', '1440']

function normTask(t: any): Task | null {
  if (!isObj(t)) return null
  const priority = ['easy', 'medium', 'hard'].includes(t.priority) ? t.priority : 'medium'
  return {
    id: num(t.id, nextId()),
    title: str(t.title),
    due: /^\d{4}-\d{2}-\d{2}$/.test(str(t.due)) ? t.due : new Date().toISOString().slice(0, 10),
    time: str(t.time),
    priority,
    completed: bool(t.completed),
    remind: REMINDS.includes(str(t.remind)) ? str(t.remind) : 'none',
    subs: isArr(t.subs)
      ? t.subs
          .filter(isObj)
          .map((x: any) => ({ id: num(x.id, nextId()), title: str(x.title), done: bool(x.done) }))
          .filter((x: { title: string }) => x.title.trim().length > 0)
      : [],
  }
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

function normHabit(h: any): Habit | null {
  if (!isObj(h)) return null
  let done: string[]
  if (isArr(h.done)) {
    done = [...new Set(h.done.filter((d: any) => typeof d === 'string' && ISO_RE.test(d)))] as string[]
  } else if (isArr(h.days)) {
    // legacy: 7 booleans oldest -> newest, anchor the newest slot to today
    const days = h.days.slice(-7).map(bool)
    const localIso = (ms: number) => {
      const d = new Date(ms)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const base = Date.now()
    done = days
      .map((on: boolean, i: number) => (on ? localIso(base - (days.length - 1 - i) * 86400000) : null))
      .filter((d: string | null): d is string => !!d)
  } else {
    done = []
  }
  return {
    id: num(h.id, nextId()),
    name: str(h.name),
    done,
  }
}

function normDateNotes(v: any): Record<string, DateNote[]> {
  if (!isObj(v)) return {}
  const out: Record<string, DateNote[]> = {}
  for (const [k, list] of Object.entries(v)) {
    if (!isArr(list)) continue
    const items = list
      .filter(isObj)
      .map((n: any): DateNote => ({
        id: num(n.id, nextId()),
        title: str(n.title),
        desc: plainJournalDesc(n.desc),
        category: str(n.category, 'Personal'),
        created: num(n.created, Date.now()),
        updated: num(n.updated, Date.now()),
      }))
    if (items.length) out[k] = items
  }
  return out
}

const compact = <T>(a: (T | null)[]): T[] => a.filter((x): x is T => x != null)

function normPageData(v: any): PageData {
  return {
    notes: isArr(v?.notes) ? compact(v.notes.map(normNote)) : [],
    tasks: isArr(v?.tasks) ? compact(v.tasks.map(normTask)) : [],
    habits: isArr(v?.habits) ? compact(v.habits.map(normHabit)) : [],
    dateNotes: normDateNotes(v?.dateNotes),
  }
}

/**
 * Coerce anything (persisted blob, imported file) into a safe partial State so a
 * malformed shape can never brick the render.
 */
export function normalizeLocal(p: any): Partial<State> {
  if (!isObj(p)) return {}
  const out: Partial<State> = {}

  if ('notes' in p) out.notes = isArr(p.notes) ? compact(p.notes.map(normNote)) : []
  if ('tasks' in p) out.tasks = isArr(p.tasks) ? compact(p.tasks.map(normTask)) : []
  if ('habits' in p) out.habits = isArr(p.habits) ? compact(p.habits.map(normHabit)) : []
  if ('dateNotes' in p) out.dateNotes = normDateNotes(p.dateNotes)
  if ('notesPanelHeight' in p && Number.isFinite(Number(p.notesPanelHeight))) {
    out.notesPanelHeight = Math.min(72, Math.max(28, Number(p.notesPanelHeight)))
  }

  if (isArr(p.gapps)) {
    const keys = p.gapps.filter((k: any) => typeof k === 'string' && GAPP_KEYS.has(k))
    if (keys.length) out.gapps = [...new Set<string>(keys)]
  }

  if (isArr(p.boardOrder)) {
    const ids = p.boardOrder.filter((k: any) => typeof k === 'string')
    out.boardOrder = [...new Set<string>(ids)]
  }

  if (isObj(p.boardPage)) {
    const bp: Record<string, number> = {}
    for (const [k, v] of Object.entries(p.boardPage)) if (Number.isFinite(Number(v))) bp[k] = Number(v)
    out.boardPage = bp
  }

  if ('gappsOn' in p) out.gappsOn = p.gappsOn !== false

  if ('bgFit' in p && (p.bgFit === 'cover' || p.bgFit === 'contain')) out.bgFit = p.bgFit
  if ('bgZoom' in p && Number.isFinite(Number(p.bgZoom)))
    out.bgZoom = Math.min(5, Math.max(1, Number(p.bgZoom)))
  if ('bgX' in p && Number.isFinite(Number(p.bgX))) out.bgX = Math.min(0.5, Math.max(-0.5, Number(p.bgX)))
  if ('bgY' in p && Number.isFinite(Number(p.bgY))) out.bgY = Math.min(0.5, Math.max(-0.5, Number(p.bgY)))

  if ('lastBackup' in p) out.lastBackup = Math.max(0, num(p.lastBackup, 0))
  if ('backupEvery' in p) {
    const every = Math.round(num(p.backupEvery, 7))
    out.backupEvery = [0, 1, 7, 30].includes(every) ? every : 7
  }

  if ('h24' in p) out.h24 = bool(p.h24)
  if ('engine' in p) {
    const engine = p.engine === 'Images' ? 'Google' : p.engine
    if (['Google', 'Bing', 'DuckDuckGo', 'YouTube'].includes(engine)) out.engine = engine
  }
  if ('filter' in p && ['all', 'today', 'upcoming', 'done'].includes(p.filter)) out.filter = p.filter

  if (isArr(p.pages) && p.pages.length) {
    out.pages = p.pages
      .filter(isObj)
      .map((pg: any) => ({ id: num(pg.id, nextId()), name: str(pg.name, 'Page') }))
    if (!out.pages.length) out.pages = [{ id: 1, name: 'Home' }]
  }
  if (isObj(p.pageData)) {
    const pd: Record<number, PageData> = {}
    for (const [k, v] of Object.entries(p.pageData)) pd[num(k, 0)] = normPageData(v)
    out.pageData = pd
  }
  if ('activePage' in p) {
    const ap = num(p.activePage, 1)
    const pages = out.pages
    out.activePage = pages && !pages.some((x) => x.id === ap) ? pages[0].id : ap
  }

  return out
}

/** True if a parsed import file has at least one field we can use. */
export function importHasContent(p: any): boolean {
  return isObj(p) && (isArr(p.notes) || isArr(p.tasks) || isArr(p.habits) || isObj(p.dateNotes) || isArr(p.boards))
}
