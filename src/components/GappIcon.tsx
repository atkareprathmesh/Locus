import { useState } from 'react'
import { GappLogo, hasGappLogo } from './GappLogo'

/**
 * Google's official product-icon CDN. These load in an MV3 extension page (the
 * default CSP doesn't restrict img-src) and the browser caches them hard after
 * the first hit. Keys not listed fall back to a bundled SVG, then a glyph tile.
 */
const GSTATIC: Record<string, string> = {
  gmail: 'gmail',
  drive: 'drive',
  calendar: 'calendar',
  docs: 'docs',
  sheets: 'sheets',
  slides: 'slides',
  forms: 'forms',
  meet: 'meet',
  chat: 'chat',
  maps: 'maps',
  photos: 'photos',
  keep: 'keep',
  tasks: 'tasks',
  translate: 'translate',
  youtube: 'youtube',
  news: 'news',
  search: 'googleg',
  gemini: 'gemini',
  contacts: 'contacts',
  classroom: 'classroom',
  earth: 'earth',
  play: 'play_prism',
  books: 'play_books',
  finance: 'finance',
  analytics: 'analytics',
  'search-console': 'search_console',
  adsense: 'adsense',
  groups: 'groups',
  sites: 'sites',
  one: 'one',
  voice: 'voice',
}

const gstaticSrc = (key: string): string | null => {
  const n = GSTATIC[key]
  return n ? `https://www.gstatic.com/images/branding/product/2x/${n}_48dp.png` : null
}

/**
 * Icon for a Google app: official CDN image first, bundled SVG mark if that
 * fails (or offline), and a brand-tinted Material-glyph tile as the last resort.
 */
export function GappIcon({
  appKey,
  glyph,
  tint,
  size = 34,
  radius = 9,
}: {
  appKey: string
  glyph: string
  tint: string
  size?: number
  radius?: number
}) {
  const src = gstaticSrc(appKey)
  const [imgFailed, setImgFailed] = useState(false)

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setImgFailed(true)}
        style={{ display: 'block', objectFit: 'contain', flexShrink: 0 }}
      />
    )
  }

  if (hasGappLogo(appKey)) return <GappLogo appKey={appKey} size={size} />

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `rgba(${tint},.20)`,
        fontFamily: 'Material Symbols Rounded',
        fontSize: Math.round(size * 0.58),
        lineHeight: 1,
        color: `rgb(${tint})`,
      }}
    >
      {glyph}
    </div>
  )
}
