import { hasDownloads } from '../chrome/env'
import type { State } from '../types'

/** Folder inside the browser's Downloads directory that auto-backups land in. */
const FOLDER = 'Locus backups'

/** The slices worth carrying to another profile or install. */
export function backupPayload(s: State) {
  return {
    app: 'locus',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: s.notes,
    tasks: s.tasks,
    habits: s.habits,
    dateNotes: s.dateNotes,
    pages: s.pages,
    deletedPages: s.deletedPages,
    activePage: s.activePage,
    pageData: s.pageData,
    boards: s.boards,
    boardOrder: s.boardOrder,
    boardPage: s.boardPage,
    gapps: s.gapps,
    gappsOn: s.gappsOn,
    h24: s.h24,
    engine: s.engine,
  }
}

const stamp = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Write a backup to disk. `auto` backups go straight into a Locus folder in
 * Downloads with no save dialog and no shelf popup; a manual export uses the
 * plain anchor download so it works in `vite dev` too.
 *
 * Returns true when the file was actually written.
 */
export async function writeBackup(s: State, auto: boolean): Promise<boolean> {
  const json = JSON.stringify(backupPayload(s), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const name = auto ? `${FOLDER}/locus-backup-${stamp(new Date())}.json` : 'locus-backup.json'
  try {
    if (hasDownloads) {
      await chrome.downloads.download({ url, filename: name, saveAs: false, conflictAction: 'overwrite' })
      return true
    }
    if (auto) return false // no silent path outside the extension — just nudge instead
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    return true
  } catch {
    return false
  } finally {
    // Chrome needs the blob alive until the download starts.
    setTimeout(() => URL.revokeObjectURL(url), 20_000)
  }
}

/** Whole days since the last backup, or null when there has never been one. */
export const daysSince = (last: number): number | null =>
  last > 0 ? Math.floor((Date.now() - last) / 86_400_000) : null

/** True when there is real data to lose and the last backup is overdue. */
export function backupOverdue(s: State): boolean {
  const items = s.notes.length + s.tasks.length + s.habits.length + Object.keys(s.dateNotes).length
  if (items < 3) return false
  const days = daysSince(s.lastBackup)
  return days === null || days >= Math.max(14, s.backupEvery * 2)
}
