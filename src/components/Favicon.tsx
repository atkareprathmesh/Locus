import { useState } from 'react'
import { css } from '../lib/css'
import { faviconUrl } from '../chrome/favicon'

/** Site favicon with a letter-tile fallback (matches the prototype's tiles). */
export function Favicon({
  url,
  title,
  sx,
  size = 32,
}: {
  url: string
  title: string
  sx: string
  size?: number
}) {
  const src = faviconUrl(url, size)
  const [failed, setFailed] = useState(false)
  const style = css(sx)
  const initial = (title || url).slice(0, 1).toUpperCase()
  if (!src || failed) {
    return <div style={style}>{initial}</div>
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      style={{ ...style, objectFit: 'contain', background: 'transparent' }}
    />
  )
}
