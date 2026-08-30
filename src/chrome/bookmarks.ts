import type { Board, Bookmark } from '../types'
import { hasBookmarks } from './env'
import { debounce } from '../lib/storage'

type Node = chrome.bookmarks.BookmarkTreeNode

const BAR_ID = '1'
const OTHER_ID = '2'

function collectLinks(node: Node): Bookmark[] {
  const out: Bookmark[] = []
  const walk = (n: Node) => {
    for (const c of n.children ?? []) {
      if (c.url) out.push({ id: c.id, title: c.title || c.url, url: c.url })
      else walk(c) // flatten nested folders into the parent board (v1)
    }
  }
  walk(node)
  return out
}

/**
 * Board = a top-level folder under the Bookmarks Bar or Other Bookmarks.
 * Loose bookmarks sitting directly on the bar become a "Bookmarks Bar" board.
 */
export async function readBoards(): Promise<Board[]> {
  if (!hasBookmarks) return []
  const [tree] = await chrome.bookmarks.getTree()
  const roots = new Map<string, Node>()
  for (const r of tree.children ?? []) roots.set(r.id, r)

  const boards: Board[] = []
  const bar = roots.get(BAR_ID)
  if (bar) {
    const looseOnBar = (bar.children ?? []).filter((c) => c.url)
    if (looseOnBar.length) {
      boards.push({
        id: BAR_ID,
        name: 'Bookmarks Bar',
        bookmarks: looseOnBar.map((c) => ({ id: c.id, title: c.title || c.url!, url: c.url! })),
      })
    }
    for (const folder of (bar.children ?? []).filter((c) => !c.url)) {
      boards.push({ id: folder.id, name: folder.title, bookmarks: collectLinks(folder) })
    }
  }
  const other = roots.get(OTHER_ID)
  if (other) {
    for (const folder of (other.children ?? []).filter((c) => !c.url)) {
      boards.push({ id: folder.id, name: folder.title, bookmarks: collectLinks(folder) })
    }
  }
  return boards
}

export async function createBoard(name: string): Promise<string> {
  const node = await chrome.bookmarks.create({ parentId: BAR_ID, title: name })
  return node.id
}

export async function removeBoard(id: string): Promise<void> {
  if (id === BAR_ID || id === OTHER_ID) return // never delete a root
  await chrome.bookmarks.removeTree(id)
}

export async function renameBoard(id: string, title: string): Promise<void> {
  if (id === BAR_ID || id === OTHER_ID) return // roots can't be renamed
  await chrome.bookmarks.update(id, { title })
}

export async function addBookmark(boardId: string, title: string, url: string): Promise<void> {
  await chrome.bookmarks.create({ parentId: boardId, title, url })
}

export async function removeBookmark(id: string): Promise<void> {
  await chrome.bookmarks.remove(id)
}

export async function renameBookmark(id: string, title: string): Promise<void> {
  await chrome.bookmarks.update(id, { title })
}

export async function updateBookmark(id: string, changes: { title?: string; url?: string }): Promise<void> {
  await chrome.bookmarks.update(id, changes)
}

export async function moveBookmark(id: string, parentId: string, index: number): Promise<void> {
  await chrome.bookmarks.move(id, { parentId, index })
}

/** Re-run `cb` whenever the user's bookmarks change anywhere. */
export function subscribeBookmarks(cb: () => void): () => void {
  if (!hasBookmarks) return () => {}
  const fire = debounce(cb, 150)
  const b = chrome.bookmarks
  b.onCreated.addListener(fire)
  b.onRemoved.addListener(fire)
  b.onChanged.addListener(fire)
  b.onMoved.addListener(fire)
  b.onChildrenReordered.addListener(fire)
  return () => {
    b.onCreated.removeListener(fire)
    b.onRemoved.removeListener(fire)
    b.onChanged.removeListener(fire)
    b.onMoved.removeListener(fire)
    b.onChildrenReordered.removeListener(fire)
  }
}
