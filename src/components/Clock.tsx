import { useEffect, useState } from 'react'

export function Clock({ h24 }: { h24: boolean }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const hh = now.getHours()
  const mm = String(now.getMinutes()).padStart(2, '0')
  const clock = h24
    ? String(hh).padStart(2, '0') + ':' + mm
    : ((hh % 12) || 12) + ':' + mm + ' ' + (hh < 12 ? 'am' : 'pm')
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div
      style={{
        background: 'rgba(9,13,20,.34)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,.16)',
        borderRadius: 13,
        padding: '8px 15px',
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
      }}
    >
      <span
        style={{
          fontSize: 'clamp(14px,1.9vh,17px)',
          fontWeight: 600,
          letterSpacing: '-.2px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {clock}
      </span>
      <span style={{ fontSize: 'clamp(10px,1.3vh,12px)', fontWeight: 500, color: 'rgba(255,255,255,.5)' }}>
        {dateLine}
      </span>
    </div>
  )
}
