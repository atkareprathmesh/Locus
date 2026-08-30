import { type Adapter, type ImportBoard, cleanText, emptyResult, looksLikeUrl } from '../model'

/**
 * Netscape "bookmarks.html" — the format Chrome, Firefox, Safari and Edge all
 * export. Structure: nested <DL><DT><H3>folder</H3><DL>…<DT><A HREF>link</A>.
 * We flatten: each top-level folder becomes a board; deeper folders are merged
 * into their nearest ancestor board with a "Sub / name" label prefix on links.
 */
export const netscapeAdapter: Adapter = {
  id: 'netscape',
  label: 'Browser bookmarks (HTML)',
  detect: ({ doc, text }) => {
    if (!doc) return 0
    const t = text.toLowerCase()
    if (t.includes('<!doctype netscape-bookmark-file') || t.includes('<meta http-equiv="content-type"') && t.includes('<dl>')) return 1
    if (doc.querySelector('dl > dt > a[href]')) return 0.85
    return 0
  },
  parse: ({ doc }) => {
    const r = emptyResult('Browser bookmarks (HTML)', 'exact')
    if (!doc) return r

    const rootDl = doc.querySelector('dl')
    if (!rootDl) {
      r.warnings.push('No bookmark list found in that HTML file.')
      return r
    }

    const boards: ImportBoard[] = []
    const looseTop: { title: string; url: string }[] = []

    // Walk direct <DT> children of a <DL>.
    const walk = (dl: Element, board: ImportBoard | null, prefix: string) => {
      for (const dt of Array.from(dl.children).filter((c) => c.tagName === 'DT')) {
        const h3 = dt.querySelector(':scope > h3')
        const a = dt.querySelector(':scope > a[href]')
        const childDl = dt.querySelector(':scope > dl')
        if (h3) {
          const name = cleanText(h3.textContent, 'Folder')
          if (board == null) {
            const nb: ImportBoard = { name, bookmarks: [] }
            boards.push(nb)
            if (childDl) walk(childDl, nb, '')
          } else {
            // nested folder -> stay in same board, prefix links
            if (childDl) walk(childDl, board, prefix ? `${prefix} / ${name}` : name)
          }
        } else if (a && looksLikeUrl(a.getAttribute('href'))) {
          const url = a.getAttribute('href')!
          const title = cleanText(a.textContent, url)
          const entry = { title: prefix ? `${prefix} / ${title}` : title, url }
          if (board) board.bookmarks.push(entry)
          else looseTop.push(entry)
        }
      }
    }
    walk(rootDl, null, '')

    if (looseTop.length) boards.unshift({ name: 'Bookmarks Bar', bookmarks: looseTop })
    r.boards = boards.filter((b) => b.bookmarks.length)
    const empty = boards.length - r.boards.length
    if (empty) r.warnings.push(`Skipped ${empty} empty folder(s).`)
    return r
  },
}
