import { type Adapter, cleanText, emptyResult, epochToIso, looksLikeUrl, toEngine, toPriority } from '../model'

type Row = Record<string, unknown>
const alive = (r: Row) => !r.deletedAt && !r.archivedAt

/**
 * Boardmarks (bookmark-zeta-lime.vercel.app) export. Relational schema:
 * pages / boards(pageId) / bookmarks(boardId), plus todoTasks, calendarNotes,
 * habits, a single `notes` string, and a `settings` object.
 */
export const boardmarksAdapter: Adapter = {
  id: 'boardmarks',
  label: 'Boardmarks',
  detect: ({ json }) => {
    if (!json || typeof json !== 'object') return 0
    const o = json as Row
    const markers = ['todoTasks', 'calendarNotes', 'habitLogs', 'todoLists', 'reminders']
    const hits = markers.filter((k) => k in o).length
    if (hits >= 2 && Array.isArray(o.boards) && Array.isArray(o.bookmarks)) return 1
    if (hits >= 1 && typeof o.notes === 'string') return 0.8
    return 0
  },
  parse: ({ json }) => {
    const o = (json ?? {}) as Row
    const r = emptyResult('Boardmarks', 'exact')

    const boards = (Array.isArray(o.boards) ? (o.boards as Row[]) : []).filter(alive)
    const bookmarks = (Array.isArray(o.bookmarks) ? (o.bookmarks as Row[]) : []).filter(alive)
    const byBoard = new Map<string, { title: string; url: string }[]>()
    for (const bm of bookmarks) {
      if (!looksLikeUrl(bm.url)) continue
      const key = String(bm.boardId)
      if (!byBoard.has(key)) byBoard.set(key, [])
      byBoard.get(key)!.push({ title: cleanText(bm.title, String(bm.url)), url: String(bm.url) })
    }
    let orphans = 0
    for (const b of boards) {
      const name = cleanText(b.title, 'Untitled board')
      r.boards.push({ name, bookmarks: byBoard.get(String(b.id)) ?? [] })
      byBoard.delete(String(b.id))
    }
    for (const list of byBoard.values()) orphans += list.length
    const orphanList = [...byBoard.values()].flat()
    if (orphanList.length) r.boards.push({ name: 'Imported (loose)', bookmarks: orphanList })
    if (orphans) r.warnings.push(`${orphans} bookmark(s) had no matching board — put in "Imported (loose)".`)

    // notes: one free-text string
    if (typeof o.notes === 'string' && o.notes.trim())
      r.notes.push({ title: 'Imported note', text: o.notes.trim() })

    // calendar notes -> journal
    for (const c of (Array.isArray(o.calendarNotes) ? (o.calendarNotes as Row[]) : []).filter(alive)) {
      const date = cleanText(c.date)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      r.journal.push({
        date,
        title: cleanText(c.title, 'Note'),
        desc: cleanText(c.description),
        category: capitalize(cleanText(c.category, 'Personal')),
      })
    }

    // todos -> tasks (skip subtasks' parent nesting, prefix them)
    const todos = (Array.isArray(o.todoTasks) ? (o.todoTasks as Row[]) : []).filter(alive)
    const titleById = new Map(todos.map((t) => [String(t.id), cleanText(t.title)]))
    for (const t of todos) {
      const parent = t.parentId ? titleById.get(String(t.parentId)) : null
      r.tasks.push({
        title: parent ? `${parent} — ${cleanText(t.title)}` : cleanText(t.title, 'Task'),
        due: epochToIso(t.dueAt),
        time: '',
        priority: toPriority(t.priority),
        completed: !!t.done || !!t.completedAt,
      })
    }

    // habits -> names only (dedup); Boardmarks has weekly targets, not daily ticks
    const seen = new Set<string>()
    let habitDupes = 0
    for (const h of (Array.isArray(o.habits) ? (o.habits as Row[]) : []).filter(alive)) {
      const name = cleanText(h.title)
      const key = name.toLowerCase().replace(/\s+/g, ' ')
      if (!name || seen.has(key)) {
        if (name) habitDupes++
        continue
      }
      seen.add(key)
      r.habits.push({ name })
    }
    if (habitDupes) r.warnings.push(`Skipped ${habitDupes} duplicate habit(s).`)
    if (r.habits.length) r.warnings.push('Habit daily history could not be carried over — habits start blank.')

    // settings
    const st = (o.settings ?? {}) as Row
    if (typeof st.clockFormat24h === 'boolean') r.settings.h24 = st.clockFormat24h
    if (toEngine(st.searchEngine)) r.settings.engine = toEngine(st.searchEngine)

    return r
  },
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
