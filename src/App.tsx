import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Box } from './components/Box'
import { BmRow } from './components/BmRow'
import { Clock } from './components/Clock'
import { Favicon } from './components/Favicon'
import { GappIcon } from './components/GappIcon'
import { Walkthrough } from './components/Walkthrough'
import { css } from './lib/css'
import { open } from './lib/nav'
import { debounce, store } from './lib/storage'
import { uid } from './lib/id'
import { normalizeLocal } from './lib/normalize'
import { type ImportResult, buildApplyPlan, parseImport } from './import'
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
import { openIncognito } from './chrome/windows'
import {
  CATS,
  DEFAULT_GAPPS,
  ENGINES,
  FEEDBACK_URL,
  GAPP_CATALOG,
  PERSIST_KEYS,
  dotFor,
  emptyLocal,
  gappByKey,
  iso,
  makeInitialState,
  reducer,
  stamp,
} from './state'
import type { Board, PageData, Priority, State } from './types'

const BG_KEY = 'jarvis.bg'
const LOCAL_KEY = 'jarvis.v1'
const DEV_BOARDS_KEY = 'jarvis.devBoards'
const ONBOARD_KEY = 'jarvis.onboarded'

const localSlice = (s: State): PageData => ({
  notes: s.notes,
  tasks: s.tasks,
  habits: s.habits,
  dateNotes: s.dateNotes,
})

