import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { css } from '../lib/css'
import { Box } from './Box'
import { LocusLogo } from './Logo'

interface Step {
  /** value of a `data-tour="…"` attribute in App.tsx; omit for a centered step */
  target?: string
  title: string
  body: string
  /** show the Locus lockup above the heading — the opening step only */
  brand?: boolean
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Locus',
    brand: true,
    body:
      "Locus is Latin for place — a point where something belongs. This quick tour points out each part of your new tab. Use Next / Back (or ← →), or Skip any time. Everything here is stored locally in your browser — no account, nothing uploaded.",
  },
  {
    target: 'pages',
    title: 'Pages',
    body:
      'Each tab is a completely separate dashboard — its own notes, tasks, habits, journal and bookmark boards. Great for keeping Work and Personal apart. Use “+ Page” to add one; double-click a tab to rename it.',
  },
  {
    target: 'search',
    title: 'Search',
    body:
      'Type and hit Enter to search. Press “/” anywhere to jump here. The dropdown switches engine (Google, Bing, DuckDuckGo, YouTube).',
  },
  {
    target: 'boards',
    title: 'Bookmark boards',
    body:
      'Your bookmarks, grouped into boards. Each board is a real Chrome bookmark folder — changes sync both ways. Boards belong to the current page; new ones land here, and the ⇄ icon in a board header moves it to another page.',
  },
  {
    target: 'notes',
    title: 'Quick Notes',
    body: 'Quick titled notes for this page. Click one to edit, use “+” to add. Nothing fancy — just somewhere to dump a thought.',
  },
  {
    target: 'calendar',
    title: 'Calendar',
    body:
      'Everything dated lives here. Click a day to tick habits, check off tasks due and write a journal entry. Coloured dots mark what each day holds; the repeat icon opens the habit tracker.',
  },
  {
    target: 'tasks',
    title: 'Tasks',
    body:
      'Your to-do list with due dates, times and priority. Filter by Today / Upcoming / Done. “+ New task” at the bottom adds one.',
  },
  {
    target: 'toolbar',
    title: 'Apps, wallpaper & settings',
    body:
      'The grid icon is a Google-apps launcher (customise it with the pencil). The wallpaper icon sets any local image or GIF as your background. The gear opens Settings — 24-hour clock, default engine, import / export, and “Replay walkthrough”.',
  },
  {
    title: "You're set",
    body:
      'That\'s the whole dashboard. The sample notes, tasks and habits are just examples — delete them and make it yours. You can run this tour again any time from Settings → Help.',
  },
]

const CARD_W = 340
const GAP = 16

type Pos = { top: number; left: number; arrow: 'up' | 'down' | 'left' | 'right' | null }

function place(rect: DOMRect, cardH: number): Pos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cx = rect.left + rect.width / 2
  const clampX = (x: number) => Math.max(12, Math.min(x, vw - CARD_W - 12))
  const clampY = (y: number) => Math.max(12, Math.min(y, vh - cardH - 12))

  // below
  if (vh - rect.bottom >= cardH + GAP + 8) {
    return { top: rect.bottom + GAP, left: clampX(cx - CARD_W / 2), arrow: 'up' }
  }
  // above
  if (rect.top >= cardH + GAP + 8) {
    return { top: rect.top - GAP - cardH, left: clampX(cx - CARD_W / 2), arrow: 'down' }
  }
  // right
  if (vw - rect.right >= CARD_W + GAP + 8) {
    return { top: clampY(rect.top + rect.height / 2 - cardH / 2), left: rect.right + GAP, arrow: 'left' }
  }
  // left
  if (rect.left >= CARD_W + GAP + 8) {
    return { top: clampY(rect.top + rect.height / 2 - cardH / 2), left: rect.left - GAP - CARD_W, arrow: 'right' }
  }
  // fallback: centred
  return { top: clampY(vh / 2 - cardH / 2), left: clampX(vw / 2 - CARD_W / 2), arrow: null }
}

