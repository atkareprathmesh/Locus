import { normalizeLocal } from '../../lib/normalize'
import { type Adapter, cleanText, emptyResult, looksLikeUrl, toEngine } from '../model'

/** Jarvis's own `jarvis-backup.json`. */
export const jarvisAdapter: Adapter = {
  id: 'jarvis',
  label: 'Jarvis backup',
  detect: ({ json }) => {
    if (!json || typeof json !== 'object') return 0
    const o = json as Record<string, unknown>
    const hasLocal = Array.isArray(o.notes) || Array.isArray(o.tasks) || Array.isArray(o.habits)
    const boardsNested =
      Array.isArray(o.boards) &&
      (o.boards as unknown[]).every((b) => b && typeof b === 'object' && Array.isArray((b as Record<string, unknown>).bookmarks))
    if (hasLocal && (boardsNested || 'pageData' in o || 'dateNotes' in o)) return 0.9
    if (hasLocal && !('todoTasks' in o) && !('calendarNotes' in o)) return 0.55
    return 0
  },
  parse: ({ json }) => {
    const o = (json ?? {}) as Record<string, unknown>
    const r = emptyResult('Jarvis backup', 'exact')
    const clean = normalizeLocal(o)
    r.notes = clean.notes ?? []
    r.tasks = clean.tasks ?? []
    r.habits = (clean.habits ?? []).map((h) => ({ name: h.name }))
    for (const [date, list] of Object.entries(clean.dateNotes ?? {}))
      for (const n of list) r.journal.push({ date, title: n.title, desc: n.desc, category: n.category })
    if (typeof clean.h24 === 'boolean') r.settings.h24 = clean.h24
    if (clean.engine) r.settings.engine = clean.engine
    else if (toEngine(o.engine)) r.settings.engine = toEngine(o.engine)

    if (Array.isArray(o.boards)) {
      for (const b of o.boards as Record<string, unknown>[]) {
        if (!b || typeof b.name !== 'string') continue
        const bookmarks = Array.isArray(b.bookmarks)
          ? (b.bookmarks as Record<string, unknown>[])
              .filter((m) => looksLikeUrl(m?.url))
              .map((m) => ({ title: cleanText(m.title, String(m.url)), url: String(m.url) }))
          : []
        r.boards.push({ name: b.name, bookmarks })
      }
    }
    return r
  },
}
