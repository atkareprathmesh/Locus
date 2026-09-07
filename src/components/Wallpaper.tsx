import { useCallback, useEffect, useRef, useState } from 'react'
import { Box } from './Box'
import { css } from '../lib/css'

export type BgFit = 'cover' | 'contain'

export interface BgTransform {
  /** 'cover' fills the tab (crops), 'contain' fits the whole image inside it. */
  fit: BgFit
  /** Multiplier on top of the base fit scale. 1 = untouched. */
  zoom: number
  /** Pan offsets as a fraction of the displayed image size (resolution-independent). */
  x: number
  y: number
}

export const DEFAULT_BG: BgTransform = { fit: 'cover', zoom: 1, x: 0, y: 0 }

const MIN_ZOOM = 1
const MAX_ZOOM = 5

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** Viewport size, kept in sync with resizes. */
function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return vp
}

/** Natural pixel size of a data-URL image (works for GIFs too). */
function useNatural(src: string | null) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (!src) {
      setNat(null)
      return
    }
    let alive = true
    const img = new Image()
    img.onload = () => {
      if (alive) setNat({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
    }
    img.src = src
    return () => {
      alive = false
    }
  }, [src])
  return nat
}

/**
 * Where the image lands inside the tab for a given transform. Pan is clamped so
 * a 'cover' image can never be dragged far enough to expose an empty edge.
 */
function layout(
  nat: { w: number; h: number },
  vp: { w: number; h: number },
  t: BgTransform,
): { w: number; h: number; left: number; top: number; x: number; y: number } {
  const base =
    t.fit === 'cover' ? Math.max(vp.w / nat.w, vp.h / nat.h) : Math.min(vp.w / nat.w, vp.h / nat.h)
  const w = nat.w * base * t.zoom
  const h = nat.h * base * t.zoom
  // Free pan up to the amount of the image hanging outside the tab.
  const maxX = w > vp.w ? (w - vp.w) / 2 / w : 0
  const maxY = h > vp.h ? (h - vp.h) / 2 / h : 0
  const x = clamp(t.x, -maxX, maxX)
  const y = clamp(t.y, -maxY, maxY)
  return { w, h, left: (vp.w - w) / 2 + x * w, top: (vp.h - h) / 2 + y * h, x, y }
}

/** The wallpaper itself: an image positioned by the user's zoom / pan / fit. */
export function Wallpaper({ src, t }: { src: string; t: BgTransform }) {
  const vp = useViewport()
  const nat = useNatural(src)
  if (!nat) {
    return (
      <img
        src={src}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: t.fit }}
      />
    )
  }
  const l = layout(nat, vp, t)
  return (
    <>
      {t.fit === 'contain' && (
        <div style={css('position:absolute; inset:0; background:#0b1119;')} />
      )}
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: Math.round(l.left),
          top: Math.round(l.top),
          width: Math.round(l.w),
          height: Math.round(l.h),
          maxWidth: 'none',
          userSelect: 'none',
        }}
      />
    </>
  )
}

const btn =
  'background:rgba(255,255,255,.09); border:1px solid rgba(255,255,255,.14); border-radius:9px; padding:7px 13px; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap; color:#fff;'

/**
 * Full-screen editor for the wallpaper: drag to reposition, scroll or the
 * slider to zoom, Fill / Fit to switch crop mode. What you see is exactly the
 * new-tab frame, so the visible area is the crop.
 */
export function WallpaperAdjust({
  src,
  value,
  onChange,
  onDone,
}: {
  src: string
  value: BgTransform
  onChange: (t: BgTransform) => void
  onDone: () => void
}) {
  const vp = useViewport()
  const nat = useNatural(src)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const tRef = useRef(value)
  tRef.current = value

  const l = nat ? layout(nat, vp, value) : null

  // Keep the stored pan in sync with what clamping actually allows, so zooming
  // back out doesn't leave a stale offset behind.
  useEffect(() => {
    if (!l) return
    if (l.x !== value.x || l.y !== value.y) onChange({ ...value, x: l.x, y: l.y })
  })

  const setZoom = useCallback(
    (z: number) => onChange({ ...tRef.current, zoom: clamp(z, MIN_ZOOM, MAX_ZOOM) }),
    [onChange],
  )

  const onDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, x: value.x, y: value.y }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !l) return
    onChange({ ...tRef.current, x: d.x + (e.clientX - d.px) / l.w, y: d.y + (e.clientY - d.py) / l.h })
  }
  const onUp = () => {
    drag.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    setZoom(tRef.current.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))
  }

  // Keyboard: arrows nudge, +/- zoom, Esc / Enter finish.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = tRef.current
      const step = e.shiftKey ? 0.05 : 0.01
      if (e.key === 'Escape' || e.key === 'Enter') return onDone()
      if (e.key === 'ArrowLeft') onChange({ ...t, x: t.x - step })
      else if (e.key === 'ArrowRight') onChange({ ...t, x: t.x + step })
      else if (e.key === 'ArrowUp') onChange({ ...t, y: t.y - step })
      else if (e.key === 'ArrowDown') onChange({ ...t, y: t.y + step })
      else if (e.key === '+' || e.key === '=') setZoom(t.zoom * 1.1)
      else if (e.key === '-' || e.key === '_') setZoom(t.zoom / 1.1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onChange, onDone, setZoom])

  return (
    <div
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={onWheel}
      style={css(
        'position:fixed; inset:0; z-index:60; cursor:grab; touch-action:none; background:transparent;',
      )}
    >
      {/* Frame outline — everything inside it is what the new tab shows. */}
      <div
        style={css(
          'position:absolute; inset:0; box-shadow:inset 0 0 0 2px rgba(76,141,255,.75); pointer-events:none;',
        )}
      />

      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={css(
          'position:absolute; left:50%; bottom:26px; transform:translateX(-50%); display:flex; align-items:center; gap:12px; background:rgba(9,13,20,.86); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,.14); border-radius:14px; padding:11px 15px; cursor:default; color:#fff;',
        )}
      >
        <span style={css('font-size:11.5px; color:rgba(255,255,255,.6);')}>Drag to move</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={value.zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={css('width:170px; accent-color:#4c8dff; cursor:pointer;')}
        />
        <span style={css('font-size:11.5px; width:42px; color:rgba(255,255,255,.6);')}>
          {Math.round(value.zoom * 100)}%
        </span>
        <div style={css('display:flex; gap:2px; background:rgba(255,255,255,.07); border-radius:9px; padding:2px;')}>
          {(['cover', 'contain'] as BgFit[]).map((f) => (
            <Box
              key={f}
              onClick={() => onChange({ ...value, fit: f, x: 0, y: 0 })}
              sx={`border-radius:7px; padding:6px 11px; font-size:11.5px; font-weight:600; cursor:pointer; ${
                value.fit === f ? 'background:rgba(76,141,255,.95);' : 'color:rgba(255,255,255,.7);'
              }`}
            >
              {f === 'cover' ? 'Fill' : 'Fit'}
            </Box>
          ))}
        </div>
        <Box onClick={() => onChange({ ...DEFAULT_BG })} sx={btn} hover="background:rgba(255,255,255,.16)">
          Reset
        </Box>
        <Box
          onClick={onDone}
          sx="background:rgba(76,141,255,.95); border-radius:9px; padding:7px 15px; font-size:11.5px; font-weight:600; cursor:pointer; color:#fff;"
        >
          Done
        </Box>
      </div>
    </div>
  )
}
