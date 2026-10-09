import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Box } from './components/Box'
import { ReminderChip } from './components/ReminderChip'
import TodoCard, { PRIO_META, inBucket } from './components/TodoCard'
import { BmRow } from './components/BmRow'
import { Clock } from './components/Clock'
import { Favicon } from './components/Favicon'
import { MorningBrief } from './components/MorningBrief'
import { Onboarding } from './components/Onboarding'
import { GappIcon } from './components/GappIcon'
import { DEFAULT_BG, Wallpaper, WallpaperAdjust, type BgTransform } from './components/Wallpaper'
import { css } from './lib/css'
import { open } from './lib/nav'
import { debounce, migrateKeys, store } from './lib/storage'
import { uid } from './lib/id'
import { normalizeLocal } from './lib/normalize'
import { backupOverdue, daysSince, writeBackup } from './lib/backup'
import { syncReminders } from './lib/reminders'
import type { ImportResult } from './import/model'
import { hasBookmarks, isExtension } from './chrome/env'
import {
  addBookmark as bmAdd,
  createBoard,
  moveBookmark,
  readBoards,
  removeBoard,
  removeBookmark as bmRemove,
  renameBoard,
  subscribeBookmarks,
  updateBookmark as bmUpdate,
} from './chrome/bookmarks'
import { clearHistory, recentHistory } from './chrome/history'
import { topSites as readTopSites } from './chrome/topsites'
import {
  CATS,
  DEFAULT_GAPPS,
  ENGINES,
  GAPP_CATALOG,
  PERSIST_KEYS,
  dotFor,
  emptyLocal,
  gappByKey,
  iso,
  isoShift,
  makeInitialState,
  reducer,
  stamp,
} from './state'
import type { Board, Habit, PageData, State, Task } from './types'

// Rarely-opened surfaces are split out of the new-tab bundle: this page renders
// on every single tab, so anything behind a click can load on demand instead.
const Walkthrough = lazy(() => import('./components/Walkthrough').then((m) => ({ default: m.Walkthrough })))
const HabitsModal = lazy(() => import('./modals/HabitsModal'))
const SettingsModal = lazy(() => import('./modals/SettingsModal'))
const ImportModal = lazy(() => import('./modals/ImportModal'))
const ShortcutsModal = lazy(() => import('./modals/ShortcutsModal'))

const BG_KEY = 'locus.bg'
const LOCAL_KEY = 'locus.v1'
const DEV_BOARDS_KEY = 'locus.devBoards'
const ONBOARD_KEY = 'locus.onboarded'
const JOURNAL_DRAFT_KEY = 'locus.journalDraft'
const PROFILE_KEY = 'locus.profile'
const BRIEF_KEY = 'locus.morningBrief'
const NOTIFICATION_ASKED_KEY = 'locus.notificationAsked'

const DAILY_QUOTES = {
  celebrate: [
    'Consistency is quiet proof that you can trust yourself.',
    'You kept a promise to yourself yesterday. Carry that strength forward.',
  ],
  reset: [
    'Today is not a verdict on yesterday. It is another chance to choose.',
    'Begin with one honest step. Momentum can meet you there.',
  ],
  heavy: [
    'A full day does not need a perfect beginning. Start with what matters most.',
    'Make the important thing smaller, then make it real.',
  ],
  steady: [
    'A little attention, given daily, becomes a life that feels intentional.',
    'You do not need to do everything today. You only need to begin well.',
  ],
} as const

function dailyQuote(done: number, total: number, todayCount: number, day: string): string {
  const key = total > 0 && done / total >= 0.8 ? 'celebrate' : total > 0 && done / total < 0.4 ? 'reset' : todayCount >= 6 ? 'heavy' : 'steady'
  const choices = DAILY_QUOTES[key]
  let hash = 0
  for (const char of day) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return choices[hash % choices.length]
}

/** Pre-rename key names, carried over on first boot after the Jarvis → Locus rename. */
const LEGACY_KEYS: [string, string][] = [
  ['jarvis.v1', LOCAL_KEY],
  ['jarvis.bg', BG_KEY],
  ['jarvis.devBoards', DEV_BOARDS_KEY],
  ['jarvis.onboarded', ONBOARD_KEY],
]

const localSlice = (s: State): PageData => ({
  notes: s.notes,
  tasks: s.tasks,
  habits: s.habits,
  dateNotes: s.dateNotes,
})

/** Sort boards by Locus's own order; boards not in the list keep their natural order at the end. */
function orderBoards(boards: Board[], order: string[]): Board[] {
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...boards].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
}

