import { nid } from '../lib/id'
import type { DateNote, Habit, Note, State, Task } from '../types'
import { boardmarksAdapter } from './adapters/boardmarks'
import { chromeJsonAdapter } from './adapters/chromeJson'
import { genericAdapter } from './adapters/generic'
import { locusAdapter } from './adapters/locus'
import { netscapeAdapter } from './adapters/netscape'
import type { Adapter, DetectInput, ImportResult } from './model'

const ADAPTERS: Adapter[] = [locusAdapter, boardmarksAdapter, netscapeAdapter, chromeJsonAdapter, genericAdapter]

export type { ImportResult } from './model'

/** Parse an import file's text into a normalised ImportResult. */
export function parseImport(filename: string, text: string): ImportResult {
  const input: DetectInput = { filename: filename.toLowerCase(), text, json: null, doc: null }

  const trimmed = text.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      input.json = JSON.parse(text)
    } catch {
      /* not JSON */
    }
  }
  if (!input.json && (input.filename.endsWith('.html') || input.filename.endsWith('.htm') || /<a\s+href=/i.test(text))) {
    input.doc = new DOMParser().parseFromString(text, 'text/html')
  }
  if (!input.json && !input.doc) {
    const r = genericAdapter.parse(input)
    r.warnings.unshift('This file is neither valid JSON nor an HTML bookmarks file.')
    return r
  }

  let best: Adapter = genericAdapter
  let bestScore = 0
  for (const a of ADAPTERS) {
    const score = a.detect(input)
    if (score > bestScore) {
      bestScore = score
      best = a
    }
  }
  const result = best.parse(input)
  if (bestScore < 0.4 && best.id !== 'generic') result.confidence = 'heuristic'
  return result
}

export interface ApplyPlan {
  patch: Partial<State>
  boards: ImportResult['boards']
}

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Merge an ImportResult into current state. Local data (notes/tasks/habits/
 * journal) is appended with dedup; boards are returned for the caller to create
 * in Chrome (or locally).
 */
export function buildApplyPlan(result: ImportResult, s: State): ApplyPlan {
  const today = new Date().toISOString().slice(0, 10)

  const noteKey = (title: string, text: string) => norm(title + ' :: ' + text)
  const seenNotes = new Set(s.notes.map((n) => noteKey(n.title, n.text)))
  const notes: Note[] = [...s.notes]
  for (const n of result.notes) {
    const k = noteKey(n.title, n.text)
    if (seenNotes.has(k)) continue
    seenNotes.add(k)
    notes.push({ id: nid(), title: n.title, text: n.text })
  }

  // Dedup tasks on title alone — the same task re-imported may carry a blank/different due date.
  const seenTasks = new Set(s.tasks.map((t) => norm(t.title)))
  const tasks: Task[] = [...s.tasks]
  for (const t of result.tasks) {
    const k = norm(t.title)
    if (seenTasks.has(k)) continue
    seenTasks.add(k)
    tasks.push({
      id: nid(),
      title: t.title,
      due: t.due || today,
      time: t.time,
      subs: [],
      priority: t.priority,
      completed: t.completed,
      remind: t.remind ?? 'none',
    })
  }

  // A habit that already exists keeps its own row but absorbs any completion
  // dates from the file, so restoring a backup rebuilds history instead of
  // silently dropping it.
  const habits: Habit[] = [...s.habits]
  const habitAt = new Map(habits.map((h, i) => [norm(h.name), i]))
  for (const h of result.habits) {
    const k = norm(h.name)
    const at = habitAt.get(k)
    if (at != null) {
      if (h.done?.length) {
        const merged = [...new Set([...habits[at].done, ...h.done])].sort()
        habits[at] = { ...habits[at], done: merged }
      }
      continue
    }
    habitAt.set(k, habits.length)
    habits.push({ id: nid(), name: h.name, done: [...new Set(h.done ?? [])].sort() })
  }

  const dateNotes: Record<string, DateNote[]> = { ...s.dateNotes }
  for (const j of result.journal) {
    const list = (dateNotes[j.date] ?? []).slice()
    if (list.some((x) => norm(x.title) === norm(j.title) && norm(x.desc) === norm(j.desc))) continue
    const now = Date.now()
    list.push({ id: nid(), title: j.title, desc: j.desc, category: j.category, created: now, updated: now })
    dateNotes[j.date] = list
  }

  const patch: Partial<State> = { notes, tasks, habits, dateNotes }
  if (typeof result.settings.h24 === 'boolean') patch.h24 = result.settings.h24
  if (result.settings.engine) patch.engine = result.settings.engine

  return { patch, boards: result.boards }
}