export function Walkthrough({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0, arrow: null })
  const cardRef = useRef<HTMLDivElement>(null)

  const step = STEPS[i]
  const last = i === STEPS.length - 1
  const go = (n: number) => setI(Math.max(0, Math.min(STEPS.length - 1, n)))

  // measure the target element (and re-measure on resize)
  useLayoutEffect(() => {
    const measure = () => {
      const el = step.target
        ? (document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null)
        : null
      const r = el?.getBoundingClientRect() ?? null
      setRect(r && r.width > 0 ? r : null)
      const cardH = cardRef.current?.offsetHeight ?? 190
      if (r && r.width > 0) setPos(place(r, cardH))
    }
    measure()
    // a second pass once the card has its real height
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [i, step.target])

  // keyboard: Esc closes, arrows navigate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') {
        if (last) onClose()
        else go(i + 1)
      } else if (e.key === 'ArrowLeft') go(i - 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [i, last, onClose])

  const centred = !rect
  const pad = 6
  const hi = rect && {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }

  const arrowStyle = (): CSSProperties => {
    const base: CSSProperties = {
      position: 'absolute',
      width: 12,
      height: 12,
      background: 'rgba(18,23,32,.98)',
      transform: 'rotate(45deg)',
    }
    if (pos.arrow === 'up') return { ...base, top: -6, left: CARD_W / 2 - 6, borderLeft: '1px solid rgba(255,255,255,.12)', borderTop: '1px solid rgba(255,255,255,.12)' }
    if (pos.arrow === 'down') return { ...base, bottom: -6, left: CARD_W / 2 - 6, borderRight: '1px solid rgba(255,255,255,.12)', borderBottom: '1px solid rgba(255,255,255,.12)' }
    if (pos.arrow === 'left') return { ...base, left: -6, top: '50%', marginTop: -6, borderLeft: '1px solid rgba(255,255,255,.12)', borderBottom: '1px solid rgba(255,255,255,.12)' }
    if (pos.arrow === 'right') return { ...base, right: -6, top: '50%', marginTop: -6, borderRight: '1px solid rgba(255,255,255,.12)', borderTop: '1px solid rgba(255,255,255,.12)' }
    return { display: 'none' }
  }

  return (
    <div style={css('position:fixed; inset:0; z-index:250;')}>
      {/* dim / spotlight */}
      {centred ? (
        <div style={css('position:absolute; inset:0; background:rgba(6,10,16,.66); backdrop-filter:blur(3px);')} />
      ) : (
        <div
          style={{
            position: 'absolute',
            top: hi!.top,
            left: hi!.left,
            width: hi!.width,
            height: hi!.height,
            borderRadius: 14,
            border: '2px solid rgba(120,170,255,.9)',
            boxShadow: '0 0 0 9999px rgba(6,10,16,.66), 0 0 22px rgba(120,170,255,.35)',
            pointerEvents: 'none',
            transition: 'top .18s, left .18s, width .18s, height .18s',
          }}
        />
      )}

      {/* card */}
      <div
        ref={cardRef}
        style={{
          position: 'absolute',
          width: `min(${CARD_W}px, 92vw)`,
          ...(centred
            ? { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
            : { top: pos.top, left: pos.left, transition: 'top .18s, left .18s' }),
          background: 'rgba(18,23,32,.98)',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 16,
          padding: '20px 20px 16px',
          boxShadow: '0 30px 80px rgba(0,0,0,.55)',
          color: '#fff',
        }}
      >
        {!centred && <div style={arrowStyle()} />}

        {step.brand && (
          <div style={css('margin-bottom:13px; opacity:.9;')}>
            <LocusLogo size={23} color="#fff" />
          </div>
        )}

        <div style={css('display:flex; align-items:center; gap:8px; margin-bottom:9px;')}>
          <div
            style={css(
              'font-size:11px; font-weight:700; color:#8fb6ff; background:rgba(76,141,255,.16); border:1px solid rgba(76,141,255,.32); border-radius:7px; padding:2px 7px;',
            )}
          >
            {i + 1} / {STEPS.length}
          </div>
          <div style={css('font-size:15.5px; font-weight:700;')}>{step.title}</div>
        </div>

        <div style={css('font-size:12.5px; line-height:1.62; color:rgba(255,255,255,.74);')}>{step.body}</div>

        <div style={css('display:flex; align-items:center; gap:5px; margin:15px 0 13px;')}>
          {STEPS.map((_, n) => (
            <div
              key={n}
              onClick={() => go(n)}
              style={{
                width: n === i ? 16 : 6,
                height: 6,
                borderRadius: 3,
                cursor: 'pointer',
                background: n === i ? 'rgba(120,170,255,.95)' : 'rgba(255,255,255,.2)',
                transition: 'width .15s',
              }}
            />
          ))}
        </div>

        <div style={css('display:flex; align-items:center; justify-content:space-between;')}>
          <Box
            onClick={onClose}
            sx="font-size:11.5px; font-weight:600; color:rgba(255,255,255,.5); cursor:pointer; padding:7px 3px;"
            hover="color:rgba(255,255,255,.85)"
          >
            Skip tour
          </Box>
          <div style={css('display:flex; gap:7px;')}>
            {i > 0 && (
              <Box
                onClick={() => go(i - 1)}
                sx="border:1px solid rgba(255,255,255,.16); border-radius:9px; padding:8px 14px; font-size:12px; font-weight:600; cursor:pointer;"
                hover="background:rgba(255,255,255,.08)"
              >
                Back
              </Box>
            )}
            <Box
              onClick={() => (last ? onClose() : go(i + 1))}
              sx="border-radius:9px; padding:8px 17px; font-size:12px; font-weight:700; cursor:pointer; color:#fff; background:rgba(76,141,255,.95);"
              hover="background:rgba(96,157,255,.95)"
            >
              {last ? 'Done' : 'Next'}
            </Box>
          </div>
        </div>
      </div>
    </div>
  )
}
