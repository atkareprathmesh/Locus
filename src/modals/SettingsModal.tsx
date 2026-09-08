import { Box } from '../components/Box'
import { GappIcon } from '../components/GappIcon'
import { hasDownloads } from '../chrome/env'
import { css } from '../lib/css'
import { daysSince } from '../lib/backup'
import { open } from '../lib/nav'
import { DEFAULT_GAPPS, FEEDBACK_URL, GAPP_CATALOG, stamp } from '../state'
import type { State } from '../types'

type Setter = (x: Partial<State> | ((s: State) => Partial<State>)) => void

interface Props {
  s: State
  set: Setter
  onBgFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onAdjustBg: () => void
  onRemoveBg: () => void
  onReplayTour: () => void
  onReset: () => void
  onBackupNow: () => void
}

const LABEL = 'font-size:10px; font-weight:600; letter-spacing:.14em; color:rgba(255,255,255,.42);'
const SECTION = 'display:flex; flex-direction:column; gap:11px; border-top:1px solid rgba(255,255,255,.09); padding-top:16px;'
const HINT = 'font-size:11px; color:rgba(255,255,255,.35); line-height:1.6;'

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        cursor: 'pointer',
        padding: 2,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        background: on ? 'rgba(76,141,255,.95)' : 'rgba(255,255,255,.14)',
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}
    >
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
    </div>
  )
}

