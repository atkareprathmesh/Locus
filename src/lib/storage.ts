import { hasStorage } from '../chrome/env'

/**
 * Async key/value store backed by chrome.storage.local when available, falling
 * back to localStorage for `vite dev`. Values are JSON-serialisable.
 */
export const store = {
  async get<T>(key: string): Promise<T | null> {
    if (hasStorage) {
      const out = await chrome.storage.local.get(key)
      return (out[key] as T) ?? null
    }
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  },

  async set(key: string, value: unknown): Promise<boolean> {
    if (hasStorage) {
      try {
        await chrome.storage.local.set({ [key]: value })
        return true
      } catch {
        return false
      }
    }
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },

  async remove(key: string): Promise<void> {
    if (hasStorage) {
      await chrome.storage.local.remove(key)
      return
    }
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

/** Trailing-edge debounce. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}
