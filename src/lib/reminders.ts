import { hasAlarms } from '../chrome/env'
import type { Task } from '../types'

/** Alarm names Locus owns. Anything else in chrome.alarms is left alone. */
const PREFIX = 'locus.task.'
/** Where the service worker reads a fired alarm's notification text from. */
export const REMINDERS_KEY = 'locus.reminders'

/** Tasks with no explicit time are treated as due at 9am local. */
const DEFAULT_HOUR = 9

/**
 * When a task's reminder should fire, in epoch ms — or null when the task has
 * no reminder or an unparseable due date.
 */
export function reminderAt(t: Task): number | null {
  if (!t.remind || t.remind === 'none' || t.completed) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.due)) return null
  const [y, m, d] = t.due.split('-').map(Number)
  const [hh, mm] = t.time && /^\d{2}:\d{2}/.test(t.time) ? t.time.split(':').map(Number) : [DEFAULT_HOUR, 0]
  const when = new Date(y, m - 1, d, hh, mm, 0, 0)
  const offset = t.remind === 'at' ? 0 : Number(t.remind)
  if (!Number.isFinite(offset)) return null
  return +when - offset * 60_000
}

/**
 * Bring chrome.alarms in line with the current task list: one alarm per task
 * with a reminder still in the future, and none for anything else. Cheap enough
 * to run on every task change.
 */
export async function syncReminders(tasks: Task[]): Promise<void> {
  if (!hasAlarms) return
  const now = Date.now()
  const wanted: Record<string, { title: string; when: number; due: string; time: string }> = {}
  for (const t of tasks) {
    const when = reminderAt(t)
    if (when == null || when <= now) continue
    wanted[PREFIX + t.id] = { title: t.title, when, due: t.due, time: t.time }
  }

  try {
    await chrome.storage.local.set({ [REMINDERS_KEY]: wanted })
    const existing = await chrome.alarms.getAll()
    for (const a of existing) {
      if (a.name.startsWith(PREFIX) && !wanted[a.name]) await chrome.alarms.clear(a.name)
    }
    for (const [name, r] of Object.entries(wanted)) {
      const cur = existing.find((a) => a.name === name)
      // Recreating an identical alarm would reset it, so only touch changed ones.
      if (!cur || Math.abs(cur.scheduledTime - r.when) > 1000) chrome.alarms.create(name, { when: r.when })
    }
  } catch {
    /* alarms unavailable — reminders just don't fire */
  }
}

/** Human-readable summary of a task's reminder, for the task row. */
export function reminderLabel(remind: string): string {
  switch (remind) {
    case 'at':
      return 'At time'
    case '5':
      return '5m before'
    case '15':
      return '15m before'
    case '60':
      return '1h before'
    case '1440':
      return '1d before'
    default:
      return ''
  }
}
