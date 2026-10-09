import type { Engine, Note, PageData, State } from './types'

/**
 * Beta feedback form link. Paste your Google Form URL here and rebuild — a
 * "Send feedback" row then appears in Settings. Leave '' to hide it.
 */
export const FEEDBACK_URL: string = ''

export const ENGINES: Record<Engine, string> = {
  Google: 'https://www.google.com/search?q=',
  Bing: 'https://www.bing.com/search?q=',
  DuckDuckGo: 'https://duckduckgo.com/?q=',
  YouTube: 'https://www.youtube.com/results?search_query=',
}

// board dots are assigned automatically — the user never picks a colour
export const DOTS = ['#5b9cff', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#fb7185']

export const CATS = [
  { name: 'Personal', color: '#5b9cff' },
  { name: 'Work', color: '#a78bfa' },
  { name: 'Idea', color: '#fbbf24' },
  { name: 'Task', color: '#34d399' },
  { name: 'Other', color: '#94a3b8' },
]

export interface GApp {
  key: string
  name: string
  url: string
  /** tile tint "r,g,b" behind the glyph */
  c: string
  /** Material Symbols Rounded glyph shown on the tile */
  glyph: string
}

/** Full catalogue the "Google apps" picker can choose from. */
export const GAPP_CATALOG: GApp[] = [
  { key: 'gmail', name: 'Gmail', url: 'https://mail.google.com', c: '234,67,53', glyph: 'mail' },
  { key: 'drive', name: 'Drive', url: 'https://drive.google.com', c: '52,168,83', glyph: 'cloud' },
  { key: 'calendar', name: 'Calendar', url: 'https://calendar.google.com', c: '66,133,244', glyph: 'calendar_month' },
  { key: 'docs', name: 'Docs', url: 'https://docs.google.com', c: '66,133,244', glyph: 'description' },
  { key: 'sheets', name: 'Sheets', url: 'https://sheets.google.com', c: '15,157,88', glyph: 'grid_on' },
  { key: 'slides', name: 'Slides', url: 'https://slides.google.com', c: '244,180,0', glyph: 'slideshow' },
  { key: 'forms', name: 'Forms', url: 'https://forms.google.com', c: '124,77,255', glyph: 'checklist' },
  { key: 'meet', name: 'Meet', url: 'https://meet.google.com', c: '0,137,123', glyph: 'videocam' },
  { key: 'chat', name: 'Chat', url: 'https://chat.google.com', c: '52,168,83', glyph: 'chat_bubble' },
  { key: 'maps', name: 'Maps', url: 'https://maps.google.com', c: '52,168,83', glyph: 'location_on' },
  { key: 'photos', name: 'Photos', url: 'https://photos.google.com', c: '66,133,244', glyph: 'collections' },
  { key: 'keep', name: 'Keep', url: 'https://keep.google.com', c: '251,188,4', glyph: 'lightbulb' },
  { key: 'tasks', name: 'Tasks', url: 'https://tasks.google.com', c: '66,133,244', glyph: 'task_alt' },
  { key: 'translate', name: 'Translate', url: 'https://translate.google.com', c: '66,133,244', glyph: 'translate' },
  { key: 'youtube', name: 'YouTube', url: 'https://youtube.com', c: '255,0,0', glyph: 'smart_display' },
  { key: 'news', name: 'News', url: 'https://news.google.com', c: '66,133,244', glyph: 'newspaper' },
  { key: 'search', name: 'Search', url: 'https://www.google.com', c: '66,133,244', glyph: 'search' },
  { key: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', c: '124,77,255', glyph: 'auto_awesome' },
  { key: 'contacts', name: 'Contacts', url: 'https://contacts.google.com', c: '66,133,244', glyph: 'contacts' },
  { key: 'classroom', name: 'Classroom', url: 'https://classroom.google.com', c: '15,157,88', glyph: 'school' },
  { key: 'scholar', name: 'Scholar', url: 'https://scholar.google.com', c: '66,133,244', glyph: 'menu_book' },
  { key: 'earth', name: 'Earth', url: 'https://earth.google.com', c: '52,168,83', glyph: 'public' },
  { key: 'play', name: 'Play', url: 'https://play.google.com', c: '0,187,159', glyph: 'play_arrow' },
  { key: 'books', name: 'Books', url: 'https://books.google.com', c: '66,133,244', glyph: 'auto_stories' },
  { key: 'finance', name: 'Finance', url: 'https://www.google.com/finance', c: '52,168,83', glyph: 'trending_up' },
  { key: 'analytics', name: 'Analytics', url: 'https://analytics.google.com', c: '244,180,0', glyph: 'analytics' },
  { key: 'search-console', name: 'Search Console', url: 'https://search.google.com/search-console', c: '66,133,244', glyph: 'query_stats' },
  { key: 'business', name: 'Business Profile', url: 'https://business.google.com', c: '66,133,244', glyph: 'storefront' },
  { key: 'adsense', name: 'AdSense', url: 'https://adsense.google.com', c: '0,137,123', glyph: 'ads_click' },
  { key: 'groups', name: 'Groups', url: 'https://groups.google.com', c: '66,133,244', glyph: 'groups' },
  { key: 'sites', name: 'Sites', url: 'https://sites.google.com', c: '124,77,255', glyph: 'web' },
  { key: 'one', name: 'Google One', url: 'https://one.google.com', c: '234,67,53', glyph: 'cloud_done' },
  { key: 'voice', name: 'Voice', url: 'https://voice.google.com', c: '52,168,83', glyph: 'call' },
]

/** Keys shown by default, in order. */
export const DEFAULT_GAPPS = [
  'gmail',
  'drive',
  'calendar',
  'docs',
  'sheets',
  'slides',
  'meet',
  'maps',
  'photos',
  'keep',
  'translate',
  'youtube',
]

export const gappByKey = (key: string): GApp | undefined => GAPP_CATALOG.find((a) => a.key === key)

export const iso = (d: Date) =>
  d.getFullYear() +
  '-' +
  String(d.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getDate()).padStart(2, '0')

/** ISO date `n` days before the given date (n may be negative). DST-safe. */
export const isoShift = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() - n)
  return iso(x)
}

