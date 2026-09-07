import { useEffect, useState } from 'react'
import { Box } from './Box'
import { ReminderChip } from './ReminderChip'
import { css } from '../lib/css'
import type { Filter, PrioFilter, Priority, State, Task } from '../types'

type Setter = (x: Partial<State> | ((s: State) => Partial<State>)) => void

interface Props {
  s: State
  set: Setter
  todayIso: string
  onToggle: (id: number) => void
  onDelete: (t: Task) => void
  onNew: () => void
  onEdit: (t: Task) => void
}

const STATUS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'done', label: 'Done' },
]

const PRIOS: { key: PrioFilter; label: string }[] = [
  { key: 'any', label: 'Any level' },
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
]

export const PRIO_META: Record<Priority, { bg: string; fg: string }> = {
  easy: { bg: 'rgba(52,211,153,.16)', fg: 'rgba(110,231,183,.95)' },
  medium: { bg: 'rgba(251,191,36,.16)', fg: 'rgba(253,214,110,.95)' },
  hard: { bg: 'rgba(251,113,133,.16)', fg: 'rgba(253,164,175,.95)' },
}

/** Does a task belong in the given status bucket? */
export function inBucket(t: Task, filter: Filter, todayIso: string): boolean {
  if (filter === 'done') return t.completed
  if (t.completed) return false
  if (filter === 'today') return t.due === todayIso
  if (filter === 'backlog') return t.due < todayIso
  if (filter === 'upcoming') return t.due > todayIso
  return true
}

const EMPTY: Record<Filter, string> = {
  today: 'Nothing due today.',
  backlog: 'Nothing overdue — nice.',
  upcoming: 'Nothing scheduled ahead.',
  done: 'Nothing completed yet.',
  all: "You're all caught up.",
}

const chip = (active: boolean) =>
  ({
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: '.06em',
    padding: '4px 8px',
    borderRadius: 7,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    background: active ? 'rgba(255,255,255,.14)' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,.55)',
  })

/** A checkbox square, sized for either a task or a sub-task. */
function Tick({ on, size, accent, onClick }: { on: boolean; size: number; accent: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: size > 14 ? 5 : 4,
        flexShrink: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size - 3,
        color: '#fff',
        fontFamily: 'Material Symbols Rounded',
        lineHeight: 1,
        border: '1.5px solid ' + (on ? accent : 'rgba(255,255,255,.32)'),
        background: on ? accent : 'transparent',
      }}
    >
      {on ? 'check' : ''}
    </div>
  )
}

