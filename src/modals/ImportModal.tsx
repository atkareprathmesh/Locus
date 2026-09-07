import { Box } from '../components/Box'
import { css } from '../lib/css'
import { daysSince } from '../lib/backup'
import { stamp } from '../state'
import type { ImportResult } from '../import/model'
import type { State } from '../types'

type Setter = (x: Partial<State> | ((s: State) => Partial<State>)) => void

interface Props {
  s: State
  set: Setter
  bmCount: number
  parsed: ImportResult | null
  importing: boolean
  onExport: () => void
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onCancelPreview: () => void
  onConfirm: () => void
}

export default function ImportModal({
  s,
  set,
  bmCount,
  parsed,
  importing,
  onExport,
  onImportFile,
  onCancelPreview,
  onConfirm,
}: Props) {
  const since = daysSince(s.lastBackup)

  return (
    <div style={css('display:flex; flex-direction:column; gap:16px;')}>
      <div style={css('background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); border-radius:13px; padding:14px; display:flex; flex-direction:column; gap:8px;')}>
        <div style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>CURRENT DATA</div>
        {(
          [
            ['Boards', s.boards.length],
            ['Bookmarks', bmCount],
            ['Notes', s.notes.length],
            ['Tasks', s.tasks.length],
            ['Habits', s.habits.length],
          ] as [string, number][]
        ).map(([label, value]) => (
          <div key={label} style={css('display:flex; justify-content:space-between; font-size:12.5px; color:rgba(255,255,255,.7);')}>
            <span>{label}</span>
            <span style={css('font-weight:600; color:#fff;')}>{value}</span>
          </div>
        ))}
        <div style={css('border-top:1px solid rgba(255,255,255,.08); padding-top:8px; font-size:11px; color:rgba(255,255,255,.42);')}>
          {since === null ? 'Never backed up' : since === 0 ? 'Backed up today' : `Last backup ${since} day${since === 1 ? '' : 's'} ago · ${stamp(s.lastBackup)}`}
        </div>
      </div>

      <div style={css('display:flex; gap:10px;')}>
        <div onClick={onExport} style={css('flex:1; text-align:center; background:rgba(76,141,255,.95); border-radius:11px; padding:11px; font-size:12.5px; font-weight:600; cursor:pointer;')}>
          Export JSON
        </div>
        <Box
          as="label"
          sx="flex:1; text-align:center; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); border-radius:11px; padding:11px; font-size:12.5px; font-weight:600; cursor:pointer;"
          hover="background:rgba(255,255,255,.14)"
        >
          Import file…
          <input type="file" accept="application/json,.json,text/html,.html,.htm" onChange={onImportFile} style={{ display: 'none' }} />
        </Box>
      </div>
      {s.importError && <div style={css('font-size:12px; color:rgba(255,138,128,.95); line-height:1.6;')}>{s.importError}</div>}

      {s.importPreview && parsed && (
        <div style={css('border:1px dashed rgba(255,255,255,.22); border-radius:13px; padding:14px; display:flex; flex-direction:column; gap:11px;')}>
          <div style={css('display:flex; align-items:center; gap:8px;')}>
            <span style={css('font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>DETECTED</span>
            <span style={css('font-size:12px; font-weight:600; color:#fff;')}>{parsed.source}</span>
            {parsed.confidence === 'heuristic' && (
              <span style={css('font-size:9.5px; font-weight:700; letter-spacing:.06em; padding:2px 7px; border-radius:5px; background:rgba(251,191,36,.16); color:rgba(253,214,110,.95);')}>
                BEST GUESS
              </span>
            )}
          </div>

          {(() => {
            const bmTotal = parsed.boards.reduce((a, b) => a + b.bookmarks.length, 0)
            const rows: [string, number][] = [
              ['Boards', parsed.boards.length],
              ['Bookmarks', bmTotal],
              ['Notes', parsed.notes.length],
              ['Tasks', parsed.tasks.length],
              ['Habits', parsed.habits.length],
              ['Journal entries', parsed.journal.length],
            ]
            return (
              <div style={css('display:flex; flex-direction:column; gap:5px;')}>
                {rows
                  .filter(([, n]) => n > 0)
                  .map(([label, n]) => (
                    <div key={label} style={css('display:flex; justify-content:space-between; font-size:12px; color:rgba(255,255,255,.72);')}>
                      <span>{label}</span>
                      <span style={css('font-weight:600; color:#fff;')}>+{n}</span>
                    </div>
                  ))}
              </div>
            )
          })()}

          {parsed.boards.length > 0 && (
            <div style={css('max-height:120px; overflow-y:auto; display:flex; flex-direction:column; gap:3px; border-top:1px solid rgba(255,255,255,.08); padding-top:9px;')}>
              {parsed.boards.map((b, i) => (
                <div key={i} style={css('display:flex; justify-content:space-between; font-size:11px; color:rgba(255,255,255,.6);')}>
                  <span style={css('overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}>{b.name}</span>
                  <span style={css('flex-shrink:0; color:rgba(255,255,255,.4);')}>{b.bookmarks.length}</span>
                </div>
              ))}
            </div>
          )}

          {parsed.warnings.length > 0 && (
            <div style={css('border-top:1px solid rgba(255,255,255,.08); padding-top:9px; display:flex; flex-direction:column; gap:4px;')}>
              {parsed.warnings.map((w, i) => (
                <div key={i} style={css('font-size:10.5px; color:rgba(253,214,110,.9); line-height:1.5;')}>
                  • {w}
                </div>
              ))}
            </div>
          )}

          <div style={css('font-size:10.5px; color:rgba(255,255,255,.4); line-height:1.5;')}>
            Bookmarks merge into boards of the same name; duplicate URLs and already-present notes and tasks are
            skipped. A habit you already have absorbs the file's completion history rather than being duplicated. Your
            existing data is kept.
          </div>

          <div style={css('display:flex; justify-content:flex-end; gap:8px;')}>
            <div onClick={onCancelPreview} style={css('padding:8px 14px; font-size:12px; font-weight:600; color:rgba(255,255,255,.55); cursor:pointer;')}>
              Cancel
            </div>
            <div
              onClick={() => !importing && onConfirm()}
              style={{
                ...css('background:rgba(76,141,255,.95); border-radius:10px; padding:8px 16px; font-size:12px; font-weight:600; cursor:pointer;'),
                opacity: importing ? 0.6 : 1,
              }}
            >
              {importing ? 'Importing…' : 'Import'}
            </div>
          </div>
        </div>
      )}

      <div style={css('font-size:11px; color:rgba(255,255,255,.35); line-height:1.6;')}>
        Everything stays on this device. Import understands Locus backups, Boardmarks exports, browser bookmark HTML
        files (Chrome / Firefox / Safari / Edge), Chrome's Bookmarks file, and makes a best-effort pass at other JSON
        exports.{' '}
        <span onClick={() => set({ modal: 'settings' })} style={css('color:rgba(150,185,255,.95); cursor:pointer; font-weight:600;')}>
          Set up automatic backups →
        </span>
      </div>
    </div>
  )
}
