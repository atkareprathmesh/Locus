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

/**
 * One-time rename of persisted keys, used when the extension was renamed from
 * Jarvis to Locus. Each old key is copied to its new name only when nothing is
 * stored under the new name, then dropped — so an existing install keeps its
 * data and a multi-megabyte wallpaper isn't left behind under both names. The
 * old key is only removed once the copy is confirmed written. Safe to call on
 * every boot; it is a no-op after the first one.
 */
export async function migrateKeys(pairs: [from: string, to: string][]): Promise<void> {
  for (const [from, to] of pairs) {
    if ((await store.get(to)) !== null) continue
    const carried = await store.get(from)
    if (carried === null) continue
    if (await store.set(to, carried)) await store.remove(from)
  }
}

/** Trailing-edge debounce. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}