/**
 * Consecutive-day streak ending today. A not-yet-checked *today* does not break
 * the streak — it counts back from yesterday until the first missed day.
 */
export const habitStreak = (done: Iterable<string>, today: Date): number => {
  const set = done instanceof Set ? done : new Set(done)
  let streak = 0
  for (let i = set.has(iso(today)) ? 0 : 1; set.has(isoShift(today, i)); i++) streak++
  return streak
}

export const stamp = (t: number) =>
  new Date(t).toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

/** Deterministic dot colour for a board id. */
export function dotFor(id: string, index: number): string {
  if (/^\d+$/.test(id)) {
    let h = 0
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return DOTS[h % DOTS.length]
  }
  return DOTS[index % DOTS.length]
}

/**
 * First-run content. Deliberately thin — one note explaining the place, and
 * nothing else. Empty panels carry their own call to action, which reads better
 * than sample cards the user has to clear out.
 */
export function seedLocal(): PageData {
  const notes: Note[] = [
    {
      id: 1,
      title: 'Welcome to Locus 👋',
      text: 'One place to return to every time you open a tab. Everything lives locally in your browser — nothing is uploaded anywhere.\n\n• The left panel is your bookmarks, synced two-way with Chrome\n• Add tasks, notes, habits and a calendar journal\n• Set a wallpaper from the icon in the top-right\n\nPress ? at any time for keyboard shortcuts. Delete this note whenever you like.',
    },
  ]
  return { notes, tasks: [], habits: [], dateNotes: {} }
}

export function emptyLocal(): PageData {
  return { notes: [], tasks: [], habits: [], dateNotes: {} }
}

export function makeInitialState(): State {
  const local = seedLocal()
  return {
    ...local,
    now: Date.now(),
    monthOffset: 0,
    filter: 'today',
    prioFilter: 'any',
    openTasks: [],
    dSubFor: null,
    dSub: '',
    engine: 'Google',
    enginesOpen: false,
    query: '',
    modal: null,
    activeNote: null,
    bmQuery: '',
    importPreview: false,
    importError: '',
    h24: false,
    dTaskId: null,
    dTitle: '',
    dDue: iso(new Date()),
    dTime: '',
    dPrio: 'medium',
    dRemind: 'none',
    dBoardName: '',
    dBmName: '',
    dBmUrl: '',
    dBmBoard: '',
    dBmId: '',
    dBmOrigBoard: '',
    bmReturn: false,
    dHabit: '',
    pages: [{ id: 1, name: 'Home' }],
    deletedPages: [],
    activePage: 1,
    pageData: {},
    hoverPage: null,
    dragPage: null,
    dragOverPage: null,
    gripArmed: null,
    boardOrder: [],
    boardPage: {},
    dragBoard: null,
    dragOverBoard: null,
    dragBm: null,
    dragOverBm: null,
    dateOpen: null,
    dnFormOpen: false,
    dnEditing: null,
    dnTitle: '',
    dnDesc: '',
    dnCat: 'Personal',
    dnOpen: null,
    notesPanelHeight: 46,
    appsOpen: false,
    gapps: [...DEFAULT_GAPPS],
    gappsOn: true,
    gappsEdit: false,
    searchFocus: false,
    undo: null,
    bgImage: null,
    bgFit: 'cover',
    bgZoom: 1,
    bgX: 0,
    bgY: 0,
    bgAdjust: false,
    lastBackup: 0,
    backupEvery: 7,
    backupMsg: '',
    backupNudge: false,
    boards: [],
    history: [],
    topSites: [],
  }
}

/** Keys written to chrome.storage.local (bgImage lives in its own key). */
export const PERSIST_KEYS: (keyof State)[] = [
  'notes',
  'tasks',
  'habits',
  'dateNotes',
  'notesPanelHeight',
  'pages',
  'deletedPages',
  'activePage',
  'pageData',
  'h24',
  'engine',
  'filter',
  'prioFilter',
  'gapps',
  'gappsOn',
  'boardOrder',
  'boardPage',
  'bgFit',
  'bgZoom',
  'bgX',
  'bgY',
  'lastBackup',
  'backupEvery',
]

export type Action =
  | { type: 'patch'; patch: Partial<State> }
  | { type: 'fn'; fn: (s: State) => Partial<State> }

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch }
    case 'fn':
      return { ...state, ...action.fn(state) }
    default:
      return state
  }
}
