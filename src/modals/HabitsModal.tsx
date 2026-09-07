import { Box } from '../components/Box'
import { css } from '../lib/css'
import { habitStreak, iso } from '../state'
import type { Habit, State } from '../types'

type Setter = (x: Partial<State> | ((s: State) => Partial<State>)) => void

interface Props {
  s: State
  set: Setter
  today: Date
  onToggle: (id: number, dayIso: string) => void
  onDelete: (h: Habit) => void
}

const DONE = 'rgba(29,158,117,.9)'

/**
 * The habit tracker: one row per habit, one column per day of the month the
 * calendar is currently showing. Shares `monthOffset` with the calendar so
 * paging either one keeps them in step.
 */
export default function HabitsModal({ s, set, today, onToggle, onDelete }: Props) {
  const base = new Date(today.getFullYear(), today.getMonth() + s.monthOffset, 1)
  const dim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  const todayIso = iso(today)
  const days = Array.from({ length: dim }, (_, i) => {
    const dayIso = iso(new Date(base.getFullYear(), base.getMonth(), i + 1))
    return { d: i + 1, iso: dayIso, isToday: dayIso === todayIso, future: dayIso > todayIso }
  })
  // name column + one track per day + streak column
  const cols = `minmax(96px,132px) repeat(${dim}, minmax(11px, 1fr)) 34px`

  const addHabit = () => {
    if (!s.dHabit.trim()) return
    set((st) => ({ habits: [...st.habits, { id: Date.now(), name: st.dHabit.trim(), done: [] }], dHabit: '' }))
  }

  return (
    <div style={css('display:flex; flex-direction:column; gap:12px;')}>
      <div style={css('display:flex; align-items:center; justify-content:space-between; gap:10px;')}>
        <div style={css('display:flex; align-items:center; gap:4px;')}>
          <Box
            onClick={() => set({ monthOffset: s.monthOffset - 1 })}
            sx="width:24px; height:24px; border-radius:7px; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.5); cursor:pointer; font-family:'Material Symbols Rounded'; line-height:1; font-size:17px;"
            hover="background:rgba(255,255,255,.1); color:#fff"
          >
            chevron_left
          </Box>
          <div style={css('font-size:13px; font-weight:600; min-width:132px; text-align:center;')}>
            {base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <Box
            onClick={() => set({ monthOffset: s.monthOffset + 1 })}
            sx="width:24px; height:24px; border-radius:7px; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.5); cursor:pointer; font-family:'Material Symbols Rounded'; line-height:1; font-size:17px;"
            hover="background:rgba(255,255,255,.1); color:#fff"
          >
            chevron_right
          </Box>
        </div>
        <div style={css('font-size:11.5px; color:rgba(255,255,255,.4);')}>Click any day to tick it off.</div>
      </div>

      <div style={css('overflow-x:auto; max-height:56vh; overflow-y:auto;')}>
        <div style={css('min-width:520px;')}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 2, alignItems: 'center', marginBottom: 5 }}>
            <div />
            {days.map((d) => (
              <div
                key={d.iso}
                style={css(
                  'font-size:8px; font-weight:700; text-align:center; color:rgba(255,255,255,' + (d.isToday ? '.9' : '.26') + ');',
                )}
              >
                {d.d}
              </div>
            ))}
            <div />
          </div>

          {s.habits.map((h) => {
            const done = new Set(h.done)
            const streak = habitStreak(done, today)
            return (
              <div
                key={h.id}
                style={{ display: 'grid', gridTemplateColumns: cols, gap: 2, alignItems: 'center', marginBottom: 4 }}
              >
                <div style={css('display:flex; align-items:center; gap:2px; min-width:0; padding-right:6px;')}>
                  <input
                    value={h.name}
                    onChange={(e) => {
                      const v = e.target.value
                      set((x) => ({ habits: x.habits.map((y) => (y.id === h.id ? { ...y, name: v } : y)) }))
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim())
                        set((x) => ({
                          habits: x.habits.map((y) => (y.id === h.id ? { ...y, name: 'Untitled habit' } : y)),
                        }))
                    }}
                    aria-label="Habit name"
                    style={css(
                      'flex:1; min-width:0; border:0; background:transparent; border-radius:6px; padding:3px 4px; font-size:12px; font-weight:600; color:rgba(255,255,255,.9);',
                    )}
                  />
                  <Box
                    onClick={() => onDelete(h)}
                    title="Delete habit"
                    sx="display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:14px; color:rgba(255,255,255,.22); cursor:pointer; flex-shrink:0;"
                    hover="color:rgba(255,140,130,.95)"
                  >
                    delete_outline
                  </Box>
                </div>

                {days.map((d) => (
                  <div
                    key={d.iso}
                    onClick={() => !d.future && onToggle(h.id, d.iso)}
                    title={d.iso}
                    style={{
                      height: 16,
                      borderRadius: 4,
                      cursor: d.future ? 'default' : 'pointer',
                      opacity: d.future ? 0.35 : 1,
                      background: done.has(d.iso) ? DONE : 'rgba(255,255,255,.07)',
                      outline: d.isToday ? '1px solid rgba(255,255,255,.5)' : 'none',
                      outlineOffset: 1,
                    }}
                  />
                ))}

                <div
                  style={css(
                    'font-size:10px; font-weight:700; text-align:right; ' +
                      (streak > 0 ? 'color:rgba(255,180,120,.95);' : 'color:rgba(255,255,255,.24);'),
                  )}
                  title={streak > 0 ? `${streak}-day streak` : 'No streak yet'}
                >
                  {streak > 0 ? `${streak}d` : '—'}
                </div>
              </div>
            )
          })}

          {s.habits.length === 0 && (
            <div
              style={css(
                'border:1px dashed rgba(255,255,255,.16); border-radius:14px; padding:30px 20px; text-align:center; font-size:12.5px; color:rgba(255,255,255,.4); line-height:1.7;',
              )}
            >
              No habits yet.
              <br />
              Add one below — start with something you can actually do today.
            </div>
          )}
        </div>
      </div>

      <div style={css('display:flex; gap:9px; align-items:center; border-top:1px solid rgba(255,255,255,.09); padding-top:14px;')}>
        <input
          value={s.dHabit}
          onChange={(e) => set({ dHabit: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addHabit()
          }}
          placeholder="New habit — e.g. Swim 1km"
          style={css('flex:1; min-width:0; padding:11px 13px; font-size:13px;')}
        />
        <div
          onClick={addHabit}
          style={css(
            'background:rgba(76,141,255,.95); border-radius:11px; padding:11px 17px; font-size:12.5px; font-weight:600; cursor:pointer; white-space:nowrap;',
          )}
        >
          Add habit
        </div>
      </div>
    </div>
  )
}
