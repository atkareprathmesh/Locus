import {
  createElement,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react'
import { css } from '../lib/css'

type BoxProps = {
  as?: ElementType
  sx?: string | CSSProperties
  /** Extra styles applied while hovered (mirrors the prototype's style-hover). */
  hover?: string | CSSProperties
  children?: ReactNode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

/**
 * A div (or any tag) that accepts a CSS string for `sx` and an optional `hover`
 * string, reproducing the prototype's `style="..." style-hover="..."` pattern.
 */
export function Box({ as = 'div', sx, hover, children, onMouseEnter, onMouseLeave, ...rest }: BoxProps) {
  const [hot, setHot] = useState(false)
  const base = typeof sx === 'string' ? css(sx) : sx || {}
  const hot_ = hover ? (typeof hover === 'string' ? css(hover) : hover) : null
  const style = hot && hot_ ? { ...base, ...hot_ } : base
  return createElement(
    as,
    {
      ...rest,
      style,
      onMouseEnter: hover
        ? (e: unknown) => {
            setHot(true)
            onMouseEnter?.(e)
          }
        : onMouseEnter,
      onMouseLeave: hover
        ? (e: unknown) => {
            setHot(false)
            onMouseLeave?.(e)
          }
        : onMouseLeave,
    },
    children,
  )
}