/** Sort boards by Jarvis's own order; boards not in the list keep their natural order at the end. */
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

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, makeInitialState)
  const s = state

  const set = useCallback(
    (x: Partial<State> | ((s: State) => Partial<State>)) =>
      typeof x === 'function' ? dispatch({ type: 'fn', fn: x }) : dispatch({ type: 'patch', patch: x }),
    [],
  )

  const [showTour, setShowTour] = useState(false)
  const [boardMenu, setBoardMenu] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const loaded = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const readLens = useCallback(
    (file: File, label?: string) => {
      const r = new FileReader()
      r.onload = (ev) =>
        set({
          lensImage: String(ev.target?.result ?? ''),
          lensName: label || file.name,
          lensDrag: false,
          searchFocus: true,
        })
      r.readAsDataURL(file)
    },
    [set],
  )

  // ---- load persisted state + boards ---------------------------------------
  useEffect(() => {
    let alive = true
    ;(async () => {
      const saved = await store.get<Partial<State>>(LOCAL_KEY)
      const bg = await store.get<string>(BG_KEY)
      if (!alive) return
      if (saved) set(normalizeLocal(saved))
      if (typeof bg === 'string' && bg.startsWith('data:')) set({ bgImage: bg })

      if (hasBookmarks) {
        const boards = await readBoards()
        if (alive) set({ boards })
      } else {
        const dev = (await store.get<Board[]>(DEV_BOARDS_KEY)) ?? devSeedBoards()
        if (alive) set({ boards: dev })
      }

      // First run: seed one sample board (if the user has no folders yet) and
      // show the walkthrough. Runs once — guarded by ONBOARD_KEY.
      const onboarded = await store.get<boolean>(ONBOARD_KEY)
      if (!alive) return
      if (!onboarded) {
        if (hasBookmarks) {
          const existing = await readBoards()
          if (!existing.length) {
            try {
              const id = await createBoard('Getting started')
              await bmAdd(id, 'Gmail', 'https://mail.google.com')
              await bmAdd(id, 'YouTube', 'https://youtube.com')
              await bmAdd(id, 'GitHub', 'https://github.com')
              await bmAdd(id, 'Google Calendar', 'https://calendar.google.com')
              const boards = await readBoards()
              if (alive) set((st) => ({ boards, boardPage: { ...st.boardPage, [id]: 1 } }))
            } catch {
              /* bookmarks API unavailable — skip the sample board */
            }
          }
        }
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
    s.pages,
    s.activePage,
    s.pageData,
    s.h24,
    s.engine,
    s.filter,
    s.gapps,
    s.gappsOn,
    s.boardOrder,
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

  // Any board Jarvis hasn't seen before (first load, or a folder created directly
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
        set({
          modal: null,
          dateOpen: null,
          enginesOpen: false,
          appsOpen: false,
          gappsEdit: false,
          importPreview: false,
          dnFormOpen: false,
          lensPinned: false,
          lensDrag: false,
          dragBoard: null,
          dragOverBoard: null,
          dragBm: null,
          dragOverBm: null,
          bmReturn: false,
        })
      } else if (e.key === '/' && searchRef.current && document.activeElement !== searchRef.current) {
        e.preventDefault()
        searchRef.current.focus()
      }
    }
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith('image')) {
          const f = item.getAsFile()
          if (f) {
            readLens(f, 'Pasted image')
            e.preventDefault()
          }
          return
        }
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('paste', onPaste)
    searchRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('paste', onPaste)
    }
  }, [set, readLens])

  useEffect(() => {
    void readTopSites().then((topSites) => set({ topSites }))
  }, [set])

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

  const onBgFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const r = new FileReader()
    r.onload = (ev) => set({ bgImage: String(ev.target?.result ?? '') })
    r.readAsDataURL(file)
  }

  // ---- board ops (Chrome or local) -----------------------------------
  /** Pin a board to a page (board id -> page id). Boards are per-page in Jarvis. */
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
  const renameBoardH = (id: string, current: string) => {
    if (id === '1') return // synthetic "Bookmarks Bar" board
    const name = window.prompt('Rename board', current)
    if (!name || !name.trim() || name.trim() === current) return
    if (hasBookmarks) void renameBoard(id, name.trim())
    else set((st) => ({ boards: st.boards.map((b) => (b.id === id ? { ...b, name: name.trim() } : b)) }))
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
  const switchPage = (id: number) => {
    if (id === s.activePage) return
    set((st) => {
      const pageData = { ...st.pageData, [st.activePage]: localSlice(st) }
      const load = pageData[id] ?? emptyLocal()
      return { pageData, activePage: id, modal: null, dateOpen: null, filter: 'today', ...load }
    })
  }
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
  const closeModal = () =>
    set({ modal: null, importPreview: false, importError: '', bmReturn: false, dBmId: '', dBmOrigBoard: '' })

  const openHistory = async () => {
    openModal('histpage')
    const rows = await recentHistory(40)
    set({ history: rows })
  }

  const tools = [
    { icon: 'bookmarks', label: 'Search bookmarks', onClick: () => openModal('bmsearch', { bmQuery: '' }) },
    { icon: 'swap_vert', label: 'Import / export', onClick: () => openModal('import', { importPreview: false, importError: '' }) },
    { icon: 'shield', label: 'Privacy mode', onClick: () => openModal('privacy') },
    {
      icon: 'open_in_full',
      label: 'Fullscreen',
      onClick: () => {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen?.()
      },
    },
    { icon: 'repeat', label: 'Habits', onClick: () => openModal('habits') },
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

  // calendar
  const base = new Date(today.getFullYear(), today.getMonth() + s.monthOffset, 1)
  const dim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  const calDays: { label: string; today: boolean; has: boolean; dayIso: string | null }[] = []
  for (let i = 0; i < base.getDay(); i++) calDays.push({ label: '', today: false, has: false, dayIso: null })
  for (let d = 1; d <= dim; d++) {
    const dayIso = iso(new Date(base.getFullYear(), base.getMonth(), d))
    calDays.push({
      label: String(d),
      today: s.monthOffset === 0 && d === today.getDate(),
      has: (s.dateNotes[dayIso] || []).length > 0,
      dayIso,
    })
  }
  const catColor = (n: string) => (CATS.find((c) => c.name === n) || CATS[4]).color
  const dayList = s.dateOpen ? s.dateNotes[s.dateOpen] || [] : []

  // notes
  const noteTitle = (n: { title: string; text: string }) =>
    (n.title && n.title.trim()) || (n.text || '').trim().split('\n')[0].slice(0, 34) || 'Untitled note'
  const activeNote = s.notes.find((n) => n.id === s.activeNote) || { id: 0, title: '', text: '' }

  // tasks
  const prioMeta: Record<Priority, { bg: string; fg: string }> = {
    easy: { bg: 'rgba(52,211,153,.16)', fg: 'rgba(110,231,183,.95)' },
    medium: { bg: 'rgba(251,191,36,.16)', fg: 'rgba(253,214,110,.95)' },
    hard: { bg: 'rgba(251,113,133,.16)', fg: 'rgba(253,164,175,.95)' },
  }
  const visibleTasks = s.tasks.filter((t) => {
    if (s.filter === 'done') return t.completed
    if (t.completed) return false
    if (s.filter === 'all') return true
    return s.filter === 'today' ? t.due <= todayIso : t.due > todayIso
  })
  const emptyTaskLine =
    s.filter === 'done'
      ? 'Nothing completed yet.'
      : s.filter === 'upcoming'
        ? 'Nothing scheduled ahead.'
        : "You're all caught up."

  // habits
  const habitCols: string[] = []
  for (let i = 6; i >= 0; i--)
    habitCols.push(new Date(+today - i * 86400000).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2).toUpperCase())
  const habitRows = s.habits.map((h) => {
    let streak = 0
    for (let i = h.days.length - 1; i >= 0; i--) {
      if (h.days[i]) streak++
      else break
    }
    return { ...h, streak }
  })

  // suggestions
  const sq = s.query.trim().toLowerCase()
  const suggestions: { icon: string; label: string; kind: string; onPick: () => void }[] = []
  if (sq) {
    suggestions.push({
      icon: s.engine === 'Images' ? 'image_search' : 'search',
      label: s.query,
      kind: s.engine === 'Images' ? 'Google Images' : s.engine,
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

  const showLens = s.engine === 'Images' && (s.searchFocus || s.lensDrag || s.lensPinned || !!s.lensImage)

  const wide = ['habits', 'bmsearch', 'settings', 'import', 'note', 'todo', 'histpage'].includes(s.modal || '')
  const titles: Record<string, string> = {
    note: 'Note',
    todo: 'To-do list',
    task: 'New task',
    board: 'New board',
    bookmark: 'Add bookmark',
    bmsearch: 'Search bookmarks',
    habits: 'Habits',
    import: 'Import / export',
    settings: 'Settings',
    histpage: 'History',
    privacy: 'Privacy mode',
    clearhistory: 'Clear history',
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
    a.download = 'jarvis-backup.json'
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
    void file
      .text()
      .then((text) => {
        const result = parseImport(file.name, text)
        const total =
          result.boards.reduce((a, b) => a + b.bookmarks.length, 0) +
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

  const [incognitoHint, setIncognitoHint] = useState('')

  // ================================================================
  return (
    <div
      style={css(
        "position:relative; width:100%; height:100vh; min-height:560px; overflow:hidden; font-family:'Manrope',system-ui,sans-serif; color:#fff;",
      )}
    >
      {s.bgImage ? (
        <img src={s.bgImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
        style={css(
          'position:relative; z-index:1; height:100%; display:flex; flex-direction:column; gap:clamp(8px,1.2vh,14px); padding:clamp(14px,2vh,22px) clamp(62px,4.6vw,78px) clamp(12px,1.8vh,20px) clamp(16px,1.5vw,26px);',
        )}
      >
        {/* Top bar */}
        <div style={css('display:flex; align-items:center; gap:clamp(10px,1.2vw,18px); flex-shrink:0;')}>
          <div
            data-tour="pages"
            style={css(
              'display:flex; align-items:center; gap:2px; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:13px; padding:4px; flex-shrink:0;',
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
          <div style={css('flex:1; min-width:0; display:flex; justify-content:center;')}>
            <div data-tour="search" style={css('position:relative; width:100%; max-width:min(620px,46vw);')}>
              <div
                style={css(
                  'height:clamp(38px,5vh,46px); background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:14px; display:flex; align-items:center; padding:0 5px 0 15px; gap:10px;',
                )}
              >
                <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:18px; color:rgba(255,255,255,.5);")}>
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
                  onBlur={() => {
                    if (!s.lensImage && !s.lensDrag) set({ searchFocus: false })
                  }}
                  placeholder={s.engine === 'Images' ? 'Search Google Images…' : 'Search ' + s.engine + '…'}
                  style={css('flex:1; min-width:0; border:0; background:transparent; font-size:clamp(12px,1.6vh,14px); font-weight:500;')}
                />
                <Box
                  onClick={() => set({ enginesOpen: !s.enginesOpen })}
                  sx="display:flex; align-items:center; gap:7px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.16); border-radius:10px; padding:6px 11px; font-size:clamp(10px,1.3vh,12px); font-weight:600; color:rgba(255,255,255,.8); cursor:pointer; white-space:nowrap;"
                  hover="background:rgba(255,255,255,.14)"
                >
                  {s.engine}{' '}
                  <span style={css("font-family:'Material Symbols Rounded'; line-height:1; opacity:.55; font-size:15px;")}>expand_more</span>
                </Box>
              </div>

              {showLens && (
                <div
                  onMouseDown={() => {
                    if (!s.lensPinned) set({ lensPinned: true })
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (!s.lensDrag) set({ lensDrag: true })
                  }}
                  onDragLeave={() => set({ lensDrag: false })}
                  onDrop={(e) => {
                    e.preventDefault()
                    const f = e.dataTransfer?.files?.[0]
                    if (f) readLens(f, f.name)
                    else set({ lensDrag: false })
                  }}
                  style={{
                    ...css(
                      'position:absolute; left:0; right:0; top:calc(100% + 8px); z-index:19; text-align:center; border-radius:14px; box-shadow:0 18px 46px rgba(0,0,0,.5); background:rgba(16,21,30,.94); backdrop-filter:blur(16px); animation:rise .12s ease-out;',
                    ),
                    border: s.lensDrag ? '1.5px dashed rgba(130,175,255,.9)' : '1.5px solid rgba(255,255,255,.12)',
                  }}
                >
                  {!s.lensImage ? (
                    <div style={css('display:flex; flex-direction:column; align-items:center; gap:9px; padding:20px 16px;')}>
                      <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:26px; color:rgba(255,255,255,.4);")}>
                        image_search
                      </span>
                      <div style={css('font-size:12.5px; font-weight:500; color:rgba(255,255,255,.75);')}>
                        {s.lensDrag ? 'Drop the image to search it' : 'Drag an image here, paste it, or upload'}
                      </div>
                      <label
                        style={css(
                          'position:relative; overflow:hidden; background:rgba(76,141,255,.95); border-radius:10px; padding:8px 15px; font-size:11.5px; font-weight:600; cursor:pointer;',
                        )}
                      >
                        Upload a file
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) readLens(f, f.name)
                          }}
                          style={css('position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; border:0; background:transparent; padding:0;')}
                        />
                      </label>
                    </div>
                  ) : (
                    <div style={css('display:flex; align-items:center; gap:13px; padding:13px;')}>
                      <img
                        src={s.lensImage}
                        alt=""
                        style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,.16)' }}
                      />
                      <div style={css('flex:1; min-width:0; text-align:left;')}>
                        <div
                          style={css(
                            'font-size:12.5px; font-weight:600; color:rgba(255,255,255,.92); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;',
                          )}
                        >
                          {s.lensName}
                        </div>
                        <div style={css('font-size:10.5px; color:rgba(255,255,255,.4); margin-top:3px;')}>Ready to search by image</div>
                      </div>
                      <Box
                        onClick={() => set({ lensImage: null, lensName: '', lensPinned: false, lensDrag: false })}
                        title="Remove"
                        sx="font-family:'Material Symbols Rounded'; line-height:1; font-size:16px; color:rgba(255,255,255,.4); cursor:pointer; flex-shrink:0;"
                        hover="color:rgba(255,140,130,.95)"
                      >
                        close
                      </Box>
                      <Box
                        onClick={() => open('https://lens.google.com/upload')}
                        sx="background:rgba(76,141,255,.95); border-radius:10px; padding:9px 16px; font-size:11.5px; font-weight:600; cursor:pointer; flex-shrink:0; white-space:nowrap;"
                        hover="background:rgba(96,157,255,1)"
                      >
                        Search
                      </Box>
                    </div>
                  )}
                </div>
              )}

              {hasSuggest && (
                <div
                  style={css(
                    'position:absolute; left:0; right:0; top:calc(100% + 8px); background:rgba(16,21,30,.94); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,.12); border-radius:14px; box-shadow:0 18px 46px rgba(0,0,0,.5); overflow:hidden; z-index:19; padding:6px; animation:rise .12s ease-out;',
                  )}
                >
                  {suggestions.map((sg, i) => (
                    <Box
                      key={i}
                      onMouseDown={sg.onPick}
                      sx="display:flex; align-items:center; gap:11px; padding:9px 11px; border-radius:10px; cursor:pointer;"
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
                      onClick={() => set({ engine: name, enginesOpen: false, lensPinned: false, lensImage: null, lensName: '' })}
                      sx="padding:9px 12px; border-radius:9px; font-size:12.5px; font-weight:500; color:rgba(255,255,255,.8); cursor:pointer;"
                      hover="background:rgba(255,255,255,.09)"
                    >
                      {name === 'Images' ? 'Google Images' : name}
                    </Box>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right cluster */}
          <div data-tour="toolbar" style={css('display:flex; align-items:center; gap:8px; flex-shrink:0;')}>
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

        {/* Body grid */}
        <div
          style={css(
            'flex:1; min-height:0; display:grid; grid-template-columns:minmax(190px,15.5vw) minmax(0,1fr) minmax(250px,20vw); gap:clamp(12px,1.4vw,24px);',
          )}
        >
          {/* Left rail */}
          <div style={css('display:flex; flex-direction:column; gap:clamp(10px,1.2vh,16px); min-height:0;')}>
            <div
              data-tour="notes"
              style={css(
                'flex: 1.3; min-height: 0; background: rgba(9,13,20,.34); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.1); border-radius: 18px; box-shadow: 0 8px 30px rgba(0,0,0,.26); padding: clamp(12px,1.6vh,16px); display: flex; flex-direction: column; gap: 10px; overflow: hidden',
              )}
            >
              <div style={css('display:flex; align-items:center; justify-content:space-between; flex-shrink:0;')}>
                <div style={css('display:flex; align-items:center; gap:8px;')}>
                  <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(255,255,255,.5);")}>
                    sticky_note_2
                  </span>
                  <span style={css('font-size:clamp(12px,1.6vh,14px); font-weight:600;')}>Notes</span>
                </div>
                <Box
                  onClick={() => {
                    const id = Date.now()
                    set((st) => ({ notes: [...st.notes, { id, title: '', text: '' }], modal: 'note', activeNote: id }))
                  }}
                  sx="width:22px; height:22px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:14px; color:rgba(255,255,255,.5); cursor:pointer;"
                  hover="background:rgba(255,255,255,.1); color:#fff"
                >
                  +
                </Box>
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
                  <div
                    onClick={() => {
                      const id = Date.now()
                      set((st) => ({ notes: [...st.notes, { id, title: '', text: '' }], modal: 'note', activeNote: id }))
                    }}
                    style={css('font-size:12px; color:rgba(255,255,255,.35); cursor:pointer; line-height:1.6; padding:2px;')}
                  >
                    Nothing captured yet. Tap + to start a note.
                  </div>
                )}
              </div>
            </div>

            {/* Habits mini */}
            <div
              data-tour="habits"
              style={css(
                'flex:1; min-height:0; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:18px; box-shadow:0 8px 32px rgba(0,0,0,.3); padding:clamp(12px,1.6vh,16px); display:flex; flex-direction:column; gap:10px;',
              )}
            >
              <div style={css('display:flex; align-items:center; justify-content:space-between; flex-shrink:0;')}>
                <div style={css('display:flex; align-items:center; gap:8px;')}>
                  <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(255,255,255,.5);")}>repeat</span>
                  <span style={css('font-size:clamp(12px,1.6vh,14px); font-weight:600;')}>Habits</span>
                </div>
                <div onClick={() => openModal('habits')} style={css('font-size:11px; font-weight:600; color:rgba(124,160,255,.9); cursor:pointer;')}>
                  Open
                </div>
              </div>
              <div style={css('display:flex; gap:3px; flex-shrink:0; padding-left:1px;')}>
                {habitCols.map((c, i) => (
                  <div key={i} style={css('flex:1; text-align:center; font-size:8px; font-weight:600; letter-spacing:.06em; color:rgba(255,255,255,.28);')}>
                    {c}
                  </div>
                ))}
              </div>
              <div style={css('flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:10px;')}>
                {habitRows.map((h) => (
                  <div key={h.id} style={css('display:flex; flex-direction:column; gap:5px; flex-shrink:0;')}>
                    <div style={css('display:flex; align-items:baseline; justify-content:space-between; gap:6px;')}>
                      <span
                        style={css(
                          'font-size:clamp(10px,1.3vh,11.5px); font-weight:500; color:rgba(255,255,255,.72); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;',
                        )}
                      >
                        {h.name}
                      </span>
                      <span style={css('font-size:9.5px; font-weight:600; color:rgba(255,255,255,.4); flex-shrink:0;')}>
                        {h.streak > 0 ? h.streak + 'd' : '—'}
                      </span>
                    </div>
                    <div style={css('display:flex; gap:3px;')}>
                      {h.days.map((on, di) => (
                        <div
                          key={di}
                          onClick={() =>
                            set((st) => ({
                              habits: st.habits.map((x) =>
                                x.id === h.id ? { ...x, days: x.days.map((v, k) => (k === di ? !v : v)) } : x,
                              ),
                            }))
                          }
                          style={{
                            flex: 1,
                            height: 15,
                            borderRadius: 4,
                            cursor: 'pointer',
                            background: on ? 'rgba(76,141,255,.75)' : 'rgba(255,255,255,.08)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {habitRows.length === 0 && (
                  <div onClick={() => openModal('habits')} style={css('font-size:11.5px; color:rgba(255,255,255,.35); cursor:pointer;')}>
                    No habits yet. Add one.
                  </div>
                )}
              </div>
            </div>

            <div style={css('flex-shrink:0; display:flex; align-items:center; gap:10px;')}>
              <Box
                onClick={() => openModal('todo')}
                title="To-do list"
                sx="width:38px; height:38px; border-radius:50%; flex-shrink:0; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.12); box-shadow:0 6px 20px rgba(0,0,0,.28); display:flex; align-items:center; justify-content:center; font-size:15px; color:rgba(255,255,255,.7); cursor:pointer; font-family:'Material Symbols Rounded'; line-height:1;"
                hover="background:rgba(255,255,255,.14); color:#fff"
              >
                checklist
              </Box>
              <div onClick={() => openModal('todo')} style={css('font-size:11px; font-weight:500; color:rgba(255,255,255,.4); cursor:pointer;')}>
                {visibleTasks.length + (s.filter === 'done' ? ' done' : ' to do')}
              </div>
            </div>
          </div>

          {/* Boards */}
          <div data-tour="boards" style={css('display:flex; flex-direction:column; gap:clamp(8px,1.1vh,13px); min-width:0; min-height:0;')}>
            <div style={css('display:flex; align-items:center; gap:12px; flex-shrink:0;')}>
              <span style={css('font-size:10.5px; font-weight:600; letter-spacing:.22em; color:rgba(255,255,255,.4);')}>BOARDS</span>
              <Box
                onClick={() => openModal('board', { dBoardName: '', bmReturn: false })}
                sx="display:flex; align-items:center; gap:6px; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:11px; padding:6px 13px; font-size:12px; font-weight:600; color:rgba(255,255,255,.85); cursor:pointer;"
                hover="background:rgba(255,255,255,.13)"
              >
                + Add board
              </Box>
              <span style={css('font-size:11px; color:rgba(255,255,255,.3); margin-left:auto;')}>
                {pageBoards.length + ' boards · ' + bmCount + ' bookmarks'}
              </span>
            </div>
            <div
              style={css(
                'flex:1; min-height:0; overflow-y:auto; padding-right:6px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:clamp(12px,1.3vw,20px); align-content:start;',
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
                      'height:clamp(188px,25vh,248px); background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:18px; box-shadow:0 8px 32px rgba(0,0,0,.3); padding:clamp(11px,1.5vh,15px); display:flex; flex-direction:column; gap:8px; min-width:0;',
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
                      onDoubleClick={() => renameBoardH(b.id, b.name)}
                      title={b.id === '1' ? '' : 'Double-click to rename'}
                      style={css(
                        'flex:1; min-width:0; font-size:clamp(11.5px,1.5vh,13.5px); font-weight:600; color:rgba(255,255,255,.92); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:' +
                          (b.id === '1' ? 'default' : 'text') +
                          ';',
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
                    <Box
                      onClick={() => deleteBoard(b.id)}
                      title="Delete board"
                      sx="font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(255,255,255,.32); cursor:pointer; flex-shrink:0;"
                      hover="color:rgba(255,140,130,.95)"
                    >
                      delete_outline
                    </Box>
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
          </div>

          {/* Right rail */}
          <div style={css('display:flex; flex-direction:column; gap:clamp(10px,1.2vh,16px); min-height:0;')}>
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
                <Box
                  onClick={() => set({ monthOffset: s.monthOffset + 1 })}
                  sx="width:22px; height:22px; border-radius:7px; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.5); cursor:pointer;"
                  hover="background:rgba(255,255,255,.1); color:#fff"
                >
                  <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px;")}>chevron_right</span>
                </Box>
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
                        ? () => set({ dateOpen: d.dayIso, dnFormOpen: false, dnEditing: null, dnTitle: '', dnDesc: '', dnCat: 'Personal' })
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
                    {d.has && (
                      <div
                        style={{
                          position: 'absolute',
                          left: '50%',
                          bottom: 2,
                          transform: 'translateX(-50%)',
                          width: 3,
                          height: 3,
                          borderRadius: '50%',
                          background: d.today ? '#fff' : 'rgba(124,160,255,.95)',
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming tasks */}
            <div
              data-tour="tasks"
              style={css(
                'flex:1; min-height:0; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:18px; box-shadow:0 8px 32px rgba(0,0,0,.3); display:flex; flex-direction:column;',
              )}
            >
              <div style={css('padding:clamp(11px,1.5vh,15px) clamp(12px,1.5vh,16px) 10px; display:flex; align-items:center; gap:8px; flex-shrink:0;')}>
                <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(255,255,255,.5);")}>schedule</span>
                <span style={css('font-size:clamp(12px,1.6vh,14px); font-weight:600;')}>Upcoming</span>
                <span style={css('margin-left:auto; font-size:11px; font-weight:600; color:rgba(255,255,255,.4);')}>
                  {visibleTasks.length + (s.filter === 'done' ? ' done' : ' open')}
                </span>
              </div>
              <div style={css('display:flex; gap:5px; padding:0 clamp(12px,1.5vh,16px) 11px; flex-wrap:wrap; flex-shrink:0;')}>
                {(['all', 'today', 'upcoming', 'done'] as const).map((key) => (
                  <div
                    key={key}
                    onClick={() => set({ filter: key })}
                    style={{
                      fontSize: 9.5,
                      fontWeight: 600,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      padding: '5px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: s.filter === key ? 'rgba(255,255,255,.14)' : 'transparent',
                      color: s.filter === key ? '#fff' : 'rgba(255,255,255,.42)',
                    }}
                  >
                    {key[0].toUpperCase() + key.slice(1)}
                  </div>
                ))}
              </div>
              <div style={css('flex:1; min-height:0; overflow-y:auto; border-top:1px solid rgba(255,255,255,.07); padding:4px;')}>
                {visibleTasks.map((t) => {
                  const p = prioMeta[t.priority] || prioMeta.medium
                  const d = new Date(t.due + 'T00:00')
                  return (
                    <Box key={t.id} sx="display:flex; align-items:flex-start; gap:10px; padding:9px 10px; border-radius:11px;" hover="background:rgba(255,255,255,.06)">
                      <div
                        onClick={() =>
                          set((st) => ({ tasks: st.tasks.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)) }))
                        }
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
                            fontSize: 'clamp(11.5px,1.5vh,13px)',
                            fontWeight: 500,
                            lineHeight: 1.4,
                            color: t.completed ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.9)',
                            textDecoration: t.completed ? 'line-through' : 'none',
                          }}
                        >
                          {t.title}
                        </div>
                        <div style={css('display:flex; gap:6px; margin-top:5px; flex-wrap:wrap; align-items:center;')}>
                          <span style={css('font-size:9.5px; font-weight:500; color:rgba(255,255,255,.4); white-space:nowrap;')}>
                            {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + (t.time ? ' · ' + t.time : '')}
                          </span>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 600,
                              padding: '2px 7px',
                              borderRadius: 5,
                              whiteSpace: 'nowrap',
                              background: p.bg,
                              color: p.fg,
                            }}
                          >
                            {t.priority}
                          </span>
                        </div>
                      </div>
                      <Box
                        onClick={() => withUndo('Task deleted', ['tasks'], (st) => ({ tasks: st.tasks.filter((x) => x.id !== t.id) }))}
                        sx="font-size:11px; color:rgba(255,255,255,.22); cursor:pointer; padding-top:2px;"
                        hover="color:rgba(255,140,130,.95)"
                      >
                        <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:14px;")}>close</span>
                      </Box>
                    </Box>
                  )
                })}
                {visibleTasks.length === 0 && (
                  <div style={css('padding:30px 16px; text-align:center; font-size:12px; color:rgba(255,255,255,.32);')}>{emptyTaskLine}</div>
                )}
              </div>
              <Box
                onClick={() => openModal('task', { dTitle: '', dDue: todayIso, dTime: '', dPrio: 'medium', dRemind: 'none' })}
                sx="margin:clamp(9px,1.2vh,12px); background:rgba(76,141,255,.95); border-radius:12px; text-align:center; padding:10px; font-size:12.5px; font-weight:600; color:#fff; cursor:pointer; flex-shrink:0;"
                hover="background:rgba(96,157,255,1)"
              >
                + New task
              </Box>
            </div>
          </div>
        </div>
      </div>

      {/* Utility toolbar */}
      <div
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
          onClick={() => set({ dateOpen: null, dnFormOpen: false, dnEditing: null })}
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
                <span style={css('font-size:10px; font-weight:600; letter-spacing:.2em; color:rgba(255,255,255,.42);')}>DATE NOTES</span>
                <span style={css('font-size:19px; font-weight:700;')}>
                  {new Date(s.dateOpen + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <Box
                onClick={() => set({ dateOpen: null, dnFormOpen: false, dnEditing: null })}
                sx="width:28px; height:28px; border-radius:9px; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.5); cursor:pointer;"
                hover="background:rgba(255,255,255,.1); color:#fff"
              >
                <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>close</span>
              </Box>
            </div>

            <div style={css('flex:1; min-height:0; overflow-y:auto; padding:18px 22px; display:flex; flex-direction:column; gap:14px;')}>
              {s.dnFormOpen && (
                <div
                  style={css(
                    'background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.16); border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:14px;',
                  )}
                >
                  <div style={css('display:flex; flex-direction:column; gap:7px;')}>
                    <label style={css('font-size:10px; font-weight:600; letter-spacing:.16em; color:rgba(255,255,255,.45);')}>TITLE</label>
                    <input value={s.dnTitle} onChange={(e) => set({ dnTitle: e.target.value })} placeholder="Note title" style={css('padding:11px 13px; font-size:13.5px;')} />
                  </div>
                  <div style={css('display:flex; flex-direction:column; gap:7px;')}>
                    <label style={css('font-size:10px; font-weight:600; letter-spacing:.16em; color:rgba(255,255,255,.45);')}>DESCRIPTION</label>
                    <textarea
                      value={s.dnDesc}
                      onChange={(e) => set({ dnDesc: e.target.value })}
                      placeholder="Write details..."
                      style={css('padding:12px 13px; min-height:110px; resize:vertical; font-size:13px; line-height:1.65;')}
                    />
                  </div>
                  <div style={css('display:flex; flex-direction:column; gap:9px;')}>
                    <label style={css('font-size:10px; font-weight:600; letter-spacing:.16em; color:rgba(255,255,255,.45);')}>CATEGORY</label>
                    <div style={css('display:flex; gap:8px; flex-wrap:wrap;')}>
                      {CATS.map((c) => (
                        <div
                          key={c.name}
                          onClick={() => set({ dnCat: c.name })}
                          style={{
                            fontSize: 12.5,
                            fontWeight: 500,
                            padding: '8px 15px',
                            borderRadius: 999,
                            cursor: 'pointer',
                            background: c.color + '22',
                            color: s.dnCat === c.name ? '#fff' : 'rgba(255,255,255,.72)',
                            border: '1px solid ' + (s.dnCat === c.name ? 'rgba(255,255,255,.85)' : 'transparent'),
                          }}
                        >
                          {c.name}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={css('display:flex; align-items:center; justify-content:flex-end; gap:10px;')}>
                    <div onClick={() => set({ dnFormOpen: false, dnEditing: null })} style={css('padding:10px 14px; font-size:13px; font-weight:500; color:rgba(255,255,255,.6); cursor:pointer;')}>
                      Cancel
                    </div>
                    <Box
                      onClick={() => {
                        if (!s.dnTitle.trim()) return
                        set((st) => {
                          const key = st.dateOpen!
                          const now = Date.now()
                          const list = (st.dateNotes[key] || []).slice()
                          if (st.dnEditing) {
                            const idx = list.findIndex((x) => x.id === st.dnEditing)
                            if (idx > -1) list[idx] = { ...list[idx], title: st.dnTitle.trim(), desc: st.dnDesc, category: st.dnCat, updated: now }
                          } else {
                            list.push({ id: now, title: st.dnTitle.trim(), desc: st.dnDesc, category: st.dnCat, created: now, updated: now })
                          }
                          return {
                            dateNotes: { ...st.dateNotes, [key]: list },
                            dnFormOpen: false,
                            dnEditing: null,
                            dnTitle: '',
                            dnDesc: '',
                            dnCat: 'Personal',
                          }
                        })
                      }}
                      sx="background:rgba(76,141,255,.95); border-radius:11px; padding:11px 22px; font-size:13px; font-weight:600; cursor:pointer;"
                      hover="background:rgba(96,157,255,1)"
                    >
                      {s.dnEditing ? 'Save note' : 'Add note'}
                    </Box>
                  </div>
                </div>
              )}

              {dayList.map((n) => (
                <div
                  key={n.id}
                  style={css('background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.16); border-radius:14px; padding:16px 17px; display:flex; flex-direction:column; gap:11px;')}
                >
                  <div style={css('display:flex; align-items:flex-start; gap:10px;')}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: catColor(n.category) }} />
                    <div style={css('min-width:0; flex:1;')}>
                      <div style={css('font-size:14px; font-weight:600; color:rgba(255,255,255,.95);')}>{n.title}</div>
                      <div style={css('font-size:11px; color:rgba(255,255,255,.45); margin-top:2px;')}>{n.category}</div>
                    </div>
                  </div>
                  {n.desc && n.desc.trim() && (
                    <div style={css('font-size:13px; line-height:1.65; color:rgba(255,255,255,.75); border-top:1px solid rgba(255,255,255,.08); padding-top:11px; white-space:pre-wrap;')}>
                      {n.desc}
                    </div>
                  )}
                  <div style={css('font-size:10.5px; color:rgba(255,255,255,.32);')}>
                    {'Created ' + stamp(n.created) + ' · Updated ' + stamp(n.updated)}
                  </div>
                  <div style={css('display:flex; gap:18px; padding-top:2px;')}>
                    <Box
                      onClick={() => set({ dnFormOpen: true, dnEditing: n.id, dnTitle: n.title, dnDesc: n.desc, dnCat: n.category })}
                      sx="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:500; color:rgba(255,255,255,.7); cursor:pointer;"
                      hover="color:#fff"
                    >
                      <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>edit</span> Edit
                    </Box>
                    <Box
                      onClick={() =>
                        set({ modal: 'task', dTitle: n.title, dDue: s.dateOpen!, dTime: '', dPrio: 'medium', dRemind: '15', dateOpen: null })
                      }
                      sx="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:500; color:rgba(255,255,255,.7); cursor:pointer;"
                      hover="color:#fff"
                    >
                      <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>notifications</span> Reminder
                    </Box>
                    <Box
                      onClick={() =>
                        withUndo('Note deleted', ['dateNotes'], (st) => {
                          const key = st.dateOpen!
                          return { dateNotes: { ...st.dateNotes, [key]: (st.dateNotes[key] || []).filter((x) => x.id !== n.id) } }
                        })
                      }
                      sx="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:500; color:rgba(248,113,113,.9); cursor:pointer;"
                      hover="color:rgba(252,165,165,1)"
                    >
                      <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>delete</span> Delete
                    </Box>
                  </div>
                </div>
              ))}

              {dayList.length === 0 && !s.dnFormOpen && (
                <div style={css('border:1px dashed rgba(255,255,255,.16); border-radius:14px; padding:44px 20px; text-align:center; font-size:13.5px; color:rgba(255,255,255,.4);')}>
                  No notes or reminders for this day yet.
                </div>
              )}
            </div>

            <div style={css('padding:16px 22px 20px; border-top:1px solid rgba(255,255,255,.08); flex-shrink:0;')}>
              <Box
                onClick={() => set({ dnFormOpen: true, dnEditing: null, dnTitle: '', dnDesc: '', dnCat: 'Personal' })}
                sx="background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:14px; text-align:center; font-size:13.5px; font-weight:600; color:rgba(255,255,255,.9); cursor:pointer;"
                hover="background:rgba(255,255,255,.12)"
              >
                + Add note
              </Box>
            </div>
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
                {s.modal === 'bookmark' && s.dBmId ? 'Edit bookmark' : titles[s.modal] || ''}
              </div>
              <Box
                onClick={closeModal}
                sx="width:26px; height:26px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.5); cursor:pointer;"
                hover="background:rgba(255,255,255,.1); color:#fff"
              >
                <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>close</span>
              </Box>
            </div>

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
                    <option value="upcoming">Upcoming</option>
                    <option value="done">Completed</option>
                    <option value="all">All open</option>
                  </select>
                  <span style={css('font-size:11.5px; color:rgba(255,255,255,.4);')}>
                    {visibleTasks.length + (s.filter === 'done' ? ' done' : ' open')}
                  </span>
                  <div
                    onClick={() => openModal('task', { dTitle: '', dDue: todayIso, dTime: '', dPrio: 'medium', dRemind: 'none' })}
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
                          onClick={() => set((st) => ({ tasks: st.tasks.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)) }))}
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
                </div>
                <div style={css('display:flex; justify-content:flex-end; gap:8px; margin-top:2px;')}>
                  <div onClick={closeModal} style={css('padding:10px 16px; font-size:12.5px; font-weight:600; color:rgba(255,255,255,.55); cursor:pointer;')}>
                    Cancel
                  </div>
                  <div
                    onClick={() => {
                      if (!s.dTitle.trim()) return
                      set((st) => ({
                        tasks: [
                          ...st.tasks,
                          { id: Date.now(), title: st.dTitle.trim(), due: st.dDue || todayIso, time: st.dTime, priority: st.dPrio, completed: false },
                        ],
                        modal: null,
                        filter: (st.dDue || todayIso) > todayIso ? 'upcoming' : 'today',
                      }))
                    }}
                    style={css('background:rgba(76,141,255,.95); border-radius:11px; padding:10px 20px; font-size:12.5px; font-weight:600; cursor:pointer;')}
                  >
                    Add task
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
                    Create board
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
                <input value={s.bmQuery} onChange={(e) => set({ bmQuery: e.target.value })} placeholder="Search bookmarks, URLs, boards..." style={css('padding:12px 14px; font-size:13.5px;')} />
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
              <div style={css('display:flex; flex-direction:column; gap:14px;')}>
                <div style={css('font-size:12px; color:rgba(255,255,255,.42);')}>Last 7 days · click a cell to mark it complete</div>
                <div style={css('overflow-x:auto;')}>
                  <div style={css('display:grid; grid-template-columns:minmax(140px,1fr) repeat(7,34px) 46px 26px; gap:6px; align-items:center; min-width:460px;')}>
                    <div />
                    {habitCols.map((c, i) => (
                      <div key={i} style={css('font-size:9px; font-weight:600; letter-spacing:.1em; color:rgba(255,255,255,.35); text-align:center;')}>
                        {c}
                      </div>
                    ))}
                    <div style={css('font-size:9px; font-weight:600; letter-spacing:.1em; color:rgba(255,255,255,.35); text-align:center;')}>STREAK</div>
                    <div />
                    {habitRows.map((h) => (
                      <div key={h.id} style={{ display: 'contents' }}>
                        <input
                          value={h.name}
                          onChange={(e) => {
                            const v = e.target.value
                            set((st) => ({ habits: st.habits.map((x) => (x.id === h.id ? { ...x, name: v } : x)) }))
                          }}
                          onBlur={(e) => {
                            if (!e.target.value.trim())
                              set((st) => ({ habits: st.habits.map((x) => (x.id === h.id ? { ...x, name: 'Untitled habit' } : x)) }))
                          }}
                          aria-label="Habit name"
                          style={css(
                            'width:100%; border:0; background:transparent; border-radius:6px; padding:5px 6px; font-size:12.5px; font-weight:500; color:rgba(255,255,255,.9);',
                          )}
                        />
                        {h.days.map((on, di) => (
                          <div
                            key={di}
                            onClick={() =>
                              set((st) => ({
                                habits: st.habits.map((x) => (x.id === h.id ? { ...x, days: x.days.map((v, k) => (k === di ? !v : v)) } : x)),
                              }))
                            }
                            style={{
                              width: 34,
                              height: 28,
                              borderRadius: 8,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontFamily: 'Material Symbols Rounded',
                              fontSize: 15,
                              lineHeight: 1,
                              color: '#fff',
                              border: '1px solid ' + (on ? 'rgba(76,141,255,.95)' : 'rgba(255,255,255,.14)'),
                              background: on ? 'rgba(76,141,255,.55)' : 'rgba(255,255,255,.05)',
                            }}
                          >
                            {on ? 'check' : ''}
                          </div>
                        ))}
                        <div style={css('font-size:11.5px; font-weight:600; color:rgba(124,160,255,.95); text-align:center;')}>{h.streak}</div>
                        <Box
                          onClick={() =>
                            withUndo('Habit deleted', ['habits'], (st) => ({ habits: st.habits.filter((x) => x.id !== h.id) }))
                          }
                          title="Delete habit"
                          sx="display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:15px; color:rgba(255,255,255,.3); cursor:pointer;"
                          hover="color:rgba(255,140,130,.95)"
                        >
                          delete_outline
                        </Box>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={css('display:flex; gap:9px; align-items:center; border-top:1px solid rgba(255,255,255,.09); padding-top:14px;')}>
                  <input value={s.dHabit} onChange={(e) => set({ dHabit: e.target.value })} placeholder="New habit — e.g. Sleep 8 hours" style={css('flex:1; padding:11px 13px; font-size:13px;')} />
                  <div
                    onClick={() => {
                      if (!s.dHabit.trim()) return
                      set((st) => ({
                        habits: [...st.habits, { id: Date.now(), name: st.dHabit.trim(), days: [false, false, false, false, false, false, false] }],
                        dHabit: '',
                      }))
                    }}
                    style={css('background:rgba(76,141,255,.95); border-radius:11px; padding:11px 17px; font-size:12.5px; font-weight:600; cursor:pointer; white-space:nowrap;')}
                  >
                    Add habit
                  </div>
                </div>
              </div>
            )}

            {s.modal === 'import' && (
              <div style={css('display:flex; flex-direction:column; gap:16px;')}>
                <div style={css('background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); border-radius:13px; padding:14px; display:flex; flex-direction:column; gap:8px;')}>
                  <div style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>CURRENT DATA</div>
                  {[
                    ['Boards', s.boards.length],
                    ['Bookmarks', bmCount],
                    ['Notes', s.notes.length],
                    ['Tasks', s.tasks.length],
                    ['Habits', s.habits.length],
                  ].map(([label, value]) => (
                    <div key={label} style={css('display:flex; justify-content:space-between; font-size:12.5px; color:rgba(255,255,255,.7);')}>
                      <span>{label}</span>
                      <span style={css('font-weight:600; color:#fff;')}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={css('display:flex; gap:10px;')}>
                  <div onClick={doExport} style={css('flex:1; text-align:center; background:rgba(76,141,255,.95); border-radius:11px; padding:11px; font-size:12.5px; font-weight:600; cursor:pointer;')}>
                    Export JSON
                  </div>
                  <Box
                    as="label"
                    sx="flex:1; text-align:center; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); border-radius:11px; padding:11px; font-size:12.5px; font-weight:600; cursor:pointer;"
                    hover="background:rgba(255,255,255,.14)"
                  >
                    Import file…
                    <input
                      type="file"
                      accept="application/json,.json,text/html,.html,.htm"
                      onChange={onImportFile}
                      style={{ display: 'none' }}
                    />
                  </Box>
                </div>
                {s.importError && <div style={css('font-size:12px; color:rgba(255,138,128,.95); line-height:1.6;')}>{s.importError}</div>}

                {s.importPreview && parsed && (
                  <div style={css('border:1px dashed rgba(255,255,255,.22); border-radius:13px; padding:14px; display:flex; flex-direction:column; gap:11px;')}>
                    <div style={css('display:flex; align-items:center; gap:8px;')}>
                      <span style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>DETECTED</span>
                      <span style={css('font-size:12px; font-weight:600; color:#fff;')}>{parsed.source}</span>
                      {parsed.confidence === 'heuristic' && (
                        <span style={css('font-size:9.5px; font-weight:700; letter-spacing:.06em; padding:2px 7px; border-radius:5px; background:rgba(251,191,36,.16); color:rgba(253,214,110,.95);')}>
                          BEST GUESS
                        </span>
                      )}
                    </div>

                    {(() => {
                      const bmTotal = parsed.boards.reduce((a, b) => a + b.bookmarks.length, 0)
                      const rows: [string, number][] = [
                        ['Boards', parsed.boards.length],
                        ['Bookmarks', bmTotal],
                        ['Notes', parsed.notes.length],
                        ['Tasks', parsed.tasks.length],
                        ['Habits', parsed.habits.length],
                        ['Journal entries', parsed.journal.length],
                      ]
                      return (
                        <div style={css('display:flex; flex-direction:column; gap:5px;')}>
                          {rows
                            .filter(([, n]) => n > 0)
                            .map(([label, n]) => (
                              <div key={label} style={css('display:flex; justify-content:space-between; font-size:12px; color:rgba(255,255,255,.72);')}>
                                <span>{label}</span>
                                <span style={css('font-weight:600; color:#fff;')}>+{n}</span>
                              </div>
                            ))}
                        </div>
                      )
                    })()}

                    {parsed.boards.length > 0 && (
                      <div style={css('max-height:120px; overflow-y:auto; display:flex; flex-direction:column; gap:3px; border-top:1px solid rgba(255,255,255,.08); padding-top:9px;')}>
                        {parsed.boards.map((b, i) => (
                          <div key={i} style={css('display:flex; justify-content:space-between; font-size:11px; color:rgba(255,255,255,.6);')}>
                            <span style={css('overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}>{b.name}</span>
                            <span style={css('flex-shrink:0; color:rgba(255,255,255,.4);')}>{b.bookmarks.length}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {parsed.warnings.length > 0 && (
                      <div style={css('border-top:1px solid rgba(255,255,255,.08); padding-top:9px; display:flex; flex-direction:column; gap:4px;')}>
                        {parsed.warnings.map((w, i) => (
                          <div key={i} style={css('font-size:10.5px; color:rgba(253,214,110,.9); line-height:1.5;')}>
                            • {w}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={css('font-size:10.5px; color:rgba(255,255,255,.4); line-height:1.5;')}>
                      Bookmarks merge into boards of the same name; duplicate URLs and already-present notes/tasks/habits are
                      skipped. Your existing data is kept.
                    </div>

                    <div style={css('display:flex; justify-content:flex-end; gap:8px;')}>
                      <div
                        onClick={() => {
                          setParsed(null)
                          set({ importPreview: false })
                        }}
                        style={css('padding:8px 14px; font-size:12px; font-weight:600; color:rgba(255,255,255,.55); cursor:pointer;')}
                      >
                        Cancel
                      </div>
                      <div
                        onClick={() => !importing && void confirmImport()}
                        style={{
                          ...css('background:rgba(76,141,255,.95); border-radius:10px; padding:8px 16px; font-size:12px; font-weight:600; cursor:pointer;'),
                          opacity: importing ? 0.6 : 1,
                        }}
                      >
                        {importing ? 'Importing…' : 'Import'}
                      </div>
                    </div>
                  </div>
                )}

                <div style={css('font-size:11px; color:rgba(255,255,255,.35); line-height:1.6;')}>
                  Everything stays on this device. Import understands Jarvis backups, Boardmarks exports, browser
                  bookmark HTML files (Chrome / Firefox / Safari / Edge), Chrome's Bookmarks file, and makes a best-effort
                  pass at other JSON exports.
                </div>
              </div>
            )}

            {s.modal === 'settings' && (
              <div style={css('display:flex; flex-direction:column; gap:18px; max-height:62vh; overflow-y:auto;')}>
                <div style={css('display:flex; flex-direction:column; gap:11px;')}>
                  <div style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>APPEARANCE</div>
                  <div style={css('display:flex; align-items:center; justify-content:space-between; gap:14px;')}>
                    <span style={css('font-size:12.5px; color:rgba(255,255,255,.78);')}>Background image / GIF</span>
                    <div style={css('display:flex; gap:8px;')}>
                      <Box as="label" sx="position:relative; background:rgba(76,141,255,.95); border-radius:9px; padding:7px 13px; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap; overflow:hidden;">
                        Upload…
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/*"
                          onChange={onBgFile}
                          style={css('position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; border:0; background:transparent; padding:0;')}
                        />
                      </Box>
                      {s.bgImage && (
                        <Box
                          onClick={() => set({ bgImage: null })}
                          sx="background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); border-radius:9px; padding:7px 13px; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap;"
                          hover="background:rgba(255,255,255,.14)"
                        >
                          Remove
                        </Box>
                      )}
                    </div>
                  </div>
                  <div style={css('font-size:11px; color:rgba(255,255,255,.35); line-height:1.6;')}>
                    Pick any photo or GIF from your computer. Panels stay legible on any wallpaper.
                  </div>
                </div>
                <div style={css('display:flex; flex-direction:column; gap:11px; border-top:1px solid rgba(255,255,255,.09); padding-top:16px;')}>
                  <div style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>CLOCK &amp; SEARCH</div>
                  <div style={css('display:flex; align-items:center; justify-content:space-between; gap:14px;')}>
                    <span style={css('font-size:12.5px; color:rgba(255,255,255,.78);')}>24-hour time</span>
                    <div
                      onClick={() => set({ h24: !s.h24 })}
                      style={{
                        width: 40,
                        height: 22,
                        borderRadius: 11,
                        cursor: 'pointer',
                        padding: 2,
                        display: 'flex',
                        alignItems: 'center',
                        background: s.h24 ? 'rgba(76,141,255,.95)' : 'rgba(255,255,255,.14)',
                        justifyContent: s.h24 ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
                    </div>
                  </div>
                  <div style={css('display:flex; align-items:center; justify-content:space-between; gap:14px;')}>
                    <span style={css('font-size:12.5px; color:rgba(255,255,255,.78);')}>Default search engine</span>
                    <select value={s.engine} onChange={(e) => set({ engine: e.target.value as State['engine'] })} style={css('padding:8px 11px; font-size:12px;')}>
                      <option value="Google">Google</option>
                      <option value="Images">Google Images</option>
                      <option value="Bing">Bing</option>
                      <option value="DuckDuckGo">DuckDuckGo</option>
                      <option value="YouTube">YouTube</option>
                    </select>
                  </div>
                </div>
                <div style={css('display:flex; flex-direction:column; gap:11px; border-top:1px solid rgba(255,255,255,.09); padding-top:16px;')}>
                  <div style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>GOOGLE APPS</div>
                  <div style={css('display:flex; align-items:center; gap:12px;')}>
                    <div
                      onClick={() => set({ gappsOn: !s.gappsOn })}
                      style={{
                        width: 40,
                        height: 22,
                        borderRadius: 11,
                        cursor: 'pointer',
                        padding: 2,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        background: s.gappsOn ? 'rgba(76,141,255,.95)' : 'rgba(255,255,255,.14)',
                        justifyContent: s.gappsOn ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
                    </div>
                    <span style={css('font-size:12.5px; color:rgba(255,255,255,.78);')}>{s.gappsOn ? 'On' : 'Off'}</span>
                  </div>
                  <div style={css('font-size:11px; color:rgba(255,255,255,.35); line-height:1.6;')}>
                    Shows the Google Apps launcher — the grid icon next to the clock.
                  </div>
                  {s.gappsOn && (
                    <>
                      <div style={css('display:flex; align-items:center; justify-content:space-between; padding-top:4px;')}>
                        <span style={css('font-size:11px; font-weight:600; color:rgba(255,255,255,.55);')}>
                          Apps in the launcher
                        </span>
                        <div style={css('display:flex; align-items:center; gap:12px;')}>
                          <span style={css('font-size:10.5px; color:rgba(255,255,255,.35);')}>{s.gapps.length} shown</span>
                          <Box
                            onClick={() => set({ gapps: [...DEFAULT_GAPPS] })}
                            sx="font-size:11px; font-weight:600; color:rgba(150,185,255,.9); cursor:pointer;"
                            hover="color:#fff"
                          >
                            Reset
                          </Box>
                        </div>
                      </div>
                      <div style={css('display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; max-height:38vh; overflow-y:auto;')}>
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
                              sx={
                                'display:flex; align-items:center; gap:8px; padding:8px 9px; border-radius:9px; cursor:pointer; border:1px solid ' +
                                (on ? 'rgba(76,141,255,.4)' : 'rgba(255,255,255,.08)') +
                                '; background:' +
                                (on ? 'rgba(76,141,255,.12)' : 'rgba(255,255,255,.03)') +
                                ';'
                              }
                              hover="background:rgba(255,255,255,.08)"
                            >
                              <span
                                style={{
                                  fontFamily: 'Material Symbols Rounded',
                                  fontSize: 16,
                                  lineHeight: 1,
                                  flexShrink: 0,
                                  color: on ? 'rgba(120,170,255,.98)' : 'rgba(255,255,255,.28)',
                                }}
                              >
                                {on ? 'check_box' : 'check_box_outline_blank'}
                              </span>
                              <GappIcon appKey={a.key} glyph={a.glyph} tint={a.c} size={18} radius={5} />
                              <span style={css('flex:1; min-width:0; font-size:11.5px; font-weight:500; color:rgba(255,255,255,.82); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}>
                                {a.name}
                              </span>
                            </Box>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div style={css('display:flex; flex-direction:column; gap:10px; border-top:1px solid rgba(255,255,255,.09); padding-top:16px;')}>
                  <div style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>HELP</div>
                  <Box
                    onClick={() => {
                      set({ modal: null })
                      setShowTour(true)
                    }}
                    sx="align-self:flex-start; border:1px solid rgba(124,160,255,.5); color:rgba(150,185,255,.95); border-radius:10px; padding:9px 15px; font-size:12px; font-weight:600; cursor:pointer;"
                    hover="background:rgba(76,141,255,.14)"
                  >
                    Replay walkthrough
                  </Box>
                </div>
                <div style={css('display:flex; flex-direction:column; gap:10px; border-top:1px solid rgba(255,255,255,.09); padding-top:16px;')}>
                  <div style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>DATA</div>
                  <Box
                    onClick={() => set({ ...emptyLocal(), modal: null, filter: 'today', pageData: {}, pages: [{ id: 1, name: 'Home' }], activePage: 1 })}
                    sx="align-self:flex-start; border:1px solid rgba(255,138,128,.5); color:rgba(255,150,140,.95); border-radius:10px; padding:9px 15px; font-size:12px; font-weight:600; cursor:pointer;"
                    hover="background:rgba(255,120,110,.14)"
                  >
                    Reset to first run
                  </Box>
                  <div style={css('font-size:11px; color:rgba(255,255,255,.35);')}>
                    Clears notes, tasks, journal entries and habits on every page. Your Chrome bookmarks are not touched.
                  </div>
                </div>

                {FEEDBACK_URL && (
                  <div style={css('display:flex; flex-direction:column; gap:10px; border-top:1px solid rgba(255,255,255,.09); padding-top:16px;')}>
                    <div style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>BETA</div>
                    <Box
                      onClick={() => open(FEEDBACK_URL)}
                      sx="align-self:flex-start; border:1px solid rgba(124,160,255,.5); color:rgba(150,185,255,.95); border-radius:10px; padding:9px 15px; font-size:12px; font-weight:600; cursor:pointer;"
                      hover="background:rgba(76,141,255,.14)"
                    >
                      Send feedback / report a bug
                    </Box>
                  </div>
                )}
              </div>
            )}

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

            {s.modal === 'privacy' && (
              <div style={css('display:flex; flex-direction:column; gap:18px;')}>
                <div style={css('font-size:13px; color:rgba(255,255,255,.72); line-height:1.65;')}>
                  Open a private browsing window? Incognito hides activity from this device only — websites, your network and your provider can still see it.
                </div>
                {incognitoHint && <div style={css('font-size:12px; color:rgba(255,200,120,.95); line-height:1.6;')}>{incognitoHint}</div>}
                <div style={css('display:flex; justify-content:flex-end; gap:8px;')}>
                  <div onClick={closeModal} style={css('padding:10px 16px; font-size:12.5px; font-weight:600; color:rgba(255,255,255,.55); cursor:pointer;')}>
                    Cancel
                  </div>
                  <div
                    onClick={async () => {
                      const r = await openIncognito()
                      if (r === 'ok') closeModal()
                      else if (r === 'not-allowed')
                        setIncognitoHint('Enable "Allow in Incognito" for Jarvis on chrome://extensions, then try again.')
                      else setIncognitoHint('Incognito is only available when running as an extension.')
                    }}
                    style={css('border-radius:11px; padding:10px 20px; font-size:12.5px; font-weight:600; cursor:pointer; color:#fff; background:rgba(76,141,255,.95);')}
                  >
                    Open incognito
                  </div>
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
          </div>
        </div>
      )}

      {showTour && <Walkthrough onClose={() => setShowTour(false)} />}
    </div>
  )
}
