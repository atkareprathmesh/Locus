import { type Adapter, type ImportBoard, cleanText, emptyResult, looksLikeUrl } from '../model'

type Node = {
  type?: string
  name?: string
  url?: string
  children?: Node[]
}

/**
 * Chrome's raw `Bookmarks` profile file: { roots: { bookmark_bar, other,
 * synced }, ... } where each node is { type: "folder"|"url", name, url, children }.
 */
export const chromeJsonAdapter: Adapter = {
  id: 'chrome-json',
  label: 'Chrome bookmarks file',
  detect: ({ json }) => {
    if (!json || typeof json !== 'object') return 0
    const o = json as Record<string, unknown>
    const roots = o.roots as Record<string, unknown> | undefined
    if (roots && (roots.bookmark_bar || roots.other)) return 1
    return 0
  },
  parse: ({ json }) => {
    const r = emptyResult('Chrome bookmarks file', 'exact')
    const roots = ((json as Record<string, unknown>).roots ?? {}) as Record<string, Node>

    const collect = (node: Node): { title: string; url: string }[] => {
      const out: { title: string; url: string }[] = []
      for (const c of node.children ?? []) {
        if (c.type === 'url' && looksLikeUrl(c.url)) out.push({ title: cleanText(c.name, c.url!), url: c.url! })
        else if (c.children) out.push(...collect(c))
      }
      return out
    }

    const boards: ImportBoard[] = []
    for (const [key, root] of Object.entries(roots)) {
      if (!root || typeof root !== 'object') continue
      const loose: { title: string; url: string }[] = []
      for (const c of root.children ?? []) {
        if (c.type === 'folder') boards.push({ name: cleanText(c.name, 'Folder'), bookmarks: collect(c) })
        else if (c.type === 'url' && looksLikeUrl(c.url)) loose.push({ title: cleanText(c.name, c.url!), url: c.url! })
      }
      if (loose.length) {
        const label = key === 'bookmark_bar' ? 'Bookmarks Bar' : key === 'other' ? 'Other Bookmarks' : cleanText(root.name, key)
        boards.unshift({ name: label, bookmarks: loose })
      }
    }
    r.boards = boards.filter((b) => b.bookmarks.length)
    return r
  },
}