function devSeedBoards(): Board[] {
  return [
    {
      id: '1001',
      name: 'Getting started',
      bookmarks: [
        { id: 'b1', title: 'Google', url: 'https://google.com' },
        { id: 'b2', title: 'YouTube', url: 'https://youtube.com' },
        { id: 'b3', title: 'Gmail', url: 'https://mail.google.com' },
      ],
    },
    {
      id: '1002',
      name: 'Programming',
      bookmarks: [
        { id: 'b4', title: 'GitHub', url: 'https://github.com' },
        { id: 'b5', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' },
        { id: 'b6', title: 'React Docs', url: 'https://react.dev' },
      ],
    },
  ]
}


/** Framing reset applied when a new wallpaper is picked or one is removed. */
const DEFAULT_BG_STATE = { bgFit: DEFAULT_BG.fit, bgZoom: DEFAULT_BG.zoom, bgX: DEFAULT_BG.x, bgY: DEFAULT_BG.y }

type JournalDraft = { date: string; editing: number | null; title: string; desc: string; cat: string }
function plainJournalText(text: string) {
  return text
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(div|p|h[1-6]|li)>/gi, '\n')
    .replace(/<hr\s*\/?\s*>/gi, '\n--------------------\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/^\s*#{1,4}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
}

function journalTitleFromBody(text: string) {
  return plainJournalText(text).replace(/\s+/g, ' ').trim().slice(0, 80)
}

type PomodoroMode = 'work' | 'break'
type PomodoroState = {
  workMinutes: number
  breakMinutes: number
  mode: PomodoroMode
  secondsLeft: number
  running: boolean
  /** Absolute timestamp when the current phase ends. Shared across tabs. */
  endAt: number | null
}

const POMODORO_DEFAULTS = { workMinutes: 25, breakMinutes: 5 }
const POMODORO_KEY = 'locus.pomodoro'

const formatPomodoro = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

/** Rebuild the timer from its wall-clock deadline, including phases elapsed while this tab was closed. */
function resolvePomodoro(timer: PomodoroState, now = Date.now()): PomodoroState {
  if (!timer.running || timer.endAt == null) return timer

  let mode = timer.mode
  let endAt = timer.endAt
  let transitions = 0
  while (endAt <= now && transitions < 100) {
    mode = mode === 'work' ? 'break' : 'work'
    endAt += (mode === 'work' ? timer.workMinutes : timer.breakMinutes) * 60 * 1000
    transitions += 1
    if (timer.workMinutes === 0 && timer.breakMinutes === 0) {
      return { ...timer, secondsLeft: 0, running: false, endAt: null }
    }
  }

  return {
    ...timer,
    mode,
    endAt,
    secondsLeft: Math.max(1, Math.ceil((endAt - now) / 1000)),
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, makeInitialState)
  const s = state

  const set = useCallback(
    (x: Partial<State> | ((s: State) => Partial<State>)) =>
      typeof x === 'function' ? dispatch({ type: 'fn', fn: x }) : dispatch({ type: 'patch', patch: x }),
    [],
  )

  const [showTour, setShowTour] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showMorningBrief, setShowMorningBrief] = useState(false)
  const [boardMenu, setBoardMenu] = useState<string | null>(null)
  const [boardActionMenu, setBoardActionMenu] = useState<string | null>(null)
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null)
  const [dragDateNote, setDragDateNote] = useState<number | null>(null)
  const [dragOverDateNote, setDragOverDateNote] = useState<number | null>(null)
  const [habitWeekOffset, setHabitWeekOffset] = useState(0)
  const [pomodoroSettingsOpen, setPomodoroSettingsOpen] = useState(false)
  const [pomodoroDrafts, setPomodoroDrafts] = useState({ workMinutes: String(POMODORO_DEFAULTS.workMinutes), breakMinutes: String(POMODORO_DEFAULTS.breakMinutes) })
  const [pomodoro, setPomodoro] = useState<PomodoroState>({
    ...POMODORO_DEFAULTS,
    mode: 'work',
    secondsLeft: POMODORO_DEFAULTS.workMinutes * 60,
    running: false,
    endAt: null,
  })
  const pomodoroHydrated = useRef(false)

  // The deadline is stored in shared extension storage, not just in this tab's
  // React state. This lets a fresh new-tab page recover the same session.
  useEffect(() => {
    let alive = true
    const hydratePomodoro = async () => {
      const saved = await store.get<Partial<PomodoroState>>(POMODORO_KEY)
      if (!alive) return
      if (saved) {
        const workMinutes = Number.isInteger(Number(saved.workMinutes)) ? Math.max(0, Math.min(1440, Number(saved.workMinutes))) : POMODORO_DEFAULTS.workMinutes
        const breakMinutes = Number.isInteger(Number(saved.breakMinutes)) ? Math.max(0, Math.min(1440, Number(saved.breakMinutes))) : POMODORO_DEFAULTS.breakMinutes
        const restored: PomodoroState = {
          workMinutes,
          breakMinutes,
          mode: saved.mode === 'break' ? 'break' : 'work',
          secondsLeft: Math.max(0, Number.isFinite(Number(saved.secondsLeft)) ? Number(saved.secondsLeft) : workMinutes * 60),
          running: saved.running === true,
          endAt: Number.isFinite(Number(saved.endAt)) ? Number(saved.endAt) : null,
        }
        setPomodoro(resolvePomodoro(restored))
      }
      pomodoroHydrated.current = true
    }

    void hydratePomodoro()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void hydratePomodoro()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  // Persist only meaningful timer transitions. The ticking display itself is
  // derived locally from endAt, so we do not write to storage every second.
  useEffect(() => {
    if (!pomodoroHydrated.current) return
    void store.set(POMODORO_KEY, pomodoro)
  }, [pomodoro.workMinutes, pomodoro.breakMinutes, pomodoro.mode, pomodoro.running, pomodoro.endAt])

  useEffect(() => {
    if (!pomodoro.running) return
    const timer = window.setInterval(() => {
      setPomodoro((current) => resolvePomodoro(current))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [pomodoro.running])

  const resetPomodoro = useCallback(() => {
    setPomodoro((current) => ({ ...current, mode: 'work', secondsLeft: current.workMinutes * 60, running: false, endAt: null }))
  }, [])

  const updatePomodoroDuration = useCallback((key: 'workMinutes' | 'breakMinutes', value: number) => {
    const minutes = Math.max(0, Math.min(1440, Math.trunc(value)))
    setPomodoro((current) => ({
      ...current,
      [key]: minutes,
      secondsLeft: current.mode === (key === 'workMinutes' ? 'work' : 'break') ? minutes * 60 : current.secondsLeft,
      running: false,
      endAt: null,
    }))
  }, [])

  const searchRef = useRef<HTMLInputElement>(null)
  const bookmarkSearchRef = useRef<HTMLInputElement>(null)
  const [googleSuggestions, setGoogleSuggestions] = useState<string[]>([])
  const journalRef = useRef<HTMLTextAreaElement>(null)
  const journalEditorRef = useRef<HTMLDivElement>(null)
  const journalDraftHydrated = useRef(false)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const loaded = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (s.modal !== 'bmsearch') return
    const frame = window.requestAnimationFrame(() => bookmarkSearchRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [s.modal])

  const switchPageTo = useCallback(
    (id: number) =>
      set((st) => {
        if (id === st.activePage) return {}
        const pageData = { ...st.pageData, [st.activePage]: localSlice(st) }
        const load = pageData[id] ?? emptyLocal()
        return { pageData, activePage: id, modal: null, dateOpen: null, filter: 'today', ...load }
      }),
    [set],
  )

  const newNote = useCallback(() => {
    const id = Date.now()
    set((st) => ({ notes: [...st.notes, { id, title: '', text: '' }], modal: 'note', activeNote: id }))
  }, [set])

  const newTask = useCallback(
    () => set({ modal: 'task', dTaskId: null, dTitle: '', dDue: iso(new Date()), dTime: '', dPrio: 'medium', dRemind: 'none' }),
    [set],
  )

  const editTask = useCallback(
    (t: Task) =>
      set({
        modal: 'task',
        dTaskId: t.id,
        dTitle: t.title,
        dDue: t.due,
        dTime: t.time,
        dPrio: t.priority,
        dRemind: t.remind,
      }),
    [set],
  )

  // ---- load persisted state + boards ---------------------------------------
  useEffect(() => {
    let alive = true
    ;(async () => {
      await migrateKeys(LEGACY_KEYS)
      const saved = await store.get<Partial<State>>(LOCAL_KEY)
      const bg = await store.get<string>(BG_KEY)
      const profile = await store.get<{ name?: string }>(PROFILE_KEY)
      if (!alive) return
      if (saved) set(normalizeLocal(saved))
      if (profile?.name?.trim()) setProfileName(profile.name.trim())
      if (typeof bg === 'string' && bg.startsWith('data:')) set({ bgImage: bg })

      if (hasBookmarks) {
        const boards = await readBoards()
        if (alive) set({ boards })
      } else {
        const dev = (await store.get<Board[]>(DEV_BOARDS_KEY)) ?? devSeedBoards()
        if (alive) set({ boards: dev })
      }

      // First run: show the walkthrough. No sample board is created — a new
      // user gets the boards empty state instead, which offers to build one
      // from their own most-visited sites. Runs once, guarded by ONBOARD_KEY.
      const onboarded = await store.get<boolean>(ONBOARD_KEY)
      const briefState = await store.get<{ lastShown?: string }>(BRIEF_KEY)
      const today = iso(new Date())
      if (!alive) return
      if (!profile?.name?.trim()) {
        setShowOnboarding(true)
      } else if (briefState?.lastShown !== today) {
        await store.set(BRIEF_KEY, { lastShown: today })
        setShowMorningBrief(true)
      }
      if (!onboarded && profile?.name?.trim()) {
        await store.set(ONBOARD_KEY, true)
        if (alive) setShowTour(true)
      }
      loaded.current = true
    })()
    return () => {
      alive = false
    }
  }, [set])

  useEffect(() => {
    if (!hasBookmarks) return
    return subscribeBookmarks(async () => {
      const boards = await readBoards()
      set({ boards })
    })
  }, [set])

  // ---- persist local slices ----------------------------------------------
  const saveLocal = useMemo(
    () =>
      debounce((snap: Partial<State>) => {
        void store.set(LOCAL_KEY, snap)
      }, 250),
    [],
  )
  const saveJournalDraft = useMemo(
    () =>
      debounce((draft: JournalDraft) => {
        void store.set(JOURNAL_DRAFT_KEY, draft)
      }, 180),
    [],
  )

  useEffect(() => {
    if (!s.dnFormOpen || !s.dateOpen) {
      journalDraftHydrated.current = false
      return
    }
    let alive = true
    journalDraftHydrated.current = false
    void (async () => {
      const draft = await store.get<JournalDraft>(JOURNAL_DRAFT_KEY)
      if (!alive) return
      if (draft && draft.date === s.dateOpen && draft.editing === s.dnEditing) {
        set({ dnTitle: draft.title, dnDesc: draft.desc, dnCat: draft.cat })
      }
      journalDraftHydrated.current = true
    })()
    return () => {
      alive = false
    }
  }, [s.dnFormOpen, s.dateOpen, s.dnEditing, set])

  useEffect(() => {
    if (!s.dnFormOpen || !s.dateOpen || !journalDraftHydrated.current) return
    saveJournalDraft({ date: s.dateOpen, editing: s.dnEditing, title: s.dnTitle, desc: s.dnDesc, cat: s.dnCat })
  }, [s.dnFormOpen, s.dateOpen, s.dnEditing, s.dnTitle, s.dnDesc, s.dnCat, saveJournalDraft])

  useEffect(() => {
    if (!loaded.current) return
    const snap: Partial<State> = {}
    for (const k of PERSIST_KEYS) (snap as Record<string, unknown>)[k] = s[k]
    saveLocal(snap)
    // Persisted slices only — see PERSIST_KEYS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    s.notes,
    s.tasks,
    s.habits,
    s.dateNotes,
    s.notesPanelHeight,
    s.pages,
    s.activePage,
    s.pageData,
    s.h24,
    s.engine,
    s.filter,
    s.prioFilter,
    s.gapps,
    s.gappsOn,
    s.boardOrder,
    s.boardPage,
    s.lastBackup,
    s.backupEvery,
    s.bgFit,
    s.bgZoom,
    s.bgX,
    s.bgY,
    saveLocal,
  ])

  useEffect(() => {
    if (!loaded.current) return
    if (s.bgImage) void store.set(BG_KEY, s.bgImage)
    else void store.remove(BG_KEY)
  }, [s.bgImage])

  useEffect(() => {
    if (loaded.current && !hasBookmarks) void store.set(DEV_BOARDS_KEY, s.boards)
  }, [s.boards])

  // ---- backups ------------------------------------------------------------
  // Chrome offers no hook before an uninstall or a profile wipe, so the only
  // real protection is a copy that already lives outside the extension. Auto
  // backups land in the Downloads folder on a schedule; the nudge covers the
  // case where that silently isn't happening.
  const runBackup = useCallback(
    async (auto: boolean) => {
      const ok = await writeBackup(stateRef.current, auto)
      if (ok) set({ lastBackup: Date.now(), backupMsg: auto ? '' : 'Saved to your Downloads folder.' })
      else if (!auto) set({ backupMsg: 'Could not write the backup file.' })
      return ok
    },
    [set],
  )

  const backupChecked = useRef(false)
  useEffect(() => {
    if (!loaded.current || backupChecked.current || !s.backupEvery) return
    backupChecked.current = true
    const due = !s.lastBackup || Date.now() - s.lastBackup > s.backupEvery * 86_400_000
    const hasData = s.notes.length + s.tasks.length + s.habits.length > 0
    if (due && hasData) void runBackup(true)
  }, [s.backupEvery, s.lastBackup, s.notes.length, s.tasks.length, s.habits.length, runBackup])

  // ---- task reminders -----------------------------------------------------
  // chrome.alarms is the source of truth for firing; this keeps it in step with
  // whatever the task list currently says.
  useEffect(() => {
    if (!loaded.current) return
    void syncReminders(s.tasks)
  }, [s.tasks])

  // Any board Locus hasn't seen before (first load, or a folder created directly
  // in Chrome) is pinned to whatever page is active when it shows up.
  useEffect(() => {
    if (!loaded.current) return
    const missing = s.boards.filter((b) => s.boardPage[b.id] == null)
    if (!missing.length) return
    set((st) => {
      const boardPage = { ...st.boardPage }
      for (const b of missing) if (boardPage[b.id] == null) boardPage[b.id] = st.activePage
      return { boardPage }
    })
  }, [s.boards, s.boardPage, s.activePage, set])

  // ---- keyboard + paste --------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBoardMenu(null)
        // The search box takes focus on load so a new tab is type-to-search.
        // Escape steps out of it, which is also what unlocks the single-key
        // shortcuts below.
        if (document.activeElement === searchRef.current) searchRef.current?.blur()
        set({
          modal: null,
          dateOpen: null,
          enginesOpen: false,
          appsOpen: false,
          gappsEdit: false,
          importPreview: false,
          dnFormOpen: false,
          dragBoard: null,
          dragOverBoard: null,
          dragBm: null,
          dragOverBm: null,
          bmReturn: false,
        })
        return
      }

      // Never steal a keystroke that belongs to a field the user is in.
      const el = document.activeElement as HTMLElement | null
      const typing =
        !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }

      // The rest only make sense on the dashboard itself.
      const st = stateRef.current
      if (st.modal || st.dateOpen || st.bgAdjust) return

      if (e.key >= '1' && e.key <= '9') {
        const page = st.pages[Number(e.key) - 1]
        if (page) {
          e.preventDefault()
          switchPageTo(page.id)
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault()
          newNote()
          break
        case 't':
          e.preventDefault()
          newTask()
          break
        case 'h':
          e.preventDefault()
          set({ modal: 'habits' })
          break
        case 'b':
          e.preventDefault()
          set({ modal: 'bmsearch', bmQuery: '' })
          break
        case '?':
          e.preventDefault()
          set({ modal: 'shortcuts' })
          break
      }
    }
    document.addEventListener('keydown', onKey)
    searchRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [set, switchPageTo, newNote, newTask])

  useEffect(() => {
    void readTopSites().then((topSites) => set({ topSites }))
  }, [set])

  // Google exposes the same lightweight suggestion feed used by its search
  // field. Keep this separate from saved content, so a failed network request
  // never prevents the local bookmark / note suggestions from working.
  useEffect(() => {
    const query = s.query.trim()
    if (!query || s.engine !== 'Google') {
      setGoogleSuggestions([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        )
        if (!response.ok) return
        const data: unknown = await response.json()
        const items = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : []
        setGoogleSuggestions(items.filter((item): item is string => typeof item === 'string').slice(0, 6))
      } catch (error) {
        if ((error as DOMException).name !== 'AbortError') setGoogleSuggestions([])
      }
    }, 170)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [s.query, s.engine])

  // close the per-board "move to page" menu when the page changes
  useEffect(() => setBoardMenu(null), [s.activePage])

  // ---- helpers ---------------------------------------------------------
  const withUndo = (label: string, keys: (keyof State)[], mutator: (s: State) => Partial<State>) => {
    const snapshot: Partial<State> = {}
    for (const k of keys) (snapshot as Record<string, unknown>)[k] = s[k]
    clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => set({ undo: null }), 7000)
    set((st) => ({ ...mutator(st), undo: { label, snapshot } }))
  }

  // Wallpaper framing (fit / zoom / pan) as one value for <Wallpaper>.
  const bgT: BgTransform = { fit: s.bgFit, zoom: s.bgZoom, x: s.bgX, y: s.bgY }
  const setBgT = (t: BgTransform) => set({ bgFit: t.fit, bgZoom: t.zoom, bgX: t.x, bgY: t.y })

  const onBgFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const r = new FileReader()
    r.onload = (ev) =>
      set({
        bgImage: String(ev.target?.result ?? ''),
        ...DEFAULT_BG_STATE,
        bgAdjust: true,
        modal: null,
      })
    r.readAsDataURL(file)
    e.target.value = ''
  }

  // ---- board ops (Chrome or local) -----------------------------------
  /** Pin a board to a page (board id -> page id). Boards are per-page in Locus. */
  const assignBoard = (id: string, pageId: number) =>
    set((st) => ({
      boardPage: { ...st.boardPage, [id]: pageId },
      dragBoard: null,
      dragOverBoard: null,
      dragPage: null,
      dragOverPage: null,
    }))
  const addBoard = async (name: string): Promise<string> => {
    const page = stateRef.current.activePage
    if (hasBookmarks) {
      const id = await createBoard(name)
      assignBoard(id, page)
      return id
    }
    const id = uid('board')
    set((st) => ({
      boards: [...st.boards, { id, name, bookmarks: [] }],
      boardPage: { ...st.boardPage, [id]: page },
    }))
    return id
  }
  const deleteBoard = (id: string) =>
    withUndo('Board deleted', ['boards', 'boardPage'], (st) => {
      if (hasBookmarks) void removeBoard(id)
      const boardPage = { ...st.boardPage }
      delete boardPage[id]
      return { boards: st.boards.filter((b) => b.id !== id), boardPage }
    })
  const renameBoardName = async (id: string, name: string) => {
    const next = name.trim()
    if (!next) return
    if (hasBookmarks) await renameBoard(id, next)
    else set((st) => ({ boards: st.boards.map((b) => (b.id === id ? { ...b, name: next } : b)) }))
  }
  const reorderBoards = (fromId: string, toId: string) =>
    set((st) => {
      const pageOf = (id: string) => st.boardPage[id] ?? st.activePage
      const onPage = st.boards.filter((b) => pageOf(b.id) === st.activePage)
      const ids = orderBoards(onPage, st.boardOrder).map((b) => b.id)
      const from = ids.indexOf(fromId)
      const to = ids.indexOf(toId)
      if (from < 0 || to < 0 || from === to) return { dragBoard: null, dragOverBoard: null }
      ids.splice(to, 0, ids.splice(from, 1)[0])
      // keep other pages' ordering entries, replace this page's slice
      const others = st.boardOrder.filter((id) => !ids.includes(id) && pageOf(id) !== st.activePage)
      return { boardOrder: [...others, ...ids], dragBoard: null, dragOverBoard: null }
    })
  /** Open the bookmark modal pre-filled to edit an existing bookmark. */
  const openBookmarkEdit = (boardId: string, bm: { id: string; title: string; url: string }) =>
    set({
      modal: 'bookmark',
      dBmId: bm.id,
      dBmName: bm.title,
      dBmUrl: bm.url,
      dBmBoard: boardId,
      dBmOrigBoard: boardId,
    })

  /** Apply edits from the bookmark modal to an existing bookmark. */
  const saveBookmarkEdit = async (id: string, fromBoard: string, toBoard: string, title: string, url: string) => {
    if (hasBookmarks) {
      await bmUpdate(id, { title, url })
      if (toBoard && toBoard !== fromBoard) await moveBookmark(id, toBoard, 0)
      return
    }
    set((st) => {
      let moved: { id: string; title: string; url: string } | null = null
      const boards = st.boards.map((b) => {
        if (b.id !== fromBoard) return b
        const bookmarks = b.bookmarks.flatMap((x) => {
          if (x.id !== id) return [x]
          const next = { ...x, title, url }
          if (toBoard && toBoard !== fromBoard) {
            moved = next
            return []
          }
          return [next]
        })
        return { ...b, bookmarks }
      })
      return {
        boards: moved
          ? boards.map((b) => (b.id === toBoard ? { ...b, bookmarks: [...b.bookmarks, moved!] } : b))
          : boards,
      }
    })
  }
  const deleteBookmark = (boardId: string, bmId: string) =>
    withUndo('Bookmark deleted', ['boards'], (st) => {
      if (hasBookmarks) void bmRemove(bmId)
      return {
        boards: st.boards.map((b) =>
          b.id === boardId ? { ...b, bookmarks: b.bookmarks.filter((x) => x.id !== bmId) } : b,
        ),
      }
    })
  const reorderBookmark = (boardId: string, fromId: string, toId: string) =>
    set((st) => {
      const board = st.boards.find((b) => b.id === boardId)
      if (!board) return { dragBm: null, dragOverBm: null }
      const list = board.bookmarks.slice()
      const from = list.findIndex((x) => x.id === fromId)
      const to = list.findIndex((x) => x.id === toId)
      if (from < 0 || to < 0 || from === to) return { dragBm: null, dragOverBm: null }
      list.splice(to, 0, list.splice(from, 1)[0])
      if (hasBookmarks) void moveBookmark(fromId, boardId, to)
      return {
        boards: st.boards.map((b) => (b.id === boardId ? { ...b, bookmarks: list } : b)),
        dragBm: null,
        dragOverBm: null,
      }
    })
  const addBookmarkTo = async (boardId: string, title: string, url: string) => {
    if (hasBookmarks) await bmAdd(boardId, title, url)
    else
      set((st) => ({
        boards: st.boards.map((b) =>
          b.id === boardId ? { ...b, bookmarks: [...b.bookmarks, { id: uid('bm'), title, url }] } : b,
        ),
      }))
  }

  // ---- page switching -------------------------------------------------
  const switchPage = switchPageTo
  const addPage = () =>
    set((st) => {
      const id = Date.now()
      const pageData = { ...st.pageData, [st.activePage]: localSlice(st) }
      return {
        pages: [...st.pages, { id, name: 'Page ' + (st.pages.length + 1) }],
        pageData,
        activePage: id,
        modal: null,
        dateOpen: null,
        filter: 'today',
        ...emptyLocal(),
      }
    })
  const deletePage = (id: number) => {
    if (s.pages.length < 2) return
    withUndo(
      'Page deleted',
      ['pages', 'pageData', 'activePage', 'notes', 'tasks', 'habits', 'dateNotes', 'boardPage'],
      (st) => {
        if (st.pages.length < 2) return {}
        const pages = st.pages.filter((p) => p.id !== id)
        const data = { ...st.pageData }
        if (id !== st.activePage) data[st.activePage] = localSlice(st)
        delete data[id]
        // move the deleted page's boards to whichever page is active afterwards
        const survivor = id === st.activePage ? pages[0].id : st.activePage
        const boardPage = { ...st.boardPage }
        for (const k of Object.keys(boardPage)) if (boardPage[k] === id) boardPage[k] = survivor
        if (id !== st.activePage) return { pages, pageData: data, boardPage }
        const next = pages[0]
        const load = data[next.id] ?? emptyLocal()
        return { pages, pageData: data, boardPage, activePage: next.id, modal: null, dateOpen: null, filter: 'today', ...load }
      },
    )
  }
  const renamePage = (id: number, current: string) => {
    const name = window.prompt('Rename page', current)
    if (!name || !name.trim()) return
    set((st) => ({ pages: st.pages.map((p) => (p.id === id ? { id: p.id, name: name.trim() } : p)) }))
  }
  const reorderPages = (from: number, to: number) =>
    set((st) => {
      const list = st.pages.slice()
      const fi = list.findIndex((p) => p.id === from)
      const ti = list.findIndex((p) => p.id === to)
      if (fi < 0 || ti < 0) return { dragPage: null, dragOverPage: null, gripArmed: null }
      list.splice(ti, 0, list.splice(fi, 1)[0])
      return { pages: list, dragPage: null, dragOverPage: null, gripArmed: null }
    })

  // ---- modal open helpers ------------------------------------------
  const openModal = (modal: string, extra: Partial<State> = {}) => set({ modal, ...extra })
  const closeModal = () => {
    setEditingBoardId(null)
    set({ modal: null, importPreview: false, importError: '', bmReturn: false, dBmId: '', dBmOrigBoard: '' })
  }

  const openHistory = async () => {
    openModal('histpage')
    const rows = await recentHistory(40)
    set({ history: rows })
  }

  const tools = [
    { icon: 'bookmarks', label: 'Search bookmarks', onClick: () => openModal('bmsearch', { bmQuery: '' }) },
    { icon: 'swap_vert', label: 'Import / export', onClick: () => openModal('import', { importPreview: false, importError: '' }) },
    {
      icon: 'open_in_full',
      label: 'Fullscreen',
      onClick: () => {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen?.()
      },
    },
    { icon: 'explore', label: 'Daily Compass', onClick: () => (profileName ? setShowMorningBrief(true) : setShowOnboarding(true)) },
    { icon: 'history', label: 'History', onClick: () => void openHistory() },
    { icon: 'settings', label: 'Settings', onClick: () => openModal('settings') },
  ]

  // ---- derived --------------------------------------------------------
  // Boards are per-page: only show the ones pinned to the active page. A board
  // with no assignment yet (see the auto-assign effect) falls through to here.
  const pageBoards = s.boards.filter((b) => (s.boardPage[b.id] ?? s.activePage) === s.activePage)
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const todayIso = iso(today)
  const yesterdayIso = isoShift(today, 1)
  const briefTasks = s.tasks.filter((task) => task.due === todayIso)
  const yesterdayPendingTasks = s.tasks.filter((task) => task.due === yesterdayIso && !task.completed)
  const briefHabits = s.habits.filter((habit) => !habit.done.includes(todayIso))
  const yesterdayTasks = s.tasks.filter((task) => task.due === yesterdayIso)
  const yesterdayDoneTasks = s.tasks.filter((task) => task.completedAt === yesterdayIso).length
  const yesterdayDoneHabits = s.habits.filter((habit) => habit.done.includes(yesterdayIso)).length
  const yesterdayTotal = yesterdayTasks.length + s.habits.length
  const yesterdayDone = yesterdayDoneTasks + yesterdayDoneHabits
  const morningQuote = dailyQuote(yesterdayDone, yesterdayTotal, briefTasks.length + briefHabits.length, todayIso)
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay() + habitWeekOffset * 7)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + i)
    const dayIso = iso(date)
    return {
      iso: dayIso,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
      day: date.getDate(),
      isToday: dayIso === todayIso,
      future: dayIso > todayIso,
    }
  })
  const weekLabel = habitWeekOffset === 0
    ? 'This week'
    : `${weekDays[0].day} ${weekDays[0].label} – ${weekDays[6].day} ${weekDays[6].label}`

  // calendar
  const base = new Date(today.getFullYear(), today.getMonth() + s.monthOffset, 1)
  const dim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  // a day is marked when it carries habits, tasks or journal notes — the three
  // things the calendar now gathers in one place.
  const habitDoneDays = new Set<string>()
  for (const h of s.habits) for (const d of h.done) habitDoneDays.add(d)
  const taskDueDays = new Set(s.tasks.filter((x) => !x.completed).map((x) => x.due))
  const emptyMarks = { habit: false, task: false, note: false }
  const calDays: { label: string; today: boolean; marks: typeof emptyMarks; dayIso: string | null }[] = []
  for (let i = 0; i < base.getDay(); i++) calDays.push({ label: '', today: false, marks: emptyMarks, dayIso: null })
  for (let d = 1; d <= dim; d++) {
    const dayIso = iso(new Date(base.getFullYear(), base.getMonth(), d))
    calDays.push({
      label: String(d),
      today: s.monthOffset === 0 && d === today.getDate(),
      marks: {
        habit: habitDoneDays.has(dayIso),
        task: taskDueDays.has(dayIso),
        note: (s.dateNotes[dayIso] || []).length > 0,
      },
      dayIso,
    })
  }
  const MARK_COLORS = { habit: 'rgba(93,202,165,.95)', task: 'rgba(239,159,39,.95)', note: 'rgba(133,183,235,.95)' }
  const catColor = (n: string) => (CATS.find((c) => c.name === n) || CATS[4]).color
  const dayList = s.dateOpen ? s.dateNotes[s.dateOpen] || [] : []
  const dayTasks = s.dateOpen ? s.tasks.filter((x) => x.due === s.dateOpen) : []
  const openNote = s.dnOpen != null ? dayList.find((n) => n.id === s.dnOpen) || null : null
  /** Clock time of a journal entry, for the corner stamp. */
  const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  const toggleTask = (id: number) =>
    set((st) => ({
      tasks: st.tasks.map((x) =>
        x.id === id
          ? { ...x, completed: !x.completed, completedAt: !x.completed ? iso(new Date()) : undefined }
          : x,
      ),
    }))

  const completeOnboarding = async (name: string, enableNotifications: boolean) => {
    const clean = name.trim()
    let permission = 'unsupported'
    let permissionRequest: Promise<NotificationPermission> | null = null
    try {
      if (!enableNotifications) {
        permission = 'skipped'
      } else {
      if (typeof Notification !== 'undefined') {
        permission = Notification.permission
        if (permission === 'default') permissionRequest = Notification.requestPermission()
      }
      }
    } catch {
      permission = 'unavailable'
    }
    await store.set(PROFILE_KEY, { name: clean, createdAt: Date.now() })
    await store.set(ONBOARD_KEY, true)
    if (permissionRequest) permission = await permissionRequest
    await store.set(NOTIFICATION_ASKED_KEY, { at: Date.now(), permission })
    await store.set(BRIEF_KEY, { lastShown: iso(new Date()) })
    setProfileName(clean)
    setShowOnboarding(false)
    setShowMorningBrief(true)
  }

  const closeMorningBrief = () => setShowMorningBrief(false)

  // notes
  const noteTitle = (n: { title: string; text: string }) =>
    (n.title && n.title.trim()) || (n.text || '').trim().split('\n')[0].slice(0, 34) || 'Untitled note'
  const activeNote = s.notes.find((n) => n.id === s.activeNote) || { id: 0, title: '', text: '' }

  // tasks
  const prioMeta = PRIO_META
  const visibleTasks = s.tasks.filter(
    (t) => inBucket(t, s.filter, todayIso) && (s.prioFilter === 'any' || t.priority === s.prioFilter),
  )
  const emptyTaskLine =
    s.filter === 'done'
      ? 'Nothing completed yet.'
      : s.filter === 'upcoming'
        ? 'Nothing scheduled ahead.'
        : s.filter === 'backlog'
          ? 'Nothing overdue — nice.'
          : s.filter === 'today'
            ? 'Nothing due today.'
            : "You're all caught up."

  const toggleHabitDay = (id: number, dayIso: string) =>
    set((st) => ({
      habits: st.habits.map((x) =>
        x.id === id
          ? { ...x, done: x.done.includes(dayIso) ? x.done.filter((d) => d !== dayIso) : [...x.done, dayIso] }
          : x,
      ),
    }))
  const deleteHabit = (h: Habit) =>
    withUndo('Habit deleted', ['habits'], (st) => ({ habits: st.habits.filter((x) => x.id !== h.id) }))

  // suggestions
  const sq = s.query.trim().toLowerCase()
  const suggestions: { icon: string; label: string; kind: string; onPick: () => void }[] = []
  if (sq) {
    for (const suggestion of googleSuggestions) {
      if (suggestions.length < 6)
        suggestions.push({
          icon: 'search',
          label: suggestion,
          kind: 'Google',
          onPick: () => open(ENGINES[s.engine] + encodeURIComponent(suggestion)),
        })
    }
    if (!suggestions.some((suggestion) => suggestion.label.toLowerCase() === s.query.toLowerCase()))
      suggestions.push({
        icon: 'search',
        label: s.query,
        kind: s.engine,
        onPick: () => open(ENGINES[s.engine] + encodeURIComponent(s.query)),
      })
    for (const b of pageBoards)
      for (const bm of b.bookmarks) {
        if (suggestions.length < 6 && (bm.title.toLowerCase().includes(sq) || bm.url.toLowerCase().includes(sq)))
          suggestions.push({ icon: 'bookmark', label: bm.title, kind: b.name, onPick: () => open(bm.url) })
      }
    for (const n of s.notes)
      if (suggestions.length < 8 && noteTitle(n).toLowerCase().includes(sq))
        suggestions.push({
          icon: 'sticky_note_2',
          label: noteTitle(n),
          kind: 'Note',
          onPick: () => set({ modal: 'note', activeNote: n.id, query: '' }),
        })
    for (const st of s.topSites)
      if (suggestions.length < 10 && st.title.toLowerCase().includes(sq))
        suggestions.push({ icon: 'trending_up', label: st.title, kind: 'Top site', onPick: () => open(st.url) })
  }
  const hasSuggest = !!sq && s.searchFocus && suggestions.length > 0

  const bmCount = pageBoards.reduce((a, b) => a + b.bookmarks.length, 0)
  const orderedBoards = orderBoards(pageBoards, s.boardOrder)

  const backupAge = daysSince(s.lastBackup)
  const showBackupNudge = !s.backupNudge && backupOverdue(s)

  // bookmark search results
  const bq = s.bmQuery.trim().toLowerCase()
  const bmResults = orderedBoards
    .map((b, i) => ({
      name: b.name,
      dot: dotFor(b.id, i),
      items: b.bookmarks.filter(
        (bm) =>
          !bq || bm.title.toLowerCase().includes(bq) || bm.url.toLowerCase().includes(bq) || b.name.toLowerCase().includes(bq),
      ),
    }))
    .filter((g) => g.items.length)

  const wide = ['habits', 'bmsearch', 'settings', 'import', 'note', 'todo', 'histpage'].includes(s.modal || '')
  const titles: Record<string, string> = {
    note: 'Note',
    todo: 'To-do list',
    task: 'New task',
    board: editingBoardId ? 'Rename board' : 'New board',
    bookmark: 'Add bookmark',
    bmsearch: 'Search bookmarks',
    habits: 'Habits',
    import: 'Import / export',
    settings: 'Settings',
    histpage: 'History',
    clearhistory: 'Clear history',
    shortcuts: 'Keyboard shortcuts',
  }

  // ---- import / export --------------------------------------------
  const doExport = () => {
    const data = {
      notes: s.notes,
      tasks: s.tasks,
      habits: s.habits,
      dateNotes: s.dateNotes,
      pages: s.pages,
      pageData: s.pageData,
      boards: s.boards,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'locus-backup.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  const [parsed, setParsed] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setParsed(null)
    void Promise.all([file.text(), import('./import')])
      .then(([text, { parseImport }]) => {
        const result = parseImport(file.name, text)
        const total =
          result.boards.reduce((a: number, b: { bookmarks: unknown[] }) => a + b.bookmarks.length, 0) +
          result.notes.length +
          result.tasks.length +
          result.habits.length +
          result.journal.length
        if (total === 0) {
          set({ importPreview: false, importError: `Couldn't find anything to import in "${file.name}".` })
          return
        }
        setParsed(result)
        set({ importPreview: true, importError: '' })
      })
      .catch(() => set({ importPreview: false, importError: 'Could not read that file.' }))
  }

  /** Existing board id by name (case-insensitive), or create one. */
  const ensureBoard = async (name: string): Promise<string> => {
    const hit = stateRef.current.boards.find((b) => b.name.toLowerCase() === name.toLowerCase())
    if (hit) return hit.id
    const page = stateRef.current.activePage
    if (hasBookmarks) {
      const id = await createBoard(name)
      assignBoard(id, page)
      return id
    }
    const id = uid('board')
    set((st) => ({ boards: [...st.boards, { id, name, bookmarks: [] }], boardPage: { ...st.boardPage, [id]: page } }))
    return id
  }

  const confirmImport = async () => {
    if (!parsed) return
    setImporting(true)
    try {
      const { buildApplyPlan } = await import('./import')
      const { patch, boards } = buildApplyPlan(parsed, stateRef.current)
      set(patch)
      for (const ib of boards) {
        try {
          const targetId = await ensureBoard(ib.name)
          const board = stateRef.current.boards.find((b) => b.id === targetId)
          const have = new Set((board?.bookmarks ?? []).map((b) => b.url))
          for (const bm of ib.bookmarks) {
            if (have.has(bm.url)) continue
            have.add(bm.url)
            await addBookmarkTo(targetId, bm.title, bm.url)
          }
        } catch {
          /* skip a board that fails */
        }
      }
    } finally {
      setImporting(false)
      setParsed(null)
      set({ importPreview: false, modal: null })
    }
  }


  // Empty-state shortcut: turn a few most-visited sites into a starter board.
  const [pickedSites, setPickedSites] = useState<string[]>([])
  const addPickedSites = async () => {
    if (!pickedSites.length) return
    const chosen = s.topSites.filter((x) => pickedSites.includes(x.url))
    setPickedSites([])
    const id = await addBoard('Quick links')
    for (const site of chosen) await addBookmarkTo(id, site.title || site.url, site.url)
  }

  // ================================================================
  return (
    <div
      style={css(
        "position:relative; width:100%; height:100vh; min-height:560px; overflow:hidden; font-family:'Manrope',system-ui,sans-serif; color:#fff;",
      )}
    >
      {s.bgImage ? (
        <Wallpaper src={s.bgImage} t={bgT} />
      ) : (
        <>
          <div
            style={css(
              'position:absolute; inset:0; background:radial-gradient(120% 90% at 18% 8%, #21405e 0%, #16283c 42%, #0f1a26 72%, #0b1119 100%);',
            )}
          />
          <div
            style={css(
              'position:absolute; inset:0; background:radial-gradient(70% 60% at 82% 88%, rgba(92,74,140,.5) 0%, rgba(20,26,38,0) 70%);',
            )}
          />
        </>
      )}

      <div
        style={{
          ...css(
            'position:relative; z-index:1; height:100%; display:flex; flex-direction:column; gap:clamp(8px,1.2vh,14px); padding:clamp(14px,2vh,22px) clamp(62px,4.6vw,78px) clamp(12px,1.8vh,20px) clamp(16px,1.5vw,26px);',
          ),
          // Hide the dashboard while framing the wallpaper so what you drag is
          // exactly what you get.
          ...(s.bgAdjust ? { opacity: 0.12, pointerEvents: 'none' as const } : null),
        }}
      >
        {/* Top bar */}
        <div style={css('display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:center; gap:clamp(10px,1.2vw,18px); flex-shrink:0;')}>
          <div
            data-tour="pages"
            style={css(
              'justify-self:start; display:flex; align-items:center; gap:2px; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:13px; padding:4px; flex-shrink:0;',
            )}
          >
            {s.pages.map((p) => {
              const on = p.id === s.activePage
              const show = s.hoverPage === p.id || on
              const dragging = s.dragPage === p.id
              const over = s.dragOverPage === p.id && s.dragPage !== p.id
              return (
                <div
                  key={p.id}
                  onMouseEnter={() => set({ hoverPage: p.id })}
                  onMouseLeave={() => set({ hoverPage: null })}
                  draggable={s.gripArmed === p.id}
                  onDragStart={() => set({ dragPage: p.id })}
                  onDragOver={(e) => {
                    if (s.dragBoard) {
                      e.preventDefault()
                      if (s.dragOverPage !== p.id) set({ dragOverPage: p.id })
                      return
                    }
                    e.preventDefault()
                    if (s.dragOverPage !== p.id) set({ dragOverPage: p.id })
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (s.dragBoard) {
                      if ((s.boardPage[s.dragBoard] ?? s.activePage) !== p.id) assignBoard(s.dragBoard, p.id)
                      else set({ dragBoard: null, dragOverBoard: null, dragOverPage: null })
                      return
                    }
                    if (s.dragPage && s.dragPage !== p.id) reorderPages(s.dragPage, p.id)
                    else set({ dragPage: null, dragOverPage: null, gripArmed: null })
                  }}
                  onDragEnd={() => set({ dragPage: null, dragOverPage: null, gripArmed: null })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 12,
                    transition: 'opacity .22s, transform .22s, margin .22s',
                    opacity: dragging ? 0.55 : 1,
                    transform: `scale(${dragging ? 0.97 : 1})`,
                    marginLeft: over ? 10 : undefined,
                    boxShadow:
                      s.dragBoard && s.dragOverPage === p.id ? 'inset 0 0 0 1.5px rgba(120,170,255,.85)' : undefined,
                  }}
                >
                  <span
                    onMouseDown={() => set({ gripArmed: p.id })}
                    title="Drag to reorder"
                    style={{
                      fontFamily: 'Material Symbols Rounded',
                      fontSize: 16,
                      lineHeight: 1,
                      cursor: 'grab',
                      color: `rgba(255,255,255,${dragging ? 0.6 : 0.3})`,
                      opacity: show ? 1 : 0,
                      transition: 'opacity .22s',
                    }}
                  >
                    drag_indicator
                  </span>
                  <div
                    onClick={() => switchPage(p.id)}
                    onDoubleClick={() => renamePage(p.id, p.name)}
                    title="Double-click to rename"
                    style={{
                      borderRadius: 10,
                      padding: '7px 13px',
                      fontSize: 'clamp(11px,1.4vh,13px)',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      transition: 'background .12s, border-color .12s',
                      border: '1.5px solid ' + (on ? 'rgba(120,170,255,.95)' : 'transparent'),
                      background: on ? 'rgba(255,255,255,.1)' : 'transparent',
                      fontWeight: on ? 600 : 500,
                      color: on ? '#fff' : 'rgba(255,255,255,.6)',
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      deletePage(p.id)
                    }}
                    title="Delete page"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: show && s.pages.length > 1 ? 'flex' : 'none',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'Material Symbols Rounded',
                      fontSize: 14,
                      lineHeight: 1,
                      cursor: 'pointer',
                      background: 'rgba(200,70,60,.32)',
                      color: 'rgba(255,190,185,.95)',
                    }}
                  >
                    close
                  </div>
                </div>
              )
            })}
            <Box
              onClick={addPage}
              title="New page — starts empty"
              sx="border-radius:9px; padding:7px 13px; font-size:clamp(11px,1.4vh,13px); font-weight:500; color:rgba(255,255,255,.55); cursor:pointer; white-space:nowrap;"
              hover="background:rgba(255,255,255,.07); color:rgba(255,255,255,.9)"
            >
              + Page
            </Box>
          </div>

          {/* Search */}
          <div style={css('min-width:0; display:flex; justify-content:center;')}>
            <div data-tour="search" style={css('position:relative; width:min(420px,31vw); min-width:280px;')}>
              <div
                style={css(
                  'height:clamp(42px,5.2vh,50px); background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:999px; display:flex; align-items:center; padding:0 8px 0 16px; gap:9px;',
                )}
              >
                <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:19px; color:rgba(255,255,255,.5);")}>
                  search
                </span>
                <input
                  ref={searchRef}
                  value={s.query}
                  onChange={(e) => set({ query: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && s.query.trim()) open(ENGINES[s.engine] + encodeURIComponent(s.query))
                  }}
                  onFocus={() => set({ searchFocus: true, appsOpen: false })}
                  onBlur={() => set({ searchFocus: false })}
                  placeholder="Search Google or type a URL"
                  style={css('flex:1; min-width:0; border:0; background:transparent; color:#fff; font-size:clamp(12px,1.6vh,14px); font-weight:500;')}
                />
                <Box
                  onClick={() => set({ enginesOpen: !s.enginesOpen })}
                  sx="display:flex; align-items:center; gap:4px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.16); border-radius:999px; padding:6px 8px; font-size:clamp(10px,1.3vh,12px); font-weight:600; color:rgba(255,255,255,.8); cursor:pointer; white-space:nowrap;"
                  hover="background:rgba(255,255,255,.14)"
                >
                  {s.engine}{' '}
                  <span style={css("font-family:'Material Symbols Rounded'; line-height:1; opacity:.55; font-size:15px;")}>expand_more</span>
                </Box>
              </div>

              {hasSuggest && (
                <div
                  style={css(
                      'position:absolute; left:0; right:0; top:calc(100% + 8px); background:rgba(42,42,42,.97); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,.12); border-radius:24px; box-shadow:0 18px 46px rgba(0,0,0,.5); overflow:hidden; z-index:19; padding:8px; animation:rise .12s ease-out;',
                  )}
                >
                  {suggestions.map((sg, i) => (
                    <Box
                      key={i}
                      onMouseDown={sg.onPick}
                      sx="display:flex; align-items:center; gap:11px; padding:10px 12px; border-radius:16px; cursor:pointer;"
                      hover="background:rgba(255,255,255,.09)"
                    >
                      <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(255,255,255,.42); flex-shrink:0;")}>
                        {sg.icon}
                      </span>
                      <span
                        style={css(
                          'flex:1; min-width:0; font-size:12.5px; font-weight:500; color:rgba(255,255,255,.88); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;',
                        )}
                      >
                        {sg.label}
                      </span>
                      <span style={css('font-size:10px; font-weight:500; color:rgba(255,255,255,.32); flex-shrink:0;')}>{sg.kind}</span>
                    </Box>
                  ))}
                </div>
              )}

              {s.enginesOpen && (
                <div
                  style={css(
                    'position:absolute; right:0; top:calc(100% + 8px); width:190px; background:rgba(18,23,32,.82); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,.12); border-radius:13px; box-shadow:0 16px 44px rgba(0,0,0,.45); overflow:hidden; z-index:20; padding:5px; animation:rise .13s ease-out;',
                  )}
                >
                  {(Object.keys(ENGINES) as (keyof typeof ENGINES)[]).map((name) => (
                    <Box
                      key={name}
                      onClick={() => set({ engine: name, enginesOpen: false })}
                      sx="padding:9px 12px; border-radius:9px; font-size:12.5px; font-weight:500; color:rgba(255,255,255,.8); cursor:pointer;"
                      hover="background:rgba(255,255,255,.09)"
                    >
                      {name}
                    </Box>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Right cluster */}
          <div data-tour="toolbar" style={css('justify-self:end; display:flex; align-items:center; gap:8px; flex-shrink:0;')}>
            <Clock h24={s.h24} />
            {s.gappsOn && (
            <div style={css('position:relative;')}>
              <Box
                onClick={() => set({ appsOpen: !s.appsOpen, enginesOpen: false, gappsEdit: false })}
                title="Google apps"
                sx="width:clamp(34px,4.4vh,40px); height:clamp(34px,4.4vh,40px); background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:12px; display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:20px; color:rgba(255,255,255,.6); cursor:pointer;"
                hover="background:rgba(255,255,255,.12); color:#fff"
              >
                apps
              </Box>
              {s.appsOpen && (
                <div
                  style={css(
                    'position:absolute; right:0; top:calc(100% + 8px); width:300px; background:rgba(16,21,30,.94); backdrop-filter:blur(18px); border:1px solid rgba(255,255,255,.12); border-radius:16px; box-shadow:0 20px 52px rgba(0,0,0,.5); padding:14px; z-index:22; animation:rise .13s ease-out;',
                  )}
                >
                  <div style={css('display:flex; align-items:center; justify-content:space-between; padding:0 2px 11px;')}>
                    <span style={css('font-size:9.5px; font-weight:700; letter-spacing:.18em; color:rgba(255,255,255,.4);')}>
                      {s.gappsEdit ? 'CUSTOMISE APPS' : 'GOOGLE APPS'}
                    </span>
                    <Box
                      onClick={() => set({ gappsEdit: !s.gappsEdit })}
                      title="Customise"
                      sx="width:24px; height:24px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:15px; color:rgba(255,255,255,.55); cursor:pointer;"
                      hover="background:rgba(255,255,255,.1); color:#fff"
                    >
                      {s.gappsEdit ? 'check' : 'edit'}
                    </Box>
                  </div>

                  {!s.gappsEdit ? (
                    <>
                      <div style={css('display:grid; grid-template-columns:repeat(3,1fr); gap:3px;')}>
                        {s.gapps.map((key) => {
                          const a = gappByKey(key)
                          if (!a) return null
                          return (
                            <Box
                              key={key}
                              onClick={() => {
                                open(a.url)
                                set({ appsOpen: false })
                              }}
                              sx="display:flex; flex-direction:column; align-items:center; gap:7px; padding:11px 4px; border-radius:12px; cursor:pointer;"
                              hover="background:rgba(255,255,255,.09)"
                            >
                              <GappIcon appKey={a.key} glyph={a.glyph} tint={a.c} size={34} radius={9} />
                              <span style={css('font-size:10.5px; font-weight:500; color:rgba(255,255,255,.72); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;')}>
                                {a.name}
                              </span>
                            </Box>
                          )
                        })}
                      </div>
                      <Box
                        onClick={() => {
                          open('https://about.google/products/')
                          set({ appsOpen: false })
                        }}
                        sx="margin-top:10px; text-align:center; border:1px solid rgba(255,255,255,.16); border-radius:999px; padding:8px; font-size:11.5px; font-weight:600; color:rgba(130,175,255,.98); cursor:pointer;"
                        hover="background:rgba(255,255,255,.07)"
                      >
                        More from Google
                      </Box>
                    </>
                  ) : (
                    <>
                      <div style={css('font-size:10.5px; color:rgba(255,255,255,.4); padding:0 2px 8px; line-height:1.5;')}>
                        Tap an app to add or remove it from the grid.
                      </div>
                      <div style={css('max-height:44vh; overflow-y:auto; display:flex; flex-direction:column; gap:2px;')}>
                        {GAPP_CATALOG.map((a) => {
                          const on = s.gapps.includes(a.key)
                          return (
                            <Box
                              key={a.key}
                              onClick={() =>
                                set((st) => ({
                                  gapps: on ? st.gapps.filter((k) => k !== a.key) : [...st.gapps, a.key],
                                }))
                              }
                              sx="display:flex; align-items:center; gap:11px; padding:8px 9px; border-radius:10px; cursor:pointer;"
                              hover="background:rgba(255,255,255,.07)"
                            >
                              <GappIcon appKey={a.key} glyph={a.glyph} tint={a.c} size={24} radius={7} />
                              <span style={css('flex:1; min-width:0; font-size:12.5px; font-weight:500; color:rgba(255,255,255,.85); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}>
                                {a.name}
                              </span>
                              <span
                                style={{
                                  fontFamily: 'Material Symbols Rounded',
                                  fontSize: 18,
                                  lineHeight: 1,
                                  color: on ? 'rgba(76,141,255,.95)' : 'rgba(255,255,255,.3)',
                                }}
                              >
                                {on ? 'check_circle' : 'add_circle'}
                              </span>
                            </Box>
                          )
                        })}
                      </div>
                      <div style={css('display:flex; align-items:center; justify-content:space-between; border-top:1px solid rgba(255,255,255,.09); margin-top:9px; padding-top:9px;')}>
                        <Box
                          onClick={() => set({ gapps: [...DEFAULT_GAPPS] })}
                          sx="font-size:11px; font-weight:600; color:rgba(255,255,255,.5); cursor:pointer;"
                          hover="color:#fff"
                        >
                          Reset to default
                        </Box>
                        <span style={css('font-size:10.5px; color:rgba(255,255,255,.35);')}>{s.gapps.length} shown</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            )}
            <Box
              as="label"
              title="Change background image or GIF"
              sx="position:relative; width:clamp(34px,4.4vh,40px); height:clamp(34px,4.4vh,40px); background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:14px; color:rgba(255,255,255,.6); cursor:pointer; overflow:hidden; font-family:'Material Symbols Rounded'; line-height:1;"
              hover="background:rgba(255,255,255,.12); color:#fff"
            >
              wallpaper
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/*"
                onChange={onBgFile}
                style={css('position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; border:0; background:transparent; padding:0;')}
              />
            </Box>
            <Box
              onClick={() => openModal('settings')}
              title="Appearance"
              sx="width:clamp(34px,4.4vh,40px); height:clamp(34px,4.4vh,40px); background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:14px; color:rgba(255,255,255,.6); cursor:pointer; font-family:'Material Symbols Rounded'; line-height:1;"
              hover="background:rgba(255,255,255,.12); color:#fff"
            >
              tune
            </Box>
          </div>
        </div>

        <div
          style={css(
            'text-align:center; font-size:10.5px; font-weight:600; letter-spacing:.24em; color:rgba(255,255,255,.34); flex-shrink:0;',
          )}
        >
          {(s.pages.find((p) => p.id === s.activePage)?.name || 'HOME').toUpperCase()}
        </div>

        {showBackupNudge && (
          <div
            style={css(
              'flex-shrink:0; display:flex; align-items:center; gap:12px; background:rgba(251,191,36,.1); border:1px solid rgba(251,191,36,.3); border-radius:12px; padding:9px 14px;',
            )}
          >
            <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(253,214,110,.95); flex-shrink:0;")}>
              cloud_off
            </span>
            <span style={css('flex:1; min-width:0; font-size:11.5px; color:rgba(255,255,255,.8); line-height:1.5;')}>
              {backupAge === null
                ? 'Your Locus data has never been backed up. Removing the extension or resetting your profile deletes it for good.'
                : `Last backup was ${backupAge} days ago. A copy in your Downloads folder survives an uninstall.`}
            </span>
            <Box
              onClick={() => void runBackup(false)}
              sx="flex-shrink:0; background:rgba(251,191,36,.22); border:1px solid rgba(251,191,36,.4); border-radius:9px; padding:6px 13px; font-size:11.5px; font-weight:600; color:rgba(255,231,168,.98); cursor:pointer; white-space:nowrap;"
              hover="background:rgba(251,191,36,.34)"
            >
              Back up now
            </Box>
            <Box
              onClick={() => set({ backupNudge: true })}
              title="Dismiss"
              sx="flex-shrink:0; font-family:'Material Symbols Rounded'; line-height:1; font-size:16px; color:rgba(255,255,255,.4); cursor:pointer;"
              hover="color:#fff"
            >
              close
            </Box>
          </div>
        )}

        {/* Body grid */}
        <div
          className="dashboard-grid"
          style={css(
            'flex:1; min-height:0; display:grid; grid-template-columns:minmax(235px,.82fr) minmax(0,1.8fr) minmax(235px,.82fr); gap:clamp(12px,1.4vw,24px);',
          )}
        >
          {/* Left rail */}
          <div className="dashboard-left" style={css('display:flex; flex-direction:column; gap:clamp(10px,1.2vh,16px); min-height:0;')}>
            <div
              data-tour="notes"
              style={css(
                'flex: 0 0 ' + s.notesPanelHeight + '%; min-height: 0; background: rgba(9,13,20,.34); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.1); border-radius: 18px; box-shadow: 0 8px 30px rgba(0,0,0,.26); padding: clamp(12px,1.6vh,16px); display: flex; flex-direction: column; gap: 10px; overflow: hidden',
              )}
            >
              <div style={css('display:flex; align-items:center; justify-content:space-between; flex-shrink:0;')}>
                <div style={css('display:flex; align-items:center; gap:8px;')}>
                  <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(255,255,255,.5);")}>
                    sticky_note_2
                  </span>
                  <span style={css('font-size:clamp(12px,1.6vh,14px); font-weight:600;')}>Quick Notes</span>
                </div>
                <div style={css('display:flex; align-items:center; gap:7px;')}>
                  <input
                    type="range"
                    min="28"
                    max="72"
                    step="2"
                    value={s.notesPanelHeight}
                    aria-label="Quick Notes panel size"
                    title="Resize Quick Notes"
                    onChange={(e) => set({ notesPanelHeight: Number(e.target.value) })}
                    style={css('width:58px; height:12px; accent-color:#6ea0ff; cursor:ew-resize;')}
                  />
                  <Box
                    onClick={newNote}
                    title="New note (n)"
                    aria-label="New note"
                    sx="width:22px; height:22px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:14px; color:rgba(255,255,255,.5); cursor:pointer;"
                    hover="background:rgba(255,255,255,.1); color:#fff"
                  >
                    +
                  </Box>
                </div>
              </div>
              <div style={css('flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:4px;')}>
                {s.notes.map((n) => (
                  <Box
                    key={n.id}
                    onClick={() => set({ modal: 'note', activeNote: n.id })}
                    sx="display:flex; align-items:center; gap:9px; border-radius:10px; padding:9px 10px; cursor:pointer; min-width:0; flex-shrink:0;"
                    hover="background:rgba(255,255,255,.08)"
                  >
                    <div style={css('width:5px; height:5px; border-radius:50%; background:rgba(255,255,255,.35); flex-shrink:0;')} />
                    <span
                      style={css(
                        'flex:1; min-width:0; font-size:clamp(11px,1.45vh,13px); font-weight:500; color:rgba(255,255,255,.82); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;',
                      )}
                    >
                      {noteTitle(n)}
                    </span>
                  </Box>
                ))}
                {s.notes.length === 0 && (
                  <Box
                    onClick={newNote}
                    sx="border:1px dashed rgba(255,255,255,.16); border-radius:11px; padding:14px 12px; text-align:center; cursor:pointer;"
                    hover="background:rgba(255,255,255,.05); border-color:rgba(255,255,255,.28)"
                  >
                    <div style={css('font-size:11.5px; font-weight:600; color:rgba(255,255,255,.7);')}>Write your first note</div>
                    <div style={css('font-size:10.5px; color:rgba(255,255,255,.35); margin-top:4px; line-height:1.5;')}>
                      Tap + or press <b style={css('color:rgba(255,255,255,.6);')}>n</b> anywhere.
                    </div>
                  </Box>
                )}
              </div>
            </div>

            <TodoCard
              s={s}
              set={set}
              todayIso={todayIso}
              onToggle={toggleTask}
              onDelete={(x) => withUndo('Task deleted', ['tasks'], (st) => ({ tasks: st.tasks.filter((y) => y.id !== x.id) }))}
              onNew={newTask}
              onEdit={editTask}
            />

          </div>

          {/* Boards */}
          <div className="dashboard-boards" data-tour="boards" style={css('display:flex; flex-direction:column; gap:clamp(8px,1.1vh,13px); min-width:0; min-height:0;')}>
            <div style={css('display:flex; align-items:center; gap:12px; flex-shrink:0;')}>
              <span style={css('font-size:10.5px; font-weight:600; letter-spacing:.22em; color:rgba(255,255,255,.4);')}>BOARDS</span>
              <Box
                onClick={() => openModal('board', { dBoardName: '', bmReturn: false })}
                sx="display:flex; align-items:center; gap:6px; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:11px; padding:6px 13px; font-size:12px; font-weight:600; color:rgba(255,255,255,.85); cursor:pointer; white-space:nowrap;"
                hover="background:rgba(255,255,255,.13)"
              >
                + Add board
              </Box>
              <span style={css('font-size:11px; color:rgba(255,255,255,.3); margin-left:auto;')}>
                {pageBoards.length + ' boards · ' + bmCount + ' bookmarks'}
              </span>
            </div>
            {orderedBoards.length === 0 ? (
              <div style={css('flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:8px;')}>
                <div
                  style={css(
                    'width:100%; max-width:460px; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px dashed rgba(255,255,255,.2); border-radius:18px; padding:clamp(20px,3vh,30px); display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center;',
                  )}
                >
                  <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:34px; color:rgba(255,255,255,.28);")}>
                    bookmarks
                  </span>
                  <div style={css('font-size:15px; font-weight:700; color:rgba(255,255,255,.92);')}>
                    {s.pages.length > 1 ? 'No boards on this page yet' : 'Start with your first board'}
                  </div>
                  <div style={css('font-size:12px; color:rgba(255,255,255,.45); line-height:1.7; max-width:360px;')}>
                    Boards are folders of links. They sync both ways with your Chrome bookmarks, so anything you add
                    here shows up in the bookmark bar too.
                  </div>
                  <div style={css('display:flex; gap:9px; flex-wrap:wrap; justify-content:center; margin-top:2px;')}>
                    <Box
                      onClick={() => openModal('board', { dBoardName: '', bmReturn: false })}
                      sx="background:rgba(76,141,255,.95); border-radius:11px; padding:10px 18px; font-size:12.5px; font-weight:600; cursor:pointer;"
                      hover="background:rgba(96,157,255,1)"
                    >
                      + Create a board
                    </Box>
                    <Box
                      onClick={() => openModal('import', { importPreview: false, importError: '' })}
                      sx="border:1px solid rgba(255,255,255,.18); border-radius:11px; padding:10px 18px; font-size:12.5px; font-weight:600; color:rgba(255,255,255,.8); cursor:pointer;"
                      hover="background:rgba(255,255,255,.08)"
                    >
                      Import bookmarks
                    </Box>
                  </div>

                  {s.topSites.length > 0 && (
                    <div style={css('width:100%; border-top:1px solid rgba(255,255,255,.09); margin-top:6px; padding-top:14px; display:flex; flex-direction:column; gap:10px;')}>
                      <div style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.4);')}>
                        OR PICK FROM YOUR MOST-VISITED
                      </div>
                      <div style={css('display:flex; flex-wrap:wrap; gap:6px; justify-content:center;')}>
                        {s.topSites.slice(0, 8).map((site) => {
                          const on = pickedSites.includes(site.url)
                          return (
                            <Box
                              key={site.url}
                              onClick={() =>
                                setPickedSites((prev) =>
                                  prev.includes(site.url) ? prev.filter((u) => u !== site.url) : [...prev, site.url],
                                )
                              }
                              sx={
                                'display:flex; align-items:center; gap:6px; border-radius:9px; padding:6px 10px; font-size:11.5px; font-weight:500; cursor:pointer; max-width:150px; border:1px solid ' +
                                (on ? 'rgba(76,141,255,.7)' : 'rgba(255,255,255,.12)') +
                                '; background:' +
                                (on ? 'rgba(76,141,255,.18)' : 'rgba(255,255,255,.04)') +
                                '; color:' +
                                (on ? '#fff' : 'rgba(255,255,255,.7)') +
                                ';'
                              }
                              hover="background:rgba(255,255,255,.1)"
                            >
                              <Favicon
                                url={site.url}
                                title={site.title}
                                sx="width:15px;height:15px;border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;background:rgba(255,255,255,.14);color:rgba(255,255,255,.85);"
                              />
                              <span style={css('min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}>
                                {site.title || site.url}
                              </span>
                            </Box>
                          )
                        })}
                      </div>
                      <Box
                        onClick={() => void addPickedSites()}
                        sx={
                          'align-self:center; border-radius:10px; padding:9px 16px; font-size:12px; font-weight:600; cursor:pointer; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); color:rgba(255,255,255,' +
                          (pickedSites.length ? '.92' : '.35') +
                          ');'
                        }
                        hover={pickedSites.length ? 'background:rgba(255,255,255,.15)' : ''}
                      >
                        {pickedSites.length
                          ? `Add ${pickedSites.length} to a "Quick links" board`
                          : 'Select a few sites to add'}
                      </Box>
                    </div>
                  )}
                </div>
              </div>
            ) : (
            <div
              style={css(
                'flex:1; min-height:0; overflow-y:auto; overflow-x:auto; padding-right:6px; display:grid; grid-template-columns:repeat(2,minmax(220px,1fr)); gap:clamp(12px,1.3vw,20px); align-content:start;',
              )}
            >
              {orderedBoards.map((b, i) => {
                const dragging = s.dragBoard === b.id
                const over = s.dragOverBoard === b.id && s.dragBoard !== b.id
                const canDrag = b.id !== '1'
                return (
                <div
                  key={b.id}
                  onDragOver={(e) => {
                    if (!s.dragBoard || s.dragBoard === b.id) return
                    e.preventDefault()
                    if (s.dragOverBoard !== b.id) set({ dragOverBoard: b.id })
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (s.dragBoard && s.dragBoard !== b.id) reorderBoards(s.dragBoard, b.id)
                    else set({ dragBoard: null, dragOverBoard: null })
                  }}
                  style={{
                    ...css(
                      'height:clamp(178px,23vh,228px); background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:18px; box-shadow:0 8px 32px rgba(0,0,0,.3); padding:clamp(11px,1.5vh,15px); display:flex; flex-direction:column; gap:8px; min-width:0;',
                    ),
                    opacity: dragging ? 0.45 : 1,
                    outline: over ? '2px dashed rgba(130,175,255,.8)' : 'none',
                    outlineOffset: over ? '3px' : '0',
                    transition: 'opacity .15s, outline-color .15s',
                  }}
                >
                  <div style={css('display:flex; align-items:center; gap:8px; flex-shrink:0; min-width:0;')}>
                    <span
                      draggable={canDrag}
                      onDragStart={(e) => {
                        if (!canDrag) return
                        e.dataTransfer.effectAllowed = 'move'
                        set({ dragBoard: b.id })
                      }}
                      onDragEnd={() => set({ dragBoard: null, dragOverBoard: null, dragOverPage: null })}
                      title={canDrag ? 'Drag to reorder' : ''}
                      style={css(
                        "font-family:'Material Symbols Rounded'; line-height:1; font-size:16px; color:rgba(255,255,255," +
                          (canDrag ? (dragging ? '.6' : '.28') : '.12') +
                          '); cursor:' +
                          (canDrag ? 'grab' : 'default') +
                          ';',
                      )}
                    >
                      drag_indicator
                    </span>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dotFor(b.id, i) }} />
                    <div
                      style={css(
                        'flex:1; min-width:0; font-size:clamp(11.5px,1.5vh,13.5px); font-weight:600; color:rgba(255,255,255,.92); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;',
                      )}
                    >
                      {b.name}
                    </div>
                    <div
                      style={css(
                        'font-size:10px; font-weight:600; color:rgba(255,255,255,.45); background:rgba(255,255,255,.08); border-radius:6px; padding:2px 7px; flex-shrink:0;',
                      )}
                    >
                      {b.bookmarks.length}
                    </div>
                    {b.id !== '1' && (
                      <div style={css('position:relative; flex-shrink:0;')}>
                        <Box
                          onClick={() => setBoardActionMenu(boardActionMenu === b.id ? null : b.id)}
                          title="Edit board"
                          aria-label={`Edit ${b.name}`}
                          sx="font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(255,255,255,.32); cursor:pointer;"
                          hover="color:rgba(150,185,255,.95)"
                        >
                          more_vert
                        </Box>
                        {boardActionMenu === b.id && (
                          <div
                            style={css(
                              'position:absolute; right:0; top:24px; z-index:30; background:rgba(20,25,34,.99); border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:5px; min-width:120px; box-shadow:0 14px 40px rgba(0,0,0,.5);',
                            )}
                          >
                            <Box
                              onClick={() => {
                                setBoardActionMenu(null)
                                setEditingBoardId(b.id)
                                openModal('board', { dBoardName: b.name, bmReturn: false })
                              }}
                              sx="display:flex; align-items:center; gap:7px; border-radius:7px; padding:8px; font-size:12px; color:rgba(255,255,255,.82); cursor:pointer;"
                              hover="background:rgba(255,255,255,.08)"
                            >
                              <span style={css("font-family:'Material Symbols Rounded'; font-size:14px; line-height:1;")}>edit</span>
                              Rename
                            </Box>
                            <Box
                              onClick={() => {
                                setBoardActionMenu(null)
                                deleteBoard(b.id)
                              }}
                              sx="display:flex; align-items:center; gap:7px; border-radius:7px; padding:8px; font-size:12px; color:rgba(255,150,140,.9); cursor:pointer;"
                              hover="background:rgba(255,255,255,.08)"
                            >
                              <span style={css("font-family:'Material Symbols Rounded'; font-size:14px; line-height:1;")}>delete_outline</span>
                              Delete
                            </Box>
                          </div>
                        )}
                      </div>
                    )}
                    {s.pages.length > 1 && (
                      <div style={css('position:relative; flex-shrink:0;')}>
                        <Box
                          onClick={() => setBoardMenu(boardMenu === b.id ? null : b.id)}
                          title="Move board to another page"
                          sx="font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(255,255,255,.32); cursor:pointer;"
                          hover="color:rgba(150,185,255,.95)"
                        >
                          drive_file_move
                        </Box>
                        {boardMenu === b.id && (
                          <div
                            style={css(
                              'position:absolute; right:0; top:24px; z-index:20; background:rgba(20,25,34,.99); border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:5px; min-width:130px; box-shadow:0 14px 40px rgba(0,0,0,.5);',
                            )}
                          >
                            <div style={css('font-size:9.5px; font-weight:700; letter-spacing:.1em; color:rgba(255,255,255,.35); padding:5px 8px 4px;')}>
                              MOVE TO PAGE
                            </div>
                            {s.pages.map((pg) => {
                              const here = (s.boardPage[b.id] ?? s.activePage) === pg.id
                              return (
                                <Box
                                  key={pg.id}
                                  onClick={() => {
                                    if (!here) assignBoard(b.id, pg.id)
                                    setBoardMenu(null)
                                  }}
                                  sx={
                                    'display:flex; align-items:center; gap:7px; border-radius:7px; padding:7px 8px; font-size:12px; cursor:pointer; color:' +
                                    (here ? 'rgba(150,185,255,.95)' : 'rgba(255,255,255,.8)') +
                                    ';'
                                  }
                                  hover="background:rgba(255,255,255,.08)"
                                >
                                  <span style={css("font-family:'Material Symbols Rounded'; font-size:14px; line-height:1; opacity:" + (here ? '1' : '0') + ';')}>
                                    check
                                  </span>
                                  {pg.name}
                                </Box>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={css('flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:1px; padding-right:2px;')}>
                    {b.bookmarks.map((bm) => (
                      <BmRow
                        key={bm.id}
                        bm={bm}
                        canDrag={b.bookmarks.length > 1}
                        dragging={s.dragBm === bm.id}
                        over={s.dragOverBm === bm.id && s.dragBm !== bm.id}
                        onOpen={() => open(bm.url)}
                        onEdit={() => openBookmarkEdit(b.id, bm)}
                        onDelete={() => deleteBookmark(b.id, bm.id)}
                        onDragStart={() => set({ dragBm: bm.id })}
                        onDragOver={() => {
                          if (s.dragBm && s.dragBm !== bm.id && s.dragOverBm !== bm.id) set({ dragOverBm: bm.id })
                        }}
                        onDrop={() => {
                          if (s.dragBm && s.dragBm !== bm.id) reorderBookmark(b.id, s.dragBm, bm.id)
                          else set({ dragBm: null, dragOverBm: null })
                        }}
                        onDragEnd={() => set({ dragBm: null, dragOverBm: null })}
                      />
                    ))}
                  </div>
                  <Box
                    onClick={() => openModal('bookmark', { dBmBoard: b.id, dBmName: '', dBmUrl: '', dBmId: '', dBmOrigBoard: '' })}
                    sx="flex-shrink:0; display:flex; align-items:center; gap:7px; font-size:11.5px; font-weight:500; color:rgba(255,255,255,.4); cursor:pointer; padding:2px 8px;"
                    hover="color:rgba(255,255,255,.8)"
                  >
                    + Add bookmark
                  </Box>
                </div>
                )
              })}
            </div>
            )}
          </div>

          {/* Right rail */}
          <div
            className="dashboard-right"
            style={css(
              'height:100%; min-height:0; overflow-y:auto; overflow-x:hidden; display:flex; flex-direction:column; gap:clamp(10px,1.2vh,16px);',
            )}
          >
            <div
              data-tour="calendar"
              style={css(
                'flex-shrink:0; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:18px; box-shadow:0 8px 32px rgba(0,0,0,.3); padding:clamp(11px,1.5vh,16px);',
              )}
            >
              <div style={css('display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;')}>
                <Box
                  onClick={() => set({ monthOffset: s.monthOffset - 1 })}
                  sx="width:22px; height:22px; border-radius:7px; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.5); cursor:pointer;"
                  hover="background:rgba(255,255,255,.1); color:#fff"
                >
                  <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px;")}>chevron_left</span>
                </Box>
                <div style={css('font-size:clamp(11.5px,1.5vh,13.5px); font-weight:600;')}>
                  {base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </div>
                <div style={css('display:flex; align-items:center; gap:2px;')}>
                  <Box
                    onClick={() => set({ monthOffset: s.monthOffset + 1 })}
                    sx="width:22px; height:22px; border-radius:7px; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.5); cursor:pointer;"
                    hover="background:rgba(255,255,255,.1); color:#fff"
                  >
                    <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px;")}>chevron_right</span>
                  </Box>
                </div>
              </div>
              <div style={css('display:grid; grid-template-columns:repeat(7,1fr); gap:2px;')}>
                {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map((w) => (
                  <div key={w} style={css('font-size:8.5px; font-weight:600; letter-spacing:.08em; color:rgba(255,255,255,.3); text-align:center; padding-bottom:4px;')}>
                    {w}
                  </div>
                ))}
                {calDays.map((d, i) => (
                  <div
                    key={i}
                    onClick={
                      d.dayIso
                        ? () => set({ dateOpen: d.dayIso, dnOpen: null, dnFormOpen: false, dnEditing: null, dnTitle: '', dnDesc: '', dnCat: 'Personal' })
                        : undefined
                    }
                    style={{
                      fontSize: 'clamp(9.5px,1.25vh,11.5px)',
                      textAlign: 'center',
                      padding: '5px 0',
                      borderRadius: 8,
                      fontVariantNumeric: 'tabular-nums',
                      position: 'relative',
                      cursor: d.dayIso ? 'pointer' : 'default',
                      background: d.today ? '#4c8dff' : 'transparent',
                      color: d.today ? '#fff' : 'rgba(255,255,255,.62)',
                      fontWeight: d.today ? 700 : 500,
                    }}
                  >
                    {d.label}
                    {(['habit', 'task', 'note'] as const).some((k) => d.marks[k]) && (
                      <div style={css('position:absolute; left:0; right:0; bottom:2px; display:flex; gap:2px; justify-content:center;')}>
                        {(['habit', 'task', 'note'] as const)
                          .filter((k) => d.marks[k])
                          .map((k) => (
                            <span
                              key={k}
                              style={{
                                width: 3,
                                height: 3,
                                borderRadius: '50%',
                                background: d.today ? '#fff' : MARK_COLORS[k],
                              }}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div
              aria-label="Habits summary"
              style={css(
                'flex:0 0 auto; min-height:0; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:18px; box-shadow:0 8px 32px rgba(0,0,0,.3); padding:clamp(11px,1.5vh,16px); display:flex; flex-direction:column; gap:10px;',
              )}
            >
              <div style={css('display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-shrink:0;')}>
                <div style={css('display:flex; align-items:center; gap:10px; min-width:0;')}>
                  <Box
                    onClick={() => openModal('habits')}
                    title="Open full habit history"
                    aria-label="Open full habit history"
                    sx="width:24px; height:24px; border-radius:7px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-family:'Material Symbols Rounded'; line-height:1; font-size:19px; color:rgba(255,255,255,.52); cursor:pointer;"
                    hover="background:rgba(255,255,255,.1); color:#fff"
                  >
                    repeat
                  </Box>
                  <div style={css('display:flex; flex-direction:column; gap:2px; min-width:0;')}>
                    <span style={css('font-size:clamp(12px,1.6vh,14px); font-weight:600;')}>Habits</span>
                    <span style={css('font-size:10px; color:rgba(255,255,255,.4);')}>Small steps. Big changes.</span>
                  </div>
                </div>
                <div style={css('display:flex; align-items:center; gap:2px; flex-shrink:0; background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.08); border-radius:9px; padding:2px;')}>
                  <Box
                    onClick={() => setHabitWeekOffset((offset) => offset - 1)}
                    aria-label="Previous habit week"
                    sx="width:21px; height:21px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:15px; color:rgba(255,255,255,.42); cursor:pointer;"
                    hover="background:rgba(255,255,255,.1); color:#fff"
                  >
                    chevron_left
                  </Box>
                  <span style={css('min-width:58px; text-align:center; font-size:9.5px; font-weight:600; color:rgba(255,255,255,.52);')}>{weekLabel}</span>
                  <Box
                    onClick={() => setHabitWeekOffset((offset) => offset + 1)}
                    aria-label="Next habit week"
                    sx="width:21px; height:21px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:15px; color:rgba(255,255,255,.42); cursor:pointer;"
                    hover="background:rgba(255,255,255,.1); color:#fff"
                  >
                    chevron_right
                  </Box>
                </div>
              </div>

              {s.habits.length > 0 ? (
                <div style={css('display:flex; flex-direction:column; gap:6px; overflow-x:auto; padding-bottom:2px;')}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(80px,1fr) repeat(7,18px)', gap: 5, alignItems: 'center' }}>
                    <div />
                    {weekDays.map((day) => (
                      <div key={day.iso} style={{ textAlign: 'center', fontSize: 8.5, lineHeight: 1.2, color: day.isToday ? 'rgba(130,175,255,.98)' : 'rgba(255,255,255,.34)', fontWeight: day.isToday ? 700 : 600 }}>
                        <div style={{ textTransform: 'uppercase' }}>{day.label}</div>
                        <div style={{ marginTop: 2, fontSize: 8, color: day.isToday ? 'rgba(130,175,255,.9)' : 'rgba(255,255,255,.24)' }}>{day.day}</div>
                      </div>
                    ))}
                  </div>
                  <div style={css('display:flex; flex-direction:column; gap:6px; max-height:156px; overflow-y:auto;')}>
                    {s.habits.map((h) => (
                      <div key={h.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px,1fr) repeat(7,18px)', gap: 5, alignItems: 'center', padding: '2px 0' }}>
                        <div style={css('min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10.5px; color:rgba(255,255,255,.78); background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.07); border-radius:8px; padding:7px 8px;')} title={h.name}>
                          {h.name}
                        </div>
                        {weekDays.map((day) => {
                          const done = h.done.includes(day.iso)
                          return (
                            <Box
                              key={day.iso}
                              onClick={() => !day.future && toggleHabitDay(h.id, day.iso)}
                              aria-label={`${done ? 'Unmark' : 'Mark'} ${h.name} ${day.iso}`}
                              title={day.iso}
                              sx={
                                "width:18px; height:18px; border-radius:5px; display:flex; align-items:center; justify-content:center; box-sizing:border-box; font-family:'Material Symbols Rounded'; line-height:1; font-size:10px; cursor:" +
                                (day.future ? 'default' : 'pointer') +
                                '; ' +
                                (done
                                  ? 'background:rgba(76,141,255,.9); border:1px solid rgba(130,175,255,.95); color:#fff;'
                                  : 'background:' + (day.isToday ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.025)') + '; border:1px solid ' + (day.isToday ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.14)') + '; color:transparent;') +
                                (day.isToday ? 'box-shadow:0 -4px 0 rgba(255,255,255,.055), 0 4px 0 rgba(255,255,255,.055);' : '')
                              }
                            >
                              check
                            </Box>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <Box
                  onClick={() => openModal('habits')}
                  sx="border:1px dashed rgba(255,255,255,.14); border-radius:10px; padding:12px; text-align:center; font-size:11px; color:rgba(255,255,255,.38); cursor:pointer;"
                  hover="background:rgba(255,255,255,.05); border-color:rgba(255,255,255,.28)"
                >
                  Add your first habit
                </Box>
              )}
            </div>

            <div
              aria-label="Pomodoro timer"
              style={css(
                'flex:1 1 0; min-height:190px; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:18px; box-shadow:0 8px 32px rgba(0,0,0,.3); padding:clamp(12px,1.5vh,16px); display:flex; flex-direction:column; gap:12px;',
              )}
            >
              <div style={css('display:flex; align-items:center; gap:8px; flex-shrink:0;')}>
                <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(255,255,255,.5);")}>timer</span>
                <span style={css('font-size:clamp(12px,1.6vh,14px); font-weight:600;')}>Pomodoro</span>
                <span
                  style={css(
                    'margin-left:auto; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:' +
                      (pomodoro.mode === 'work' ? 'rgba(130,175,255,.95)' : 'rgba(93,202,165,.95)') +
                      ';',
                  )}
                >
                  {pomodoro.mode}
                </span>
                <Box
                  onClick={() => setPomodoroSettingsOpen((open) => !open)}
                  aria-label="Pomodoro settings"
                  title="Pomodoro settings"
                  sx="width:22px; height:22px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:15px; color:rgba(255,255,255,.4); cursor:pointer;"
                  hover="background:rgba(255,255,255,.1); color:#fff"
                >
                  tune
                </Box>
              </div>

              <div style={css('display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; flex:1; min-height:0;')}>
                <div style={css('font-size:clamp(30px,4.6vh,46px); font-weight:700; font-variant-numeric:tabular-nums; letter-spacing:.04em; color:rgba(255,255,255,.94);')}>
                  {formatPomodoro(pomodoro.secondsLeft)}
                </div>
                <div style={css('width:100%; height:5px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,.09);')}>
                  <div
                    style={{
                      width:
                      `${(() => {
                        const phaseSeconds = (pomodoro.mode === 'work' ? pomodoro.workMinutes : pomodoro.breakMinutes) * 60
                        return phaseSeconds > 0 ? Math.max(0, Math.min(100, (pomodoro.secondsLeft / phaseSeconds) * 100)) : 0
                      })()}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: pomodoro.mode === 'work' ? '#4c8dff' : '#5dcaA5',
                      transition: 'width .2s linear',
                    }}
                  />
                </div>
              </div>

              {pomodoroSettingsOpen && (
                <div style={css('display:grid; grid-template-columns:1fr 1fr; gap:8px; flex-shrink:0;')}>
                  {(['workMinutes', 'breakMinutes'] as const).map((key) => (
                    <label key={key} style={css('display:flex; flex-direction:column; gap:5px; font-size:9.5px; font-weight:600; color:rgba(255,255,255,.45); text-transform:uppercase; letter-spacing:.08em;')}>
                      {key === 'workMinutes' ? 'Work' : 'Break'}
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        max="1440"
                        value={pomodoroDrafts[key]}
                        aria-label={`${key === 'workMinutes' ? 'Work' : 'Break'} minutes`}
                        onFocus={() => setPomodoroDrafts((drafts) => ({ ...drafts, [key]: String(pomodoro[key]) }))}
                        onChange={(event) => {
                          const value = event.target.value
                          if (/^\d*$/.test(value)) setPomodoroDrafts((drafts) => ({ ...drafts, [key]: value }))
                        }}
                        onBlur={() => {
                          const raw = pomodoroDrafts[key]
                          const value = Number(raw)
                          if (!raw || !Number.isFinite(value)) {
                            setPomodoroDrafts((drafts) => ({ ...drafts, [key]: String(pomodoro[key]) }))
                            return
                          }
                          const minutes = Math.max(0, Math.min(1440, Math.trunc(value)))
                          updatePomodoroDuration(key, minutes)
                          setPomodoroDrafts((drafts) => ({ ...drafts, [key]: String(minutes) }))
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur()
                        }}
                        style={css('width:100%; padding:7px 8px; font-size:12px; font-weight:600; color:rgba(255,255,255,.85);')}
                      />
                    </label>
                  ))}
                </div>
              )}

              <div style={css('display:flex; align-items:center; gap:8px; flex-shrink:0;')}>
                <Box
                  onClick={resetPomodoro}
                  aria-label="Reset Pomodoro"
                  title="Reset timer"
                  sx="width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:18px; color:rgba(255,255,255,.55); cursor:pointer; border:1px solid rgba(255,255,255,.12);"
                  hover="background:rgba(255,255,255,.1); color:#fff"
                >
                  restart_alt
                </Box>
                <Box
                  onClick={() =>
                    setPomodoro((current) => {
                      if (current.running) {
                        const resolved = resolvePomodoro(current)
                        return { ...resolved, running: false, endAt: null }
                      }
                      return { ...current, running: true, endAt: Date.now() + Math.max(1, current.secondsLeft) * 1000 }
                    })
                  }
                  sx="flex:1; border-radius:10px; padding:9px 12px; text-align:center; font-size:12px; font-weight:700; color:#fff; cursor:pointer; background:rgba(76,141,255,.95);"
                  hover="background:rgba(96,157,255,1)"
                >
                  {pomodoro.running ? 'Pause' : 'Start'}
                </Box>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Utility toolbar */}
      <div
        className="utility-toolbar"
        style={css(
          'position:absolute; right:clamp(10px,1vw,18px); top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:clamp(3px,.5vh,6px); z-index:5;',
        )}
      >
        {tools.map((t) => (
          <Box
            key={t.label}
            onClick={t.onClick}
            title={t.label}
            sx="width:clamp(34px,4.3vh,40px); height:clamp(34px,4.3vh,40px); border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:clamp(17px,2.2vh,20px); color:rgba(255,255,255,.55); cursor:pointer;"
            hover="background:rgba(255,255,255,.13); color:#fff"
          >
            {t.icon}
          </Box>
        ))}
      </div>

      {/* Date notes drawer */}
      {s.dateOpen && (
        <div
          onClick={() => {
            set({ dateOpen: null, dnOpen: null, dnFormOpen: false, dnEditing: null })
          }}
          style={css('position:absolute; inset:0; background:rgba(6,9,14,.5); z-index:28; display:flex; justify-content:flex-end;')}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={css(
              'width:min(420px,92vw); height:100%; background:rgba(11,15,23,.82); backdrop-filter:blur(30px); border-left:1px solid rgba(255,255,255,.12); box-shadow:-24px 0 60px rgba(0,0,0,.45); display:flex; flex-direction:column; animation:rise .16s ease-out;',
            )}
          >
            <div
              style={css(
                'padding:20px 22px 16px; border-bottom:1px solid rgba(255,255,255,.08); display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-shrink:0;',
              )}
            >
              <div style={css('display:flex; flex-direction:column; gap:5px;')}>
                <span style={css('font-size:10px; font-weight:600; letter-spacing:.2em; color:rgba(255,255,255,.42);')}>THIS DAY</span>
                <span style={css('font-size:19px; font-weight:700;')}>
                  {new Date(s.dateOpen + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <Box
                onClick={() => {
                  set({ dateOpen: null, dnOpen: null, dnFormOpen: false, dnEditing: null })
                }}
                sx="width:28px; height:28px; border-radius:9px; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.5); cursor:pointer;"
                hover="background:rgba(255,255,255,.1); color:#fff"
              >
                <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>close</span>
              </Box>
            </div>

            <div style={css('flex:1; min-height:0; overflow-y:auto; padding:18px 22px; display:flex; flex-direction:column; gap:14px;')}>
              {s.dnFormOpen && (
                <div
                  ref={journalEditorRef}
                  style={css(
                    'position:relative; flex:1; min-height:0; display:flex; flex-direction:column; gap:12px;',
                  )}
                >
                  <input
                    value={s.dnTitle}
                    onChange={(e) => set({ dnTitle: e.target.value })}
                    placeholder="Title"
                    aria-label="Journal title"
                    style={css('flex-shrink:0; padding:3px 0 10px; border:0; border-bottom:1px solid rgba(255,255,255,.14); border-radius:0; background:transparent; font-size:20px; font-weight:700; color:rgba(255,255,255,.95);')}
                  />

                  <div style={css('position:relative; flex:1; min-height:220px;')}>
                    <textarea
                      ref={journalRef}
                      value={s.dnDesc}
                      onChange={(e) => set({ dnDesc: e.target.value })}
                      aria-label="Journal text"
                      placeholder="Start writing..."
                      style={css('width:100%; height:100%; min-height:220px; resize:none; outline:none; border:0; border-radius:0; padding:0; background:transparent; font-size:14px; line-height:1.75; color:rgba(255,255,255,.86);')}
                    />
                  </div>

                  <div style={css('display:flex; align-items:center; gap:10px; flex-shrink:0; padding-top:10px; border-top:1px solid rgba(255,255,255,.08);')}>
                    <span style={css('flex:1; min-width:0; font-size:10.5px; color:rgba(255,255,255,.32);')}>{s.dnEditing ? 'Last modified ' + stamp(dayList.find((n) => n.id === s.dnEditing)?.updated || Date.now()) : 'Last modified when saved'}</span>
                    <Box onClick={() => { void store.remove(JOURNAL_DRAFT_KEY); set({ dnFormOpen: false, dnEditing: null }) }} sx="padding:9px 12px; font-size:12px; font-weight:500; color:rgba(255,255,255,.58); cursor:pointer;" hover="color:#fff">
                      Cancel
                    </Box>
                    <Box
                      onClick={() => {
                        set((st) => {
                          const key = st.dateOpen!
                          const now = Date.now()
                          const list = (st.dateNotes[key] || []).slice()
                          const desc = plainJournalText(st.dnDesc)
                          const fallbackTitle = journalTitleFromBody(desc)
                          const title = st.dnTitle.trim() || fallbackTitle || 'Untitled journal'
                          if (st.dnEditing) {
                            const idx = list.findIndex((x) => x.id === st.dnEditing)
                            if (idx > -1) list[idx] = { ...list[idx], title, desc, category: st.dnCat, updated: now }
                          } else {
                            list.push({ id: now, title, desc, category: st.dnCat, created: now, updated: now })
                          }
                          return { dateNotes: { ...st.dateNotes, [key]: list }, dnFormOpen: false, dnEditing: null, dnTitle: '', dnDesc: '', dnCat: 'Personal' }
                        })
                        void store.remove(JOURNAL_DRAFT_KEY)
                      }}
                      sx="background:rgba(76,141,255,.95); border-radius:10px; padding:9px 16px; font-size:12px; font-weight:600; cursor:pointer;"
                      hover="background:rgba(96,157,255,1)"
                    >
                      {s.dnEditing ? 'Save note' : 'Add note'}
                    </Box>
                  </div>
                </div>
              )}

              {!s.dnFormOpen && openNote && (
                <div style={css('display:flex; flex-direction:column; gap:14px;')}>
                  <Box
                    onClick={() => set({ dnOpen: null })}
                    sx="display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:rgba(255,255,255,.55); cursor:pointer; align-self:flex-start;"
                    hover="color:#fff"
                  >
                    <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:16px;")}>arrow_back</span>
                    Back
                  </Box>
                  <div style={css('display:flex; align-items:flex-start; gap:10px;')}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 7, flexShrink: 0, background: catColor(openNote.category) }} />
                    <div style={css('min-width:0; flex:1;')}>
                      <div style={css('font-size:17px; font-weight:600; color:rgba(255,255,255,.96); line-height:1.35;')}>{openNote.title}</div>
                      <div style={css('font-size:11px; color:rgba(255,255,255,.45); margin-top:3px;')}>{openNote.category}</div>
                    </div>
                    <span style={css('font-size:11px; font-weight:600; color:rgba(255,255,255,.34); flex-shrink:0; padding-top:3px;')}>
                      {clock(openNote.created)}
                    </span>
                  </div>
                  {openNote.desc && openNote.desc.trim() ? (
                    <div style={css('font-size:13.5px; line-height:1.75; color:rgba(255,255,255,.8); white-space:pre-wrap;')}>{plainJournalText(openNote.desc)}</div>
                  ) : (
                    <div style={css('font-size:13px; color:rgba(255,255,255,.32); font-style:italic;')}>No details written.</div>
                  )}
                  <div style={css('font-size:10.5px; color:rgba(255,255,255,.28); border-top:1px solid rgba(255,255,255,.08); padding-top:11px;')}>
                    {'Created ' + stamp(openNote.created) + ' · Updated ' + stamp(openNote.updated)}
                  </div>
                  <div style={css('display:flex; gap:18px;')}>
                    <Box
                      onClick={() =>
                        set({ dnFormOpen: true, dnEditing: openNote.id, dnTitle: openNote.title, dnDesc: openNote.desc, dnCat: openNote.category })
                      }
                      sx="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:500; color:rgba(255,255,255,.7); cursor:pointer;"
                      hover="color:#fff"
                    >
                      <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>edit</span> Edit
                    </Box>
                    <Box
                      onClick={() =>
                        withUndo('Note deleted', ['dateNotes'], (st) => {
                          const key = st.dateOpen!
                          return {
                            dnOpen: null,
                            dateNotes: { ...st.dateNotes, [key]: (st.dateNotes[key] || []).filter((x) => x.id !== openNote.id) },
                          }
                        })
                      }
                      sx="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:500; color:rgba(248,113,113,.9); cursor:pointer;"
                      hover="color:rgba(252,165,165,1)"
                    >
                      <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>delete</span> Delete
                    </Box>
                  </div>
                </div>
              )}

              {!s.dnFormOpen && !openNote && (
                <>
                  {s.habits.length > 0 && (
                    <div style={css('display:flex; flex-direction:column; gap:9px;')}>
                      <div style={css('font-size:10px; font-weight:600; letter-spacing:.16em; color:rgba(255,255,255,.42);')}>HABITS</div>
                      {s.habits.map((h) => {
                        const on = h.done.includes(s.dateOpen!)
                        return (
                          <div key={h.id} style={css('display:flex; align-items:center; gap:11px;')}>
                            <Box
                              onClick={() => toggleHabitDay(h.id, s.dateOpen!)}
                              sx={
                                "width:19px; height:19px; border-radius:6px; flex-shrink:0; display:flex; align-items:center; justify-content:center; cursor:pointer; font-family:'Material Symbols Rounded'; line-height:1; font-size:13px; " +
                                (on
                                  ? 'background:rgba(29,158,117,.95); border:1px solid rgba(29,158,117,.95); color:#fff;'
                                  : 'background:transparent; border:1.5px solid rgba(255,255,255,.26); color:transparent;')
                              }
                              hover={on ? 'background:rgba(29,158,117,1)' : 'border-color:rgba(255,255,255,.5)'}
                            >
                              check
                            </Box>
                            <span
                              style={css(
                                'font-size:13px; ' +
                                  (on ? 'color:rgba(255,255,255,.42); text-decoration:line-through;' : 'color:rgba(255,255,255,.86);'),
                              )}
                            >
                              {h.name}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {dayTasks.length > 0 && (
                    <div style={css('display:flex; flex-direction:column; gap:9px;')}>
                      <div style={css('font-size:10px; font-weight:600; letter-spacing:.16em; color:rgba(255,255,255,.42);')}>TASKS DUE</div>
                      {dayTasks.map((tk) => (
                        <div key={tk.id} style={css('display:flex; align-items:center; gap:11px;')}>
                          <Box
                            onClick={() => toggleTask(tk.id)}
                            sx={
                              "width:19px; height:19px; border-radius:6px; flex-shrink:0; display:flex; align-items:center; justify-content:center; cursor:pointer; font-family:'Material Symbols Rounded'; line-height:1; font-size:13px; " +
                              (tk.completed
                                ? 'background:rgba(76,141,255,.95); border:1px solid rgba(76,141,255,.95); color:#fff;'
                                : 'background:transparent; border:1.5px solid rgba(255,255,255,.26); color:transparent;')
                            }
                            hover={tk.completed ? 'background:rgba(76,141,255,1)' : 'border-color:rgba(255,255,255,.5)'}
                          >
                            check
                          </Box>
                          <span
                            style={css(
                              'flex:1; min-width:0; font-size:13px; ' +
                                (tk.completed
                                  ? 'color:rgba(255,255,255,.42); text-decoration:line-through;'
                                  : 'color:rgba(255,255,255,.86);'),
                            )}
                          >
                            {tk.title}
                          </span>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 999,
                              flexShrink: 0,
                              background: prioMeta[tk.priority].bg,
                              color: prioMeta[tk.priority].fg,
                            }}
                          >
                            {tk.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {dayList.length > 0 && (
                    <div style={css('display:flex; flex-direction:column; gap:7px;')}>
                      <div style={css('display:flex; align-items:center; justify-content:space-between; gap:10px;')}>
                        <div style={css('font-size:10px; font-weight:600; letter-spacing:.16em; color:rgba(255,255,255,.42);')}>JOURNAL</div>
                        <span style={css('font-size:10px; color:rgba(255,255,255,.28);')}>Drag to reorder</span>
                      </div>
                      {dayList.map((n) => (
                        <Box
                          key={n.id}
                          onClick={() => set({ dnOpen: null, dnFormOpen: true, dnEditing: n.id, dnTitle: n.title, dnDesc: n.desc, dnCat: n.category })}
                          draggable
                          onDragStart={(e: React.DragEvent) => {
                            e.stopPropagation()
                            setDragDateNote(n.id)
                          }}
                          onDragOver={(e: React.DragEvent) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (dragOverDateNote !== n.id) setDragOverDateNote(n.id)
                          }}
                          onDrop={(e: React.DragEvent) => {
                            e.preventDefault()
                            e.stopPropagation()
                            set((st) => {
                              const key = st.dateOpen
                              const fromId = dragDateNote
                              if (!key || fromId == null || fromId === n.id) return {}
                              const list = [...(st.dateNotes[key] || [])]
                              const from = list.findIndex((item) => item.id === fromId)
                              const to = list.findIndex((item) => item.id === n.id)
                              if (from < 0 || to < 0) return {}
                              const [moved] = list.splice(from, 1)
                              list.splice(to, 0, moved)
                              return { dateNotes: { ...st.dateNotes, [key]: list } }
                            })
                            setDragDateNote(null)
                            setDragOverDateNote(null)
                          }}
                          onDragEnd={() => {
                            setDragDateNote(null)
                            setDragOverDateNote(null)
                          }}
                          role="button"
                          aria-label={`Open journal note ${n.title}`}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            background: 'rgba(255,255,255,.04)',
                            border: dragOverDateNote === n.id && dragDateNote !== n.id ? '1px solid rgba(120,170,255,.85)' : '1px solid rgba(255,255,255,.12)',
                            borderRadius: 11,
                            padding: '11px 10px 11px 13px',
                            cursor: dragDateNote === n.id ? 'grabbing' : 'grab',
                            opacity: dragDateNote === n.id ? 0.55 : 1,
                            transition: 'background .12s, border-color .12s, opacity .12s',
                          }}
                          hover="background:rgba(255,255,255,.09); border-color:rgba(255,255,255,.22)"
                        >
                          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: catColor(n.category) }} />
                          <span
                            style={css(
                              'flex:1; min-width:0; font-size:13px; font-weight:500; color:rgba(255,255,255,.9); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;',
                            )}
                          >
                            {n.title}
                          </span>
                          <span style={css('font-size:10.5px; font-weight:600; color:rgba(255,255,255,.3); flex-shrink:0;')}>{clock(n.created)}</span>
                          <Box
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation()
                              withUndo('Note deleted', ['dateNotes'], (st) => {
                                const key = st.dateOpen!
                                return { dateNotes: { ...st.dateNotes, [key]: (st.dateNotes[key] || []).filter((item) => item.id !== n.id) } }
                              })
                            }}
                            role="button"
                            aria-label={`Delete journal note ${n.title}`}
                            title="Delete note"
                            sx="width:25px; height:25px; border-radius:7px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-family:'Material Symbols Rounded'; font-size:15px; line-height:1; color:rgba(255,255,255,.32); cursor:pointer;"
                            hover="background:rgba(248,113,113,.16); color:rgba(255,150,150,.95)"
                          >
                            delete
                          </Box>
                          <span
                            aria-hidden="true"
                            title="Drag to reorder"
                            style={{ fontFamily: 'Material Symbols Rounded', fontSize: 16, lineHeight: 1, color: 'rgba(255,255,255,.28)', flexShrink: 0, cursor: 'grab' }}
                          >
                            drag_indicator
                          </span>
                        </Box>
                      ))}
                    </div>
                  )}

                  {dayList.length === 0 && dayTasks.length === 0 && s.habits.length === 0 && (
                    <div style={css('border:1px dashed rgba(255,255,255,.16); border-radius:14px; padding:44px 20px; text-align:center; font-size:13.5px; color:rgba(255,255,255,.4);')}>
                      Nothing for this day yet.
                    </div>
                  )}
                </>
              )}
            </div>

            {!s.dnFormOpen && !openNote && (
            <div style={css('padding:16px 22px 20px; border-top:1px solid rgba(255,255,255,.08); flex-shrink:0;')}>
              <Box
                role="button"
                aria-label="Add journal note"
                onClick={() => set({ dnFormOpen: true, dnEditing: null, dnTitle: '', dnDesc: '', dnCat: 'Personal' })}
                sx="background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:14px; text-align:center; font-size:13.5px; font-weight:600; color:rgba(255,255,255,.9); cursor:pointer;"
                hover="background:rgba(255,255,255,.12)"
              >
                + Add note
              </Box>
            </div>
            )}
          </div>
        </div>
      )}

      {/* Undo toast */}
      {s.undo && (
        <div
          style={css(
            'position:absolute; left:50%; bottom:24px; transform:translateX(-50%); z-index:36; display:flex; align-items:center; gap:16px; background:rgba(16,21,30,.94); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,.14); border-radius:13px; padding:11px 15px 11px 17px; box-shadow:0 16px 42px rgba(0,0,0,.5); animation:rise .14s ease-out;',
          )}
        >
          <span style={css('font-size:12.5px; font-weight:500; color:rgba(255,255,255,.84);')}>{s.undo.label}</span>
          <Box
            onClick={() => {
              clearTimeout(undoTimer.current)
              set((st) => ({ ...(st.undo ? st.undo.snapshot : {}), undo: null }))
            }}
            sx="font-size:11.5px; font-weight:700; letter-spacing:.08em; color:rgba(130,175,255,.98); cursor:pointer;"
            hover="color:#fff"
          >
            UNDO
          </Box>
        </div>
      )}

      {/* Modals */}
      {s.modal && (
        <div
          onClick={closeModal}
          style={css(
            'position:absolute; inset:0; background:rgba(6,9,14,.5); backdrop-filter:blur(6px); z-index:30; display:flex; align-items:center; justify-content:center; padding:26px;',
          )}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...css(
                'max-height:88vh; overflow-y:auto; background:rgba(18,23,32,.8); backdrop-filter:blur(30px); border:1px solid rgba(255,255,255,.13); border-radius:20px; box-shadow:0 28px 70px rgba(0,0,0,.5); padding:22px 24px; animation:rise .15s ease-out;',
              ),
              width: '100%',
              maxWidth: wide ? 600 : 430,
            }}
          >
            <div style={css('display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;')}>
              <div style={css('font-size:16px; font-weight:700;')}>
                {s.modal === 'bookmark' && s.dBmId
                  ? 'Edit bookmark'
                  : s.modal === 'task' && s.dTaskId
                    ? 'Edit task'
                    : titles[s.modal] || ''}
              </div>
              <Box
                onClick={closeModal}
                sx="width:26px; height:26px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.5); cursor:pointer;"
                hover="background:rgba(255,255,255,.1); color:#fff"
              >
                <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>close</span>
              </Box>
            </div>

            <Suspense
              fallback={
                <div style={css('padding:30px 4px; text-align:center; font-size:12.5px; color:rgba(255,255,255,.4);')}>
                  Loading…
                </div>
              }
            >
            {s.modal === 'note' && (
              <div style={css('display:flex; flex-direction:column; gap:14px;')}>
                <input
                  value={activeNote.title}
                  onChange={(e) => {
                    const v = e.target.value
                    set((st) => ({ notes: st.notes.map((x) => (x.id === st.activeNote ? { ...x, title: v } : x)) }))
                  }}
                  placeholder="Note title"
                  style={css('border:0; border-bottom:1px solid rgba(255,255,255,.14); border-radius:0; background:transparent; padding:8px 2px; font-size:17px; font-weight:600;')}
                />
                <textarea
                  value={activeNote.text}
                  onChange={(e) => {
                    const v = e.target.value
                    set((st) => ({ notes: st.notes.map((x) => (x.id === st.activeNote ? { ...x, text: v } : x)) }))
                  }}
                  placeholder="Start writing — saves as you type."
                  style={css('padding:14px; min-height:44vh; resize:vertical; font-size:13.5px; line-height:1.75; font-weight:400;')}
                />
                <div style={css('display:flex; align-items:center; justify-content:space-between;')}>
                  <div
                    onClick={() => withUndo('Note deleted', ['notes'], (st) => ({ notes: st.notes.filter((x) => x.id !== st.activeNote), modal: null }))}
                    style={css('font-size:12px; font-weight:600; color:rgba(255,138,128,.9); cursor:pointer;')}
                  >
                    Delete note
                  </div>
                  <div onClick={closeModal} style={css('background:rgba(76,141,255,.95); border-radius:11px; padding:10px 22px; font-size:12.5px; font-weight:600; cursor:pointer;')}>
                    Done
                  </div>
                </div>
              </div>
            )}

            {s.modal === 'todo' && (
              <div style={css('display:flex; flex-direction:column; gap:14px;')}>
                <div style={css('display:flex; align-items:center; gap:12px;')}>
                  <select value={s.filter} onChange={(e) => set({ filter: e.target.value as State['filter'] })} style={css('padding:9px 12px; font-size:12.5px; font-weight:600;')}>
                    <option value="today">Today's tasks</option>
                    <option value="backlog">Backlog</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="done">Completed</option>
                    <option value="all">All open</option>
                  </select>
                  <span style={css('font-size:11.5px; color:rgba(255,255,255,.4);')}>
                    {visibleTasks.length + (s.filter === 'done' ? ' done' : ' open')}
                  </span>
                  <div
                    onClick={newTask}
                    style={css('margin-left:auto; background:rgba(76,141,255,.95); border-radius:10px; padding:9px 16px; font-size:12px; font-weight:600; cursor:pointer;')}
                  >
                    + New task
                  </div>
                </div>
                <div style={css('max-height:52vh; overflow-y:auto; display:flex; flex-direction:column; gap:2px;')}>
                  {visibleTasks.map((t) => {
                    const p = prioMeta[t.priority] || prioMeta.medium
                    const d = new Date(t.due + 'T00:00')
                    return (
                      <Box key={t.id} sx="display:flex; align-items:flex-start; gap:12px; padding:12px 12px; border-radius:12px; background:rgba(255,255,255,.04);" hover="background:rgba(255,255,255,.08)">
                        <div
                          onClick={() => toggleTask(t.id)}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 5,
                            flexShrink: 0,
                            cursor: 'pointer',
                            marginTop: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            color: '#fff',
                            fontFamily: 'Material Symbols Rounded',
                            lineHeight: 1,
                            border: '1.5px solid ' + (t.completed ? '#4c8dff' : 'rgba(255,255,255,.32)'),
                            background: t.completed ? '#4c8dff' : 'transparent',
                          }}
                        >
                          {t.completed ? 'check' : ''}
                        </div>
                        <div style={css('flex:1; min-width:0;')}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              lineHeight: 1.45,
                              color: t.completed ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.92)',
                              textDecoration: t.completed ? 'line-through' : 'none',
                            }}
                          >
                            {t.title}
                          </div>
                          <div style={css('display:flex; gap:8px; margin-top:6px; flex-wrap:wrap; align-items:center;')}>
                            <span style={css('font-size:10.5px; font-weight:500; color:rgba(255,255,255,.4);')}>
                              {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + (t.time ? ' · ' + t.time : '')}
                            </span>
                            <span style={{ fontSize: 9.5, fontWeight: 600, padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap', background: p.bg, color: p.fg }}>
                              {t.priority}
                            </span>
                            <ReminderChip remind={t.remind} />
                          </div>
                        </div>
                        <Box
                          onClick={() => withUndo('Task deleted', ['tasks'], (st) => ({ tasks: st.tasks.filter((x) => x.id !== t.id) }))}
                          sx="font-size:12px; color:rgba(255,255,255,.25); cursor:pointer; padding-top:2px;"
                          hover="color:rgba(255,140,130,.95)"
                        >
                          <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:14px;")}>close</span>
                        </Box>
                      </Box>
                    )
                  })}
                  {visibleTasks.length === 0 && (
                    <div style={css('padding:40px 16px; text-align:center; font-size:13px; color:rgba(255,255,255,.32);')}>{emptyTaskLine}</div>
                  )}
                </div>
              </div>
            )}

            {s.modal === 'task' && (
              <div style={css('display:flex; flex-direction:column; gap:14px;')}>
                <div style={css('display:flex; flex-direction:column; gap:6px;')}>
                  <label style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.45);')}>TASK</label>
                  <input value={s.dTitle} onChange={(e) => set({ dTitle: e.target.value })} placeholder="Study multiplicity of eigenvalues" style={css('padding:11px 13px; font-size:13.5px;')} />
                </div>
                <div style={css('display:grid; grid-template-columns:1fr 1fr; gap:12px;')}>
                  <div style={css('display:flex; flex-direction:column; gap:6px;')}>
                    <label style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.45);')}>DUE</label>
                    <input type="date" value={s.dDue} onChange={(e) => set({ dDue: e.target.value })} style={css('padding:11px 13px; font-size:13px;')} />
                  </div>
                  <div style={css('display:flex; flex-direction:column; gap:6px;')}>
                    <label style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.45);')}>TIME</label>
                    <input type="time" value={s.dTime} onChange={(e) => set({ dTime: e.target.value })} style={css('padding:11px 13px; font-size:13px;')} />
                  </div>
                </div>
                <div style={css('display:flex; flex-direction:column; gap:7px;')}>
                  <label style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.45);')}>PRIORITY</label>
                  <div style={css('display:flex; gap:8px;')}>
                    {(['easy', 'medium', 'hard'] as const).map((p) => (
                      <div
                        key={p}
                        onClick={() => set({ dPrio: p })}
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          fontSize: 12,
                          fontWeight: 600,
                          padding: 10,
                          borderRadius: 10,
                          cursor: 'pointer',
                          border: '1px solid ' + (s.dPrio === p ? 'rgba(76,141,255,.8)' : 'rgba(255,255,255,.12)'),
                          background: s.dPrio === p ? 'rgba(76,141,255,.22)' : 'rgba(255,255,255,.04)',
                          color: s.dPrio === p ? '#fff' : 'rgba(255,255,255,.55)',
                        }}
                      >
                        {p[0].toUpperCase() + p.slice(1)}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={css('display:flex; flex-direction:column; gap:6px;')}>
                  <label style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.45);')}>REMINDER</label>
                  <select value={s.dRemind} onChange={(e) => set({ dRemind: e.target.value })} style={css('padding:11px 13px; font-size:13px;')}>
                    <option value="none">No reminder</option>
                    <option value="at">At task time</option>
                    <option value="5">5 minutes before</option>
                    <option value="15">15 minutes before</option>
                    <option value="60">1 hour before</option>
                    <option value="1440">1 day before</option>
                  </select>
                  {s.dRemind !== 'none' && (
                    <div style={css('font-size:10.5px; color:rgba(255,255,255,.38); line-height:1.6;')}>
                      {isExtension
                        ? 'A desktop notification fires then, even if no Locus tab is open. Tasks with no time are treated as 9:00 am.'
                        : 'Notifications only fire in the packaged extension, not in the dev preview.'}
                    </div>
                  )}
                </div>
                <div style={css('display:flex; justify-content:flex-end; gap:8px; margin-top:2px;')}>
                  <div onClick={closeModal} style={css('padding:10px 16px; font-size:12.5px; font-weight:600; color:rgba(255,255,255,.55); cursor:pointer;')}>
                    Cancel
                  </div>
                  <div
                    onClick={() => {
                      if (!s.dTitle.trim()) return
                      set((st) => {
                        const due = st.dDue || todayIso
                        if (st.dTaskId != null) {
                          return {
                            tasks: st.tasks.map((t) =>
                              t.id === st.dTaskId
                                ? { ...t, title: st.dTitle.trim(), due, time: st.dTime, priority: st.dPrio, remind: st.dRemind }
                                : t,
                            ),
                            modal: null,
                          }
                        }
                        return {
                          tasks: [
                            ...st.tasks,
                            {
                              id: Date.now(),
                              title: st.dTitle.trim(),
                              due,
                              time: st.dTime,
                              priority: st.dPrio,
                              completed: false,
                              remind: st.dRemind,
                              subs: [],
                            },
                          ],
                          modal: null,
                          filter: due > todayIso ? 'upcoming' : 'today',
                        }
                      })
                    }}
                    style={css('background:rgba(76,141,255,.95); border-radius:11px; padding:10px 20px; font-size:12.5px; font-weight:600; cursor:pointer;')}
                  >
                    {s.dTaskId != null ? 'Save changes' : 'Add task'}
                  </div>
                </div>
              </div>
            )}

            {s.modal === 'board' && (
              <div style={css('display:flex; flex-direction:column; gap:16px;')}>
                <div style={css('display:flex; flex-direction:column; gap:6px;')}>
                  <label style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.45);')}>BOARD NAME</label>
                  <input
                    autoFocus
                    value={s.dBoardName}
                    onChange={(e) => set({ dBoardName: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') document.getElementById('jv-create-board')?.click()
                    }}
                    placeholder="Mathematics"
                    style={css('padding:11px 13px; font-size:13.5px;')}
                  />
                </div>
                {s.bmReturn && s.dBmName.trim() && s.dBmUrl.trim() && (
                  <div style={css('font-size:11px; color:rgba(255,255,255,.4); line-height:1.5;')}>
                    "{s.dBmName.trim()}" will be added to this board.
                  </div>
                )}
                <div style={css('display:flex; justify-content:flex-end; gap:8px;')}>
                  <div
                    onClick={() => (s.bmReturn ? set({ modal: 'bookmark', bmReturn: false }) : closeModal())}
                    style={css('padding:10px 16px; font-size:12.5px; font-weight:600; color:rgba(255,255,255,.55); cursor:pointer;')}
                  >
                    {s.bmReturn ? 'Back' : 'Cancel'}
                  </div>
                  <div
                    id="jv-create-board"
                    onClick={async () => {
                      if (!s.dBoardName.trim()) return
                      if (editingBoardId) {
                        await renameBoardName(editingBoardId, s.dBoardName)
                        setEditingBoardId(null)
                        closeModal()
                        return
                      }
                      const id = await addBoard(s.dBoardName.trim())
                      if (s.bmReturn && s.dBmName.trim() && s.dBmUrl.trim()) {
                        const url = /^https?:/.test(s.dBmUrl) ? s.dBmUrl : 'https://' + s.dBmUrl
                        await addBookmarkTo(id, s.dBmName.trim(), url)
                        set({ modal: null, dBoardName: '', bmReturn: false, dBmName: '', dBmUrl: '' })
                      } else if (s.bmReturn) {
                        set({ modal: 'bookmark', dBmBoard: id, dBoardName: '', bmReturn: false })
                      } else {
                        set({ modal: null, dBoardName: '' })
                      }
                    }}
                    style={css('background:rgba(76,141,255,.95); border-radius:11px; padding:10px 20px; font-size:12.5px; font-weight:600; cursor:pointer;')}
                  >
                    {editingBoardId ? 'Save name' : 'Create board'}
                  </div>
                </div>
              </div>
            )}

            {s.modal === 'bookmark' && (
              <div style={css('display:flex; flex-direction:column; gap:14px;')}>
                <div style={css('display:flex; flex-direction:column; gap:6px;')}>
                  <label style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.45);')}>NAME</label>
                  <input value={s.dBmName} onChange={(e) => set({ dBmName: e.target.value })} placeholder="GitHub" style={css('padding:11px 13px; font-size:13.5px;')} />
                </div>
                <div style={css('display:flex; flex-direction:column; gap:6px;')}>
                  <label style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.45);')}>URL</label>
                  <input value={s.dBmUrl} onChange={(e) => set({ dBmUrl: e.target.value })} placeholder="https://github.com" style={css('padding:11px 13px; font-size:13.5px;')} />
                </div>
                <div style={css('display:flex; flex-direction:column; gap:6px;')}>
                  <div style={css('display:flex; align-items:center; justify-content:space-between;')}>
                    <label style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.45);')}>BOARD</label>
                    <div
                      onClick={() => set({ modal: 'board', dBoardName: '', bmReturn: true })}
                      style={css('font-size:11px; font-weight:600; color:rgba(130,175,255,.98); cursor:pointer;')}
                    >
                      + New board
                    </div>
                  </div>
                  {orderedBoards.length > 0 ? (
                    <select value={s.dBmBoard} onChange={(e) => set({ dBmBoard: e.target.value })} style={css('padding:11px 13px; font-size:13px;')}>
                      {orderedBoards.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={css('font-size:12px; color:rgba(255,255,255,.4); padding:4px 2px;')}>
                      No boards yet — tap "+ New board".
                    </div>
                  )}
                </div>
                <div style={css('display:flex; justify-content:flex-end; gap:8px;')}>
                  <div onClick={closeModal} style={css('padding:10px 16px; font-size:12.5px; font-weight:600; color:rgba(255,255,255,.55); cursor:pointer;')}>
                    Cancel
                  </div>
                  <div
                    onClick={async () => {
                      if (!s.dBmName.trim() || !s.dBmUrl.trim()) return
                      const board = s.dBmBoard || orderedBoards[0]?.id
                      if (!board) return
                      const url = /^https?:/.test(s.dBmUrl) ? s.dBmUrl : 'https://' + s.dBmUrl
                      if (s.dBmId) await saveBookmarkEdit(s.dBmId, s.dBmOrigBoard, board, s.dBmName.trim(), url)
                      else await addBookmarkTo(board, s.dBmName.trim(), url)
                      set({ modal: null, dBmId: '', dBmOrigBoard: '' })
                    }}
                    style={css('background:rgba(76,141,255,.95); border-radius:11px; padding:10px 20px; font-size:12.5px; font-weight:600; cursor:pointer;')}
                  >
                    {s.dBmId ? 'Save' : 'Add'}
                  </div>
                </div>
              </div>
            )}

            {s.modal === 'bmsearch' && (
              <div style={css('display:flex; flex-direction:column; gap:14px;')}>
                <input
                  ref={bookmarkSearchRef}
                  autoFocus
                  value={s.bmQuery}
                  onChange={(e) => set({ bmQuery: e.target.value })}
                  placeholder="Search bookmarks, URLs, boards..."
                  style={css('padding:12px 14px; font-size:13.5px;')}
                />
                <div style={css('max-height:46vh; overflow-y:auto; display:flex; flex-direction:column; gap:16px;')}>
                  {bmResults.map((g) => (
                    <div key={g.name} style={css('display:flex; flex-direction:column; gap:5px;')}>
                      <div style={css('display:flex; align-items:center; gap:8px; padding:0 2px 3px;')}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: g.dot }} />
                        <div style={css('font-size:10px; font-weight:600; letter-spacing:.16em; color:rgba(255,255,255,.42); text-transform:uppercase;')}>{g.name}</div>
                      </div>
                      {g.items.map((bm) => (
                        <Box
                          key={bm.id}
                          onClick={() => open(bm.url)}
                          sx="display:flex; align-items:center; gap:11px; padding:8px 10px; border-radius:10px; cursor:pointer;"
                          hover="background:rgba(255,255,255,.08)"
                        >
                          <Favicon
                            url={bm.url}
                            title={bm.title}
                            sx="width:19px;height:19px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;background:rgba(255,255,255,.14);color:rgba(255,255,255,.85);"
                          />
                          <div style={css('min-width:0; flex:1;')}>
                            <div style={css('font-size:12.5px; font-weight:500; color:rgba(255,255,255,.88);')}>{bm.title}</div>
                            <div style={css('font-size:10px; color:rgba(255,255,255,.35); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}>{bm.url}</div>
                          </div>
                        </Box>
                      ))}
                    </div>
                  ))}
                  {bmResults.length === 0 && (
                    <div style={css('padding:22px; text-align:center; font-size:12.5px; color:rgba(255,255,255,.35);')}>No bookmarks match that.</div>
                  )}
                </div>
              </div>
            )}

            {s.modal === 'habits' && (
              <HabitsModal
                s={s}
                set={set}
                today={today}
                onToggle={toggleHabitDay}
                onDelete={deleteHabit}
              />
            )}

            {s.modal === 'import' && (
              <ImportModal
                s={s}
                set={set}
                bmCount={bmCount}
                parsed={parsed}
                importing={importing}
                onExport={doExport}
                onImportFile={onImportFile}
                onCancelPreview={() => {
                  setParsed(null)
                  set({ importPreview: false })
                }}
                onConfirm={() => void confirmImport()}
              />
            )}

            {s.modal === 'settings' && (
              <SettingsModal
                s={s}
                set={set}
                onBgFile={onBgFile}
                onAdjustBg={() => set({ bgAdjust: true, modal: null })}
                onRemoveBg={() => set({ bgImage: null, ...DEFAULT_BG_STATE })}
                onReplayTour={() => {
                  set({ modal: null })
                  setShowTour(true)
                }}
                onReset={() =>
                  set({
                    ...emptyLocal(),
                    modal: null,
                    filter: 'today',
                    pageData: {},
                    pages: [{ id: 1, name: 'Home' }],
                    activePage: 1,
                  })
                }
                onBackupNow={() => void runBackup(false)}
              />
            )}

            {s.modal === 'shortcuts' && <ShortcutsModal />}

            {s.modal === 'histpage' && (
              <div style={css('display:flex; flex-direction:column; gap:12px;')}>
                <div style={css('display:flex; align-items:center; gap:10px;')}>
                  <div style={css('font-size:11.5px; color:rgba(255,255,255,.45); flex:1;')}>
                    {isExtension ? 'Recent activity from this browser profile:' : 'History is only available when running as an extension.'}
                  </div>
                  {isExtension && (
                    <div
                      onClick={() => openModal('clearhistory')}
                      style={css('font-size:11.5px; font-weight:600; color:rgba(255,138,128,.95); cursor:pointer; white-space:nowrap;')}
                    >
                      Clear history
                    </div>
                  )}
                </div>
                <div style={css('max-height:46vh; overflow-y:auto; display:flex; flex-direction:column; gap:2px;')}>
                  {s.history.map((h, i) => (
                    <Box
                      key={i}
                      onClick={() => open(h.url)}
                      sx="display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:11px; background:rgba(255,255,255,.04); cursor:pointer;"
                      hover="background:rgba(255,255,255,.09)"
                    >
                      <Favicon
                        url={h.url}
                        title={h.host}
                        sx="width:26px;height:26px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:rgba(255,255,255,.85);background:rgba(96,141,255,.32);"
                      />
                      <div style={css('flex:1; min-width:0;')}>
                        <div style={css('font-size:13px; font-weight:500; color:rgba(255,255,255,.9); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}>{h.title}</div>
                        <div style={css('font-size:10.5px; color:rgba(255,255,255,.38); margin-top:3px;')}>{h.host}</div>
                      </div>
                      <div style={css('font-size:10.5px; color:rgba(255,255,255,.35); flex-shrink:0;')}>{h.time}</div>
                    </Box>
                  ))}
                  {s.history.length === 0 && isExtension && (
                    <div style={css('padding:22px; text-align:center; font-size:12.5px; color:rgba(255,255,255,.35);')}>No history yet.</div>
                  )}
                </div>
              </div>
            )}

            {s.modal === 'clearhistory' && (
              <div style={css('display:flex; flex-direction:column; gap:18px;')}>
                <div style={css('font-size:13px; color:rgba(255,255,255,.72); line-height:1.65;')}>
                  This removes your browsing history for this profile. It cannot be undone.
                </div>
                <div style={css('display:flex; justify-content:flex-end; gap:8px;')}>
                  <div onClick={() => openModal('histpage')} style={css('padding:10px 16px; font-size:12.5px; font-weight:600; color:rgba(255,255,255,.55); cursor:pointer;')}>
                    Cancel
                  </div>
                  <div
                    onClick={async () => {
                      await clearHistory()
                      set({ history: [], modal: null })
                    }}
                    style={css('border-radius:11px; padding:10px 20px; font-size:12.5px; font-weight:600; cursor:pointer; color:#fff; background:rgba(239,80,72,.9);')}
                  >
                    Clear history
                  </div>
                </div>
              </div>
            )}
            </Suspense>
          </div>
        </div>
      )}

      {s.bgAdjust && s.bgImage && (
        <WallpaperAdjust src={s.bgImage} value={bgT} onChange={setBgT} onDone={() => set({ bgAdjust: false })} />
      )}

      {showMorningBrief && profileName && (
        <MorningBrief
          name={profileName}
          tasks={briefTasks}
          yesterdayPendingTasks={yesterdayPendingTasks}
          habits={briefHabits}
          yesterdayDone={yesterdayDone}
          yesterdayTotal={yesterdayTotal}
          quote={morningQuote}
          onClose={closeMorningBrief}
          onToggleTask={toggleTask}
          onEditTask={(task) => {
            closeMorningBrief()
            editTask(task)
          }}
          onOpenHabits={() => {
            closeMorningBrief()
            openModal('habits')
          }}
          onOpenJournal={() => {
            closeMorningBrief()
            set({ dateOpen: todayIso, dnOpen: null, dnFormOpen: false, dnEditing: null, dnTitle: '', dnDesc: '', dnCat: 'Personal' })
          }}
        />
      )}

      {showOnboarding && <Onboarding onComplete={completeOnboarding} />}

      <Suspense fallback={null}>{showTour && <Walkthrough onClose={() => setShowTour(false)} />}</Suspense>
    </div>
  )
}