export default function TodoCard({ s, set, todayIso, onToggle, onDelete, onNew, onEdit }: Props) {
  const [fullView, setFullView] = useState(false)
  const visible = s.tasks.filter(
    (t) => inBucket(t, s.filter, todayIso) && (s.prioFilter === 'any' || t.priority === s.prioFilter),
  )
  const openCount = s.tasks.filter((t) => !t.completed).length

  const setSubs = (taskId: number, fn: (subs: Task['subs']) => Task['subs']) =>
    set((st) => ({ tasks: st.tasks.map((x) => (x.id === taskId ? { ...x, subs: fn(x.subs) } : x)) }))

  const addSub = (taskId: number) => {
    const title = s.dSub.trim()
    if (!title) return
    setSubs(taskId, (subs) => [...subs, { id: Date.now(), title, done: false }])
    set({ dSub: '' })
  }

  const toggleOpen = (id: number) =>
    set((st) => ({
      openTasks: st.openTasks.includes(id) ? st.openTasks.filter((x) => x !== id) : [...st.openTasks, id],
    }))

  useEffect(() => {
    if (!fullView) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullView(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [fullView])

  const filterSelect = (label: string, value: string, onChange: (value: string) => void, options: { key: string; label: string }[]) => (
    <label style={css('position:relative; min-width:0; flex:1;')}>
      <span style={css('position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;')}>{label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        style={css('width:100%; appearance:none; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:9px; padding:7px 26px 7px 9px; font-size:10.5px; font-weight:600; color:rgba(255,255,255,.72); cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'5\' viewBox=\'0 0 8 5\'%3E%3Cpath fill=\'%23ffffff88\' d=\'M0 0l4 5 4-5z\'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 9px center;')}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key} style={{ background: '#12161f', color: '#fff' }}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <>
      <div
      data-tour="tasks"
      style={css(
        'flex:1; min-height:0; background:rgba(9,13,20,.34); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.16); border-radius:18px; box-shadow:0 8px 32px rgba(0,0,0,.3); display:flex; flex-direction:column;',
      )}
    >
      <div style={css('padding:clamp(11px,1.5vh,15px) clamp(12px,1.5vh,15px) 8px; display:flex; align-items:center; gap:8px; flex-shrink:0;')}>
        <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:17px; color:rgba(255,255,255,.5);")}>check_circle</span>
        <span style={css('font-size:clamp(12px,1.6vh,14px); font-weight:600;')}>To-do</span>
        <span style={css('margin-left:auto; font-size:10.5px; font-weight:600; color:rgba(255,255,255,.4);')}>{openCount} open</span>
        <Box
          onClick={() => setFullView(true)}
          aria-label="Open full task view"
          title="Open full task view"
          sx="width:24px; height:24px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:16px; color:rgba(255,255,255,.42); cursor:pointer;"
          hover="background:rgba(255,255,255,.1); color:#fff"
        >
          open_in_full
        </Box>
      </div>

      <div style={css('display:flex; gap:6px; padding:0 clamp(10px,1.4vh,14px) 9px; flex-shrink:0; align-items:center;')}>
        {filterSelect('Status filter', s.filter, (value) => set({ filter: value as Filter }), STATUS)}
        {filterSelect('Level filter', s.prioFilter, (value) => set({ prioFilter: value as PrioFilter }), PRIOS)}
      </div>

      <div style={css('flex:1; min-height:0; overflow-y:auto; border-top:1px solid rgba(255,255,255,.07); padding:4px;')}>
        {visible.map((t) => {
          const p = PRIO_META[t.priority] || PRIO_META.medium
          const d = new Date(t.due + 'T00:00')
          const overdue = !t.completed && t.due < todayIso
          const open = s.openTasks.includes(t.id)
          const doneSubs = t.subs.filter((x) => x.done).length
          return (
            <Box
              key={t.id}
              sx={
                'display:flex; flex-direction:column; padding:7px 9px; border-radius:11px; border-left:2px solid ' +
                (overdue ? 'rgba(253,113,133,.7)' : 'transparent') +
                ';'
              }
              hover="background:rgba(255,255,255,.06)"
            >
              <div style={css('display:flex; align-items:flex-start; gap:6px;')}>
                <div
                  title={t.completed ? 'Mark as not done' : 'Mark as done'}
                  style={css('display:flex; align-items:flex-start; justify-content:center; padding:5px; margin:-4px 0 0 -3px;')}
                >
                  <Tick on={t.completed} size={16} accent="#4c8dff" onClick={() => onToggle(t.id)} />
                </div>
                <div style={css('flex:1; min-width:0;')}>
                  <Box
                    onClick={() => onEdit(t)}
                    as="div"
                    title="Edit task"
                    sx={{
                      fontSize: 'clamp(11.5px,1.5vh,12.5px)',
                      fontWeight: 500,
                      lineHeight: 1.4,
                      cursor: 'pointer',
                      borderRadius: 6,
                      padding: '2px 3px',
                      margin: '-2px -3px',
                      color: t.completed ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.9)',
                      textDecoration: t.completed ? 'line-through' : 'none',
                    }}
                    hover="background:rgba(255,255,255,.05)"
                  >
                    {t.title}
                  </Box>
                  <div style={css('display:flex; gap:6px; margin-top:4px; flex-wrap:wrap; align-items:center; justify-content:flex-end;')}>
                    <span
                      style={css(
                        'font-size:9.5px; font-weight:500; white-space:nowrap; ' +
                          (overdue ? 'color:rgba(253,164,175,.95);' : 'color:rgba(255,255,255,.55);'),
                      )}
                    >
                      {d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + (t.time ? ' · ' + t.time : '')}
                    </span>
                    <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap', background: p.bg, color: p.fg }}>
                      {t.priority}
                    </span>
                    <ReminderChip remind={t.remind} />
                    <Box
                      onClick={() => {
                        toggleOpen(t.id)
                        set({ dSubFor: t.id, dSub: '' })
                      }}
                      sx="display:inline-flex; align-items:center; gap:2px; font-size:9.5px; font-weight:600; color:rgba(255,255,255,.55); cursor:pointer;"
                      hover="color:#fff"
                    >
                      <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:13px;")}>
                        {open ? 'expand_less' : 'checklist'}
                      </span>
                      {t.subs.length > 0 ? `${doneSubs}/${t.subs.length} steps` : 'Add steps'}
                    </Box>
                  </div>
                </div>
                <div style={css('display:flex; align-items:center; gap:2px; margin:-3px -3px 0 4px;')}>
                  <Box
                    onClick={() => onEdit(t)}
                    aria-label="Edit task"
                    title="Edit task"
                    sx="width:26px; height:26px; display:flex; align-items:center; justify-content:center; border-radius:7px; color:rgba(255,255,255,.4); cursor:pointer;"
                    hover="color:#fff; background:rgba(255,255,255,.08)"
                  >
                    <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>edit</span>
                  </Box>
                  <Box
                    onClick={() => onDelete(t)}
                    aria-label="Delete task"
                    title="Delete task"
                    sx="width:26px; height:26px; display:flex; align-items:center; justify-content:center; border-radius:7px; color:rgba(255,255,255,.4); cursor:pointer;"
                    hover="color:rgba(255,140,130,.95); background:rgba(255,120,110,.12)"
                  >
                    <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:15px;")}>close</span>
                  </Box>
                </div>
              </div>

              {open && (
                <div style={css('display:flex; flex-direction:column; gap:5px; margin:7px 0 2px 25px;')}>
                  {t.subs.map((sb) => (
                    <div key={sb.id} style={css('display:flex; align-items:center; gap:7px;')}>
                      <Tick
                        on={sb.done}
                        size={13}
                        accent="rgba(29,158,117,.95)"
                        onClick={() => setSubs(t.id, (subs) => subs.map((x) => (x.id === sb.id ? { ...x, done: !x.done } : x)))}
                      />
                      <span
                        style={css(
                          'flex:1; min-width:0; font-size:11px; ' +
                            (sb.done ? 'color:rgba(255,255,255,.34); text-decoration:line-through;' : 'color:rgba(255,255,255,.78);'),
                        )}
                      >
                        {sb.title}
                      </span>
                      <Box
                        onClick={() => setSubs(t.id, (subs) => subs.filter((x) => x.id !== sb.id))}
                        sx="font-size:11px; color:rgba(255,255,255,.2); cursor:pointer; font-family:'Material Symbols Rounded'; line-height:1;"
                        hover="color:rgba(255,140,130,.95)"
                      >
                        close
                      </Box>
                    </div>
                  ))}
                  <input
                    value={s.dSubFor === t.id ? s.dSub : ''}
                    onChange={(e) => set({ dSubFor: t.id, dSub: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addSub(t.id)
                    }}
                    placeholder="Add a step…"
                    aria-label="New sub-task"
                    style={css(
                      'border:0; background:rgba(255,255,255,.05); border-radius:7px; padding:5px 8px; font-size:11px; color:rgba(255,255,255,.85); width:100%;',
                    )}
                  />
                </div>
              )}
            </Box>
          )
        })}

        {visible.length === 0 && (
          <div style={css('padding:24px 16px; text-align:center;')}>
            <div style={css('font-size:11.5px; color:rgba(255,255,255,.4);')}>
              {s.prioFilter === 'any' ? EMPTY[s.filter] : `No ${s.prioFilter} tasks here.`}
            </div>
            {s.tasks.length === 0 && (
              <div style={css('font-size:10.5px; color:rgba(255,255,255,.3); margin-top:6px; line-height:1.6;')}>
                Press <b style={css('color:rgba(255,255,255,.6);')}>t</b> to add one from anywhere.
              </div>
            )}
          </div>
        )}
      </div>

      <div style={css('padding:9px clamp(10px,1.4vh,14px) 11px; flex-shrink:0;')}>
        <Box
          onClick={onNew}
          sx="background:rgba(76,141,255,.95); border-radius:11px; padding:9px; text-align:center; font-size:12px; font-weight:600; color:#fff; cursor:pointer;"
          hover="background:rgba(96,157,255,1)"
        >
          + New task
        </Box>
      </div>
    </div>

    {fullView && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Full task view"
        onClick={(event) => {
          if (event.target === event.currentTarget) setFullView(false)
        }}
        style={css('position:fixed; inset:0; z-index:30; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(3,7,12,.72); backdrop-filter:blur(10px);')}
      >
        <div
          style={css('width:min(900px,100%); height:min(760px,calc(100vh - 40px)); max-height:calc(100vh - 40px); display:flex; flex-direction:column; overflow:hidden; background:rgba(12,17,25,.96); border:1px solid rgba(255,255,255,.16); border-radius:20px; box-shadow:0 24px 80px rgba(0,0,0,.55);')}
        >
          <div style={css('display:flex; align-items:center; gap:10px; padding:18px 20px 12px; flex-shrink:0;')}>
            <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:22px; color:rgba(255,255,255,.55);")}>check_circle</span>
            <div style={css('font-size:18px; font-weight:700;')}>To-do</div>
            <span style={css('font-size:11px; font-weight:600; color:rgba(255,255,255,.42);')}>{openCount} open</span>
            <Box
              onClick={() => setFullView(false)}
              aria-label="Close full task view"
              title="Close full task view"
              sx="margin-left:auto; width:30px; height:30px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-family:'Material Symbols Rounded'; line-height:1; font-size:19px; color:rgba(255,255,255,.5); cursor:pointer;"
              hover="background:rgba(255,255,255,.1); color:#fff"
            >
              close
            </Box>
          </div>

          <div style={css('display:flex; align-items:center; gap:5px; flex-wrap:wrap; padding:0 20px 14px; border-bottom:1px solid rgba(255,255,255,.1); flex-shrink:0;')}>
            {STATUS.map((f) => (
              <Box
                key={f.key}
                onClick={() => set({ filter: f.key })}
                sx={{ ...chip(s.filter === f.key), padding: '7px 11px', borderRadius: 8, fontSize: 11 }}
                hover="background:rgba(255,255,255,.1); color:#fff"
              >
                {f.label}
              </Box>
            ))}
            <div style={css('width:1px; height:22px; background:rgba(255,255,255,.12); margin:0 5px;')} />
            <div style={css('width:150px;')}>
              {filterSelect('Level filter', s.prioFilter, (value) => set({ prioFilter: value as PrioFilter }), PRIOS)}
            </div>
          </div>

          <div style={css('flex:1; min-height:0; overflow-y:auto; padding:12px 20px; display:flex; flex-direction:column; gap:8px;')}>
            {visible.map((t) => {
              const p = PRIO_META[t.priority] || PRIO_META.medium
              const d = new Date(t.due + 'T00:00')
              const overdue = !t.completed && t.due < todayIso
              const open = s.openTasks.includes(t.id)
              const doneSubs = t.subs.filter((x) => x.done).length
              return (
                <div key={t.id} style={css('padding:13px 14px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:rgba(255,255,255,.035);')}>
                  <div style={css('display:grid; grid-template-columns:minmax(0,1fr) minmax(240px,auto); align-items:center; gap:20px;')}>
                    <div style={css('display:flex; align-items:flex-start; gap:10px; min-width:0;')}>
                      <div title={t.completed ? 'Mark as not done' : 'Mark as done'} style={css('padding-top:2px;')}>
                        <Tick on={t.completed} size={19} accent="#4c8dff" onClick={() => onToggle(t.id)} />
                      </div>
                      <Box onClick={() => onEdit(t)} as="div" title="Edit task" sx="min-width:0; font-size:14px; font-weight:600; line-height:1.35; color:rgba(255,255,255,.92); cursor:pointer;" hover="color:#fff">
                        {t.title}
                      </Box>
                    </div>

                    <div style={css('display:flex; align-items:center; justify-content:flex-end; gap:10px; flex-wrap:wrap; color:rgba(255,255,255,.55);')}>
                      <span style={css('font-size:10.5px; white-space:nowrap; color:' + (overdue ? 'rgba(253,164,175,.95)' : 'rgba(255,255,255,.58)') + ';')}>
                        {d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + (t.time ? ' · ' + t.time : '')}
                      </span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, padding: '3px 7px', borderRadius: 6, whiteSpace: 'nowrap', background: p.bg, color: p.fg }}>
                        {t.priority}
                      </span>
                      <ReminderChip remind={t.remind} />
                      <Box onClick={() => toggleOpen(t.id)} sx="display:inline-flex; align-items:center; gap:3px; font-size:10.5px; font-weight:600; color:rgba(255,255,255,.58); cursor:pointer; white-space:nowrap;" hover="color:#fff">
                        <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:14px;")}>{open ? 'expand_less' : 'checklist'}</span>
                        {doneSubs}/{t.subs.length} steps
                      </Box>
                      <Box onClick={() => onEdit(t)} aria-label="Edit task" title="Edit task" sx="font-family:'Material Symbols Rounded'; font-size:18px; line-height:1; color:rgba(255,255,255,.38); cursor:pointer;" hover="color:#fff">
                        edit
                      </Box>
                      <Box onClick={() => onDelete(t)} aria-label="Delete task" title="Delete task" sx="font-family:'Material Symbols Rounded'; font-size:18px; line-height:1; color:rgba(255,255,255,.38); cursor:pointer;" hover="color:rgba(255,140,130,.95)">
                        close
                      </Box>
                    </div>
                  </div>

                  {open && (
                    <div style={css('display:flex; flex-direction:column; gap:7px; margin:12px 0 0 30px; padding-top:11px; border-top:1px solid rgba(255,255,255,.08);')}>
                      {t.subs.map((sb) => (
                        <div key={sb.id} style={css('display:flex; align-items:center; gap:8px;')}>
                          <Tick on={sb.done} size={14} accent="rgba(93,202,165,.95)" onClick={() => setSubs(t.id, (subs) => subs.map((x) => (x.id === sb.id ? { ...x, done: !x.done } : x)))} />
                          <span style={css('flex:1; min-width:0; font-size:12px; color:' + (sb.done ? 'rgba(255,255,255,.34); text-decoration:line-through;' : 'rgba(255,255,255,.78);'))}>{sb.title}</span>
                          <Box onClick={() => setSubs(t.id, (subs) => subs.filter((x) => x.id !== sb.id))} aria-label="Delete sub-task" title="Delete sub-task" sx="font-family:'Material Symbols Rounded'; font-size:15px; line-height:1; color:rgba(255,255,255,.22); cursor:pointer;" hover="color:rgba(255,140,130,.95)">
                            close
                          </Box>
                        </div>
                      ))}
                      <input
                        value={s.dSubFor === t.id ? s.dSub : ''}
                        onChange={(event) => set({ dSubFor: t.id, dSub: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') addSub(t.id)
                        }}
                        placeholder="Add a step..."
                        aria-label="New sub-task"
                        style={css('border:0; background:rgba(255,255,255,.06); border-radius:8px; padding:8px 10px; font-size:12px; color:rgba(255,255,255,.85); width:100%;')}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            {visible.length === 0 && <div style={css('padding:60px 16px; text-align:center; font-size:13px; color:rgba(255,255,255,.42);')}>{s.prioFilter === 'any' ? EMPTY[s.filter] : `No ${s.prioFilter} tasks here.`}</div>}
          </div>

          <div style={css('padding:12px 20px 18px; border-top:1px solid rgba(255,255,255,.1); flex-shrink:0;')}>
            <Box onClick={onNew} sx="background:rgba(76,141,255,.95); border-radius:11px; padding:11px; text-align:center; font-size:12.5px; font-weight:700; color:#fff; cursor:pointer;" hover="background:rgba(96,157,255,1)">
              + New task
            </Box>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
