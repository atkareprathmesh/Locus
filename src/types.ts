export type Priority = 'easy' | 'medium' | 'hard'
export type Engine = 'Google' | 'Bing' | 'DuckDuckGo' | 'YouTube'
export type Filter = 'today' | 'backlog' | 'upcoming' | 'done' | 'all'
/** Difficulty filter for the to-do list; 'any' disables it. */
export type PrioFilter = Priority | 'any'

export interface Note {
  id: number
  title: string
  text: string
}

export interface SubTask {
  id: number
  title: string
  done: boolean
}

export interface Task {
  id: number
  title: string
  due: string // ISO yyyy-mm-dd
  time: string
  priority: Priority
  completed: boolean
  /** Local date when the task was last completed, used for daily summaries. */
  completedAt?: string
  /** 'none' | 'at' | minutes-before as a string ('5' | '15' | '60' | '1440') */
  remind: string
  /** Checklist steps belonging to this task. */
  subs: SubTask[]
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
  done: string[] // ISO 'YYYY-MM-DD' dates the habit was completed
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

export interface DeletedPage {
  page: Page
  data: PageData
  position: number
  deletedAt: number
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
  /** Difficulty filter applied on top of `filter`. */
  prioFilter: PrioFilter
  /** Tasks whose sub-task list is expanded. */
  openTasks: number[]
  /** The task currently accepting a new sub-task, and its draft text. */
  dSubFor: number | null
  dSub: string
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
  /** Non-null while the task modal is editing an existing task. */
  dTaskId: number | null
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
  deletedPages: DeletedPage[]
  activePage: number
  pageData: Record<number, PageData>
  hoverPage: number | null
  dragPage: number | null
  dragOverPage: number | null
  gripArmed: number | null

  /** Locus's own board display order (board ids). Boards not listed sort last. */
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
  /** The journal note opened as a full page inside the day drawer. */
  dnOpen: number | null

  /** User-controlled height share of the Quick Notes panel in the left rail. */
  notesPanelHeight: number

  appsOpen: boolean
  gapps: string[]
  /** Show the Google Apps launcher in the toolbar. */
  gappsOn: boolean
  gappsEdit: boolean
  searchFocus: boolean
  undo: { label: string; snapshot: Partial<State> } | null

  bgImage: string | null
  /** How the wallpaper is framed: fill (crop) or fit, plus zoom and pan. */
  bgFit: 'cover' | 'contain'
  bgZoom: number
  bgX: number
  bgY: number
  /** True while the full-screen wallpaper editor is open (not persisted). */
  bgAdjust: boolean

  /** Epoch ms of the last successful backup (0 = never). */
  lastBackup: number
  /** Days between automatic backups. 0 turns auto-backup off. */
  backupEvery: number
  /** Transient status line shown in Settings after a manual backup. */
  backupMsg: string
  /** Dismissed the "you haven't backed up" nudge for this session. */
  backupNudge: boolean

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
