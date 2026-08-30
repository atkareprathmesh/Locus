import { type Adapter, type ImportBookmark, emptyResult, epochToIso, looksLikeUrl, toPriority } from '../model'

const URL_KEYS = ['url', 'href', 'link', 'uri', 'location']
const TITLE_KEYS = ['title', 'name', 'text', 'label', 'displayName']
const GROUP_KEYS = ['folder', 'folderName', 'board', 'boardName', 'group', 'groupName', 'category', 'collection', 'parent', 'parentName', 'tag']
const DELETED_KEYS = ['deletedAt', 'archivedAt', 'isDeleted', 'deleted', 'trashed', 'removedAt']

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const firstString = (o: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim()
  return null
}
const isDeleted = (o: Record<string, unknown>) => DELETED_KEYS.some((k) => !!o[k])
const hostTitle = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Last-resort adapter for an unknown export. Recursively scans the JSON for
 * anything shaped like a bookmark / note / task / habit and buckets bookmarks
 * by the nearest folder-ish label. Always flagged 'heuristic' — the preview
 * asks the user to eyeball it before importing.
 */
export const genericAdapter: Adapter = {
  id: 'generic',
  label: 'Generic export (best effort)',
  detect: () => 0.01, // always the fallback, never wins on score
  parse: ({ json }) => {
    const r = emptyResult('Generic export (best effort)', 'heuristic')
    if (!isObj(json) && !Array.isArray(json)) {
      r.warnings.push('Could not recognise this file.')
      return r
    }

    const boardMap = new Map<string, ImportBookmark[]>()
    const pushBookmark = (group: string, bm: ImportBookmark) => {
      const key = group || 'Imported'
      if (!boardMap.has(key)) boardMap.set(key, [])
      if (!boardMap.get(key)!.some((x) => x.url === bm.url)) boardMap.get(key)!.push(bm)
    }

    const seenNoteText = new Set<string>()
    let depth = 0

    const walk = (node: unknown, groupHint: string) => {
      if (depth > 12) return
      depth++
      try {
        if (Array.isArray(node)) {
          for (const item of node) walk(item, groupHint)
          return
        }
        if (!isObj(node)) return
        if (isDeleted(node)) return

        const url = firstString(node, URL_KEYS)
        if (url && looksLikeUrl(url)) {
          const title = firstString(node, TITLE_KEYS) || hostTitle(url)
          const group = firstString(node, GROUP_KEYS) || groupHint
          pushBookmark(group, { title, url })
        }

        // free-text note fields
        for (const k of ['notes', 'note', 'content', 'body']) {
          if (typeof node[k] === 'string' && (node[k] as string).trim().length > 12) {
            const text = (node[k] as string).trim()
            if (!seenNoteText.has(text)) {
              seenNoteText.add(text)
              r.notes.push({ title: firstString(node, TITLE_KEYS) || 'Imported note', text })
            }
          }
        }

        // recurse, updating the group hint when this object names a container
        const nextHint = firstString(node, [...GROUP_KEYS, ...TITLE_KEYS]) || groupHint
        for (const [key, val] of Object.entries(node)) {
          if (!val || typeof val !== 'object') continue
          if (/task|todo/i.test(key) && Array.isArray(val)) {
            for (const t of val) {
              if (!isObj(t) || isDeleted(t)) continue
              const title = firstString(t, TITLE_KEYS)
              if (!title) continue
              r.tasks.push({
                title,
                due: epochToIso(t.dueAt ?? t.due ?? t.dueDate),
                time: '',
                priority: toPriority(t.priority),
                completed: !!t.done || !!t.completed || !!t.completedAt,
              })
            }
          } else if (/habit/i.test(key) && Array.isArray(val)) {
            for (const h of val) {
              if (!isObj(h) || isDeleted(h)) continue
              const name = firstString(h, TITLE_KEYS)
              if (name && !r.habits.some((x) => x.name.toLowerCase() === name.toLowerCase())) r.habits.push({ name })
            }
          } else {
            walk(val, /folder|board|group|categor|collection|children|items|list/i.test(key) ? nextHint : groupHint)
          }
        }
      } finally {
        depth--
      }
    }

    walk(json, '')

    for (const [name, bookmarks] of boardMap) if (bookmarks.length) r.boards.push({ name, bookmarks })
    const total = r.boards.reduce((a, b) => a + b.bookmarks.length, 0)
    r.warnings.push(
      `Best-effort scan: found ${total} link(s), ${r.notes.length} note(s), ${r.tasks.length} task(s), ${r.habits.length} habit(s). Review before importing.`,
    )
    return r
  },
}
