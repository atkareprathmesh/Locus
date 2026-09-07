import { css } from '../lib/css'

const KEYS: [string, string][] = [
  ['/', 'Focus search'],
  ['n', 'New note'],
  ['t', 'New task'],
  ['h', 'Open habits'],
  ['b', 'Search bookmarks'],
  ['1 – 9', 'Jump to page'],
  ['?', 'This list'],
  ['Esc', 'Close anything open'],
]

export default function ShortcutsModal() {
  return (
    <div style={css('display:flex; flex-direction:column; gap:4px;')}>
      <div style={css('font-size:12px; color:rgba(255,255,255,.42); line-height:1.6; padding-bottom:8px;')}>
        Shortcuts work whenever you're not typing in a field. If the search box has focus, press{' '}
        <b style={css('color:rgba(255,255,255,.7);')}>Esc</b> first.
      </div>
      {KEYS.map(([key, label]) => (
        <div
          key={key}
          style={css('display:flex; align-items:center; gap:14px; padding:9px 4px; border-bottom:1px solid rgba(255,255,255,.06);')}
        >
          <span
            style={css(
              'min-width:62px; text-align:center; flex-shrink:0; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px; font-weight:600; color:rgba(255,255,255,.9); background:rgba(255,255,255,.09); border:1px solid rgba(255,255,255,.14); border-radius:7px; padding:5px 8px;',
            )}
          >
            {key}
          </span>
          <span style={css('font-size:13px; color:rgba(255,255,255,.78);')}>{label}</span>
        </div>
      ))}
    </div>
  )
}
