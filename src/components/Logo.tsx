/**
 * The Locus mark — a ring with a point at its centre, the "place" the product is
 * named for. Inline SVG so it stays sharp at any size and picks up the
 * surrounding text colour by default. Source files live in `brand/`.
 */
export function LocusMark({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="256" cy="256" r="190" fill="none" stroke={color} strokeWidth="34" />
      <circle cx="256" cy="256" r="56" fill={color} />
    </svg>
  )
}

/** Mark + wordmark, locked up horizontally. `size` is the mark's height. */
export function LocusLogo({ size = 26, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.42 }}>
      <LocusMark size={size} color={color} />
      <span
        style={{
          fontSize: size * 1.06,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          color,
        }}
      >
        Locus
      </span>
    </div>
  )
}
