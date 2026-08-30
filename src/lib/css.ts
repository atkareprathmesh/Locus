import type { CSSProperties } from 'react'

const cache = new Map<string, CSSProperties>()

/**
 * Parse an inline CSS declaration string ("display:flex; gap:8px") into a React
 * style object. Lets the port keep the prototype's verbatim style strings.
 */
export function css(input?: string | null): CSSProperties {
  if (!input) return {}
  const hit = cache.get(input)
  if (hit) return hit
  const out: Record<string, string> = {}
  for (const decl of splitDeclarations(input)) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const rawProp = decl.slice(0, idx).trim()
    const value = decl.slice(idx + 1).trim()
    if (!rawProp || !value) continue
    const prop = rawProp.startsWith('--')
      ? rawProp
      : rawProp.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    out[prop] = value
  }
  const frozen = out as CSSProperties
  cache.set(input, frozen)
  return frozen
}

/** Merge two style strings/objects; later wins. */
export function mix(
  a?: string | CSSProperties | null,
  b?: string | CSSProperties | null,
): CSSProperties {
  const oa = typeof a === 'string' ? css(a) : a || {}
  const ob = typeof b === 'string' ? css(b) : b || {}
  return { ...oa, ...ob }
}

// Split on ";" but not inside parens (url(), clamp(), rgba(), ...).
function splitDeclarations(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of input) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ';' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current)
  return parts
}