export default function SettingsModal({
  s,
  set,
  onBgFile,
  onAdjustBg,
  onRemoveBg,
  onReplayTour,
  onReset,
  onBackupNow,
}: Props) {
  const since = daysSince(s.lastBackup)
  const lastLine =
    since === null
      ? 'Never backed up'
      : since === 0
        ? 'Backed up today · ' + stamp(s.lastBackup)
        : `Last backup ${since} day${since === 1 ? '' : 's'} ago · ` + stamp(s.lastBackup)

  return (
    <div style={css('display:flex; flex-direction:column; gap:18px; max-height:62vh; overflow-y:auto;')}>
      <div style={css('display:flex; flex-direction:column; gap:11px;')}>
        <div style={css(LABEL)}>APPEARANCE</div>
        <div style={css('display:flex; align-items:center; justify-content:space-between; gap:14px;')}>
          <span style={css('font-size:12.5px; color:rgba(255,255,255,.78);')}>Background image / GIF</span>
          <div style={css('display:flex; gap:8px;')}>
            <Box
              as="label"
              sx="position:relative; background:rgba(76,141,255,.95); border-radius:9px; padding:7px 13px; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap; overflow:hidden;"
            >
              Upload…
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/*"
                onChange={onBgFile}
                style={css('position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; border:0; background:transparent; padding:0;')}
              />
            </Box>
            {s.bgImage && (
              <Box
                onClick={onAdjustBg}
                sx="background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); border-radius:9px; padding:7px 13px; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap;"
                hover="background:rgba(255,255,255,.14)"
              >
                Adjust…
              </Box>
            )}
            {s.bgImage && (
              <Box
                onClick={onRemoveBg}
                sx="background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); border-radius:9px; padding:7px 13px; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap;"
                hover="background:rgba(255,255,255,.14)"
              >
                Remove
              </Box>
            )}
          </div>
        </div>
        <div style={css(HINT)}>
          Pick any photo or GIF from your computer. Use Adjust to zoom, drag and crop it so the part you care about
          lands in view. Panels stay legible on any wallpaper.
        </div>
      </div>

      <div style={css(SECTION)}>
        <div style={css(LABEL)}>CLOCK &amp; SEARCH</div>
        <div style={css('display:flex; align-items:center; justify-content:space-between; gap:14px;')}>
          <span style={css('font-size:12.5px; color:rgba(255,255,255,.78);')}>24-hour time</span>
          <Toggle on={s.h24} onClick={() => set({ h24: !s.h24 })} />
        </div>
        <div style={css('display:flex; align-items:center; justify-content:space-between; gap:14px;')}>
          <span style={css('font-size:12.5px; color:rgba(255,255,255,.78);')}>Default search engine</span>
          <select
            value={s.engine}
            onChange={(e) => set({ engine: e.target.value as State['engine'] })}
            style={css('padding:8px 11px; font-size:12px;')}
          >
            <option value="Google">Google</option>
            <option value="Bing">Bing</option>
            <option value="DuckDuckGo">DuckDuckGo</option>
            <option value="YouTube">YouTube</option>
          </select>
        </div>
      </div>

      <div style={css(SECTION)}>
        <div style={css(LABEL)}>BACKUP</div>
        <div style={css('display:flex; align-items:center; justify-content:space-between; gap:14px;')}>
          <span style={css('font-size:12.5px; color:rgba(255,255,255,.78);')}>Automatic backup</span>
          <select
            value={s.backupEvery}
            onChange={(e) => set({ backupEvery: Number(e.target.value) })}
            style={css('padding:8px 11px; font-size:12px;')}
          >
            <option value={0}>Off</option>
            <option value={1}>Every day</option>
            <option value={7}>Every week</option>
            <option value={30}>Every month</option>
          </select>
        </div>
        <div style={css('display:flex; align-items:center; gap:12px;')}>
          <Box
            onClick={onBackupNow}
            sx="border:1px solid rgba(124,160,255,.5); color:rgba(150,185,255,.95); border-radius:10px; padding:8px 14px; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap;"
            hover="background:rgba(76,141,255,.14)"
          >
            Back up now
          </Box>
          <span
            style={css(
              'font-size:11px; ' +
                (since !== null && since < 7 ? 'color:rgba(110,231,183,.9);' : 'color:rgba(255,255,255,.45);'),
            )}
          >
            {s.backupMsg || lastLine}
          </span>
        </div>
        <div style={css(HINT)}>
          {hasDownloads
            ? 'Backups are written to a "Locus backups" folder in your Downloads — outside the extension, so they survive an uninstall or a profile reset. Chrome gives no warning before an uninstall, so this scheduled copy is your safety net.'
            : 'Automatic backup needs the packaged extension. Use "Back up now" to save a JSON copy manually.'}
        </div>
      </div>

      <div style={css(SECTION)}>
        <div style={css(LABEL)}>GOOGLE APPS</div>
        <div style={css('display:flex; align-items:center; gap:12px;')}>
          <Toggle on={s.gappsOn} onClick={() => set({ gappsOn: !s.gappsOn })} />
          <span style={css('font-size:12.5px; color:rgba(255,255,255,.78);')}>{s.gappsOn ? 'On' : 'Off'}</span>
        </div>
        <div style={css(HINT)}>Shows the Google Apps launcher — the grid icon next to the clock.</div>
        {s.gappsOn && (
          <>
            <div style={css('display:flex; align-items:center; justify-content:space-between; padding-top:4px;')}>
              <span style={css('font-size:11px; font-weight:600; color:rgba(255,255,255,.55);')}>Apps in the launcher</span>
              <div style={css('display:flex; align-items:center; gap:12px;')}>
                <span style={css('font-size:10.5px; color:rgba(255,255,255,.35);')}>{s.gapps.length} shown</span>
                <Box
                  onClick={() => set({ gapps: [...DEFAULT_GAPPS] })}
                  sx="font-size:11px; font-weight:600; color:rgba(150,185,255,.9); cursor:pointer;"
                  hover="color:#fff"
                >
                  Reset
                </Box>
              </div>
            </div>
            <div style={css('display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; max-height:38vh; overflow-y:auto;')}>
              {GAPP_CATALOG.map((a) => {
                const on = s.gapps.includes(a.key)
                return (
                  <Box
                    key={a.key}
                    onClick={() => set((st) => ({ gapps: on ? st.gapps.filter((k) => k !== a.key) : [...st.gapps, a.key] }))}
                    sx={
                      'display:flex; align-items:center; gap:8px; padding:8px 9px; border-radius:9px; cursor:pointer; border:1px solid ' +
                      (on ? 'rgba(76,141,255,.4)' : 'rgba(255,255,255,.08)') +
                      '; background:' +
                      (on ? 'rgba(76,141,255,.12)' : 'rgba(255,255,255,.03)') +
                      ';'
                    }
                    hover="background:rgba(255,255,255,.08)"
                  >
                    <span
                      style={{
                        fontFamily: 'Material Symbols Rounded',
                        fontSize: 16,
                        lineHeight: 1,
                        flexShrink: 0,
                        color: on ? 'rgba(120,170,255,.98)' : 'rgba(255,255,255,.28)',
                      }}
                    >
                      {on ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    <GappIcon appKey={a.key} glyph={a.glyph} tint={a.c} size={18} radius={5} />
                    <span style={css('flex:1; min-width:0; font-size:11.5px; font-weight:500; color:rgba(255,255,255,.82); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}>
                      {a.name}
                    </span>
                  </Box>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div style={css(SECTION)}>
        <div style={css(LABEL)}>HELP</div>
        <div style={css('display:flex; gap:8px; flex-wrap:wrap;')}>
          <Box
            onClick={onReplayTour}
            sx="border:1px solid rgba(124,160,255,.5); color:rgba(150,185,255,.95); border-radius:10px; padding:9px 15px; font-size:12px; font-weight:600; cursor:pointer;"
            hover="background:rgba(76,141,255,.14)"
          >
            Replay walkthrough
          </Box>
          <Box
            onClick={() => set({ modal: 'shortcuts' })}
            sx="border:1px solid rgba(255,255,255,.16); color:rgba(255,255,255,.75); border-radius:10px; padding:9px 15px; font-size:12px; font-weight:600; cursor:pointer;"
            hover="background:rgba(255,255,255,.08)"
          >
            Keyboard shortcuts
          </Box>
        </div>
      </div>

      <div style={css(SECTION)}>
        <div style={css(LABEL)}>DATA</div>
        <Box
          onClick={onReset}
          sx="align-self:flex-start; border:1px solid rgba(255,138,128,.5); color:rgba(255,150,140,.95); border-radius:10px; padding:9px 15px; font-size:12px; font-weight:600; cursor:pointer;"
          hover="background:rgba(255,120,110,.14)"
        >
          Reset to first run
        </Box>
        <div style={css(HINT)}>
          Clears notes, tasks, journal entries and habits on every page. Your Chrome bookmarks are not touched.
        </div>
      </div>

      {FEEDBACK_URL && (
        <div style={css(SECTION)}>
          <div style={css(LABEL)}>BETA</div>
          <Box
            onClick={() => open(FEEDBACK_URL)}
            sx="align-self:flex-start; border:1px solid rgba(124,160,255,.5); color:rgba(150,185,255,.95); border-radius:10px; padding:9px 15px; font-size:12px; font-weight:600; cursor:pointer;"
            hover="background:rgba(76,141,255,.14)"
          >
            Send feedback / report a bug
          </Box>
        </div>
      )}
    </div>
  )
}
