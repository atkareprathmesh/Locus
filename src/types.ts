export type Priority = 'easy' | 'medium' | 'hard'
export type Engine = 'Google' | 'Images' | 'Bing' | 'DuckDuckGo' | 'YouTube'
export type Filter = 'all' | 'today' | 'upcoming' | 'done'

export interface Note {
  id: number
  title: string
  text: string
}

export interface Task {
  id: number
  title: string
  due: string // ISO yyyy-mm-dd
  time: string
  priority: Priority
  completed: boolean
}

export interface Bookmark {
  id: string // chrome bookmark node id (or local numeric string)
  title: string
  url: string
}

export interface Board {
  id: string // chrome folder id (or local numeric string)
  name: string
  bookmarks: Bookmark[]
}

export interface Habit {
  id: number
  name: string
  days: boolean[] // length 7, oldest -> newest
}

export interface DateNote {
  id: number
  title: string
  desc: string
  category: string
  created: number
  updated: number
}

export interface Page {
  id: number
  name: string
}

/** Per-page local widget data (everything except Chrome-owned bookmarks). */
export interface PageData {
  notes: Note[]
  tasks: Task[]
  habits: Habit[]
  dateNotes: Record<string, DateNote[]>
}

/** The full persisted + runtime state (mirrors the prototype's this.state). */
export interface State extends PageData {
  now: number
  monthOffset: number
  filter: Filter
  engine: Engine
  enginesOpen: boolean
  query: string
  modal: string | null
  activeNote: number | null
  bmQuery: string
  importPreview: boolean
  importError: string
  h24: boolean

  // task form
  dTitle: string
  dDue: string
  dTime: string
  dPrio: Priority
  dRemind: string
  // board / bookmark form
  dBoardName: string
  dBmName: string
  dBmUrl: string
  dBmBoard: string
  /** Non-empty while the bookmark modal is editing an existing bookmark. */
  dBmId: string
  /** The board the bookmark being edited currently lives in. */
  dBmOrigBoard: string
  /** true while the "New board" modal was opened from the Add-bookmark flow */
  bmReturn: boolean
  dHabit: string

  pages: Page[]
  activePage: number
  pageData: Record<number, PageData>
  hoverPage: number | null
  dragPage: number | null
  dragOverPage: number | null
  gripArmed: number | null

  /** Jarvis's own board display order (board ids). Boards not listed sort last. */
  boardOrder: string[]
  /** Which page each board belongs to (board id -> page id). Unlisted = current page on next load. */
  boardPage: Record<string, number>
  dragBoard: string | null
  dragOverBoard: string | null
  /** In-board bookmark drag (bookmark ids). */
  dragBm: string | null
  dragOverBm: string | null

  dateOpen: string | null
  dnFormOpen: boolean
  dnEditing: number | null
  dnTitle: string
  dnDesc: string
  dnCat: string

  appsOpen: boolean
  gapps: string[]
  /** Show the Google Apps launcher in the toolbar. */
  gappsOn: boolean
  gappsEdit: boolean
  searchFocus: boolean
  undo: { label: string; snapshot: Partial<State> } | null

  lensImage: string | null
  lensName: string
  lensDrag: boolean
  lensPinned: boolean

  bgImage: string | null

  boards: Board[]
  history: HistoryRow[]
  topSites: { title: string; url: string }[]
}

export interface HistoryRow {
  title: string
  url: string
  host: string
  time: string
}
