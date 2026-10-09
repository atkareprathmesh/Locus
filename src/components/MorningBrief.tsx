import type { Habit, Task } from '../types'
import { Box } from './Box'
import { css } from '../lib/css'

type Props = {
  name: string
  tasks: Task[]
  yesterdayPendingTasks: Task[]
  habits: Habit[]
  yesterdayDone: number
  yesterdayTotal: number
  quote: string
  onClose: () => void
  onToggleTask: (id: number) => void
  onEditTask: (task: Task) => void
  onOpenHabits: () => void
  onOpenJournal: () => void
}

const GREETINGS = {
  night: ['Still making space for yourself, {name}?', 'Good night, {name}. Keep this moment gentle.'],
  morning: ['A new page, {name}.', 'Good morning, {name}. The day is still unwritten.', 'Morning, {name}. What deserves your attention today?'],
  afternoon: ['Good afternoon, {name}. There is still time for what matters.', 'The day is taking shape, {name}.', 'Afternoon, {name}. Find your next clear step.'],
  evening: ['Good evening, {name}. Let’s gather the day.', 'Evening, {name}. What did today make possible?', 'The day is winding down, {name}. Take a breath.'],
} as const

function personalizedGreeting(name: string): string {
  const hour = new Date().getHours()
  const period = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const choices = GREETINGS[period]
  const daySeed = Math.floor(Date.now() / 86_400_000)
  return choices[daySeed % choices.length].replace('{name}', name)
}

export function MorningBrief({ name, tasks, yesterdayPendingTasks, habits, yesterdayDone, yesterdayTotal, quote, onClose, onToggleTask, onEditTask, onOpenHabits, onOpenJournal }: Props) {
  const remaining = tasks.filter((task) => !task.completed).length
  const yesterdayLabel = yesterdayTotal === 0 ? 'No goals were logged yesterday.' : `${yesterdayDone} of ${yesterdayTotal} goals completed yesterday.`
  const greeting = personalizedGreeting(name)

  return (
    <div style={css('position:fixed; inset:0; z-index:280; background:rgba(6,9,14,.72); backdrop-filter:blur(9px); display:flex; align-items:center; justify-content:center; padding:20px;')}>
      <div style={css('width:100%; max-width:620px; max-height:90vh; overflow-y:auto; background:rgba(18,23,32,.95); border:1px solid rgba(255,255,255,.14); border-radius:22px; box-shadow:0 28px 70px rgba(0,0,0,.55); padding:26px; font-family:Manrope,system-ui,sans-serif;')}>
        <div style={css('display:flex; justify-content:space-between; gap:16px; align-items:flex-start;')}>
          <div>
            <div style={css('font-size:11px; font-weight:700; letter-spacing:.18em; color:rgba(130,175,255,.9);')}>DAILY COMPASS</div>
            <div style={css('margin-top:7px; font-size:26px; font-weight:700; color:rgba(255,255,255,.95);')}>{greeting}</div>
            <div style={css('margin-top:7px; font-size:12px; color:rgba(255,255,255,.5);')}>{yesterdayLabel}</div>
          </div>
          <Box onClick={onClose} title="Close Daily Compass" sx="font-family:'Material Symbols Rounded'; font-size:19px; color:rgba(255,255,255,.42); cursor:pointer;" hover="color:#fff">close</Box>
        </div>

        <div style={css('display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:22px;')}>
          <div style={css('padding:14px; border-radius:14px; background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.09);')}>
            <div style={css('font-size:10px; font-weight:700; letter-spacing:.12em; color:rgba(255,255,255,.4);')}>TODAY</div>
            <div style={css('margin-top:6px; font-size:22px; font-weight:700; color:#fff;')}>{remaining} <span style={css('font-size:12px; font-weight:500; color:rgba(255,255,255,.48);')}>tasks waiting</span></div>
          </div>
          <div style={css('padding:14px; border-radius:14px; background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.09);')}>
            <div style={css('font-size:10px; font-weight:700; letter-spacing:.12em; color:rgba(255,255,255,.4);')}>HABITS</div>
            <div style={css('margin-top:6px; font-size:22px; font-weight:700; color:#fff;')}>{habits.length} <span style={css('font-size:12px; font-weight:500; color:rgba(255,255,255,.48);')}>to check in</span></div>
          </div>
        </div>

        <div style={css('margin-top:14px; padding:22px 28px; border-radius:15px; background:linear-gradient(135deg,rgba(76,141,255,.14),rgba(167,139,250,.1)); border:1px solid rgba(130,175,255,.2); display:flex; align-items:center; justify-content:center; gap:12px;')}>
          <span aria-hidden="true" style={css('font-size:34px; line-height:1; color:rgba(130,175,255,.8); align-self:flex-start; margin-top:1px;')}>“</span>
          <div style={css('max-width:520px; text-align:center; font-size:15px; font-weight:600; line-height:1.6; color:rgba(255,255,255,.88);')}>{quote}</div>
          <span aria-hidden="true" style={css('font-size:34px; line-height:1; color:rgba(130,175,255,.8); align-self:flex-end; margin-bottom:1px;')}>”</span>
        </div>

        {yesterdayPendingTasks.length > 0 && (
          <div style={css('margin-top:16px; padding:13px 14px; border-radius:12px; background:rgba(251,191,36,.06); border:1px solid rgba(251,191,36,.18);')}>
            <div style={css('font-size:11px; font-weight:700; letter-spacing:.12em; color:rgba(255,220,135,.78);')}>CARRIED FROM YESTERDAY</div>
            <div style={css('margin-top:4px; font-size:11px; color:rgba(255,255,255,.46);')}>A few things are still waiting. Bring forward what still matters.</div>
            <div style={css('display:flex; flex-direction:column; gap:7px; margin-top:9px;')}>
              {yesterdayPendingTasks.map((task) => (
                <div key={task.id} style={css('display:flex; align-items:center; gap:9px; padding:8px 9px; border-radius:9px; background:rgba(255,255,255,.04);')}>
                  <Box onClick={() => onToggleTask(task.id)} aria-label={`Complete ${task.title}`} sx="font-family:'Material Symbols Rounded'; font-size:17px; line-height:1; color:rgba(255,210,110,.9); cursor:pointer;" hover="color:#fff">radio_button_unchecked</Box>
                  <div style={css('flex:1; min-width:0; font-size:12px; color:rgba(255,255,255,.8); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;')}>{task.title}</div>
                  <Box onClick={() => onEditTask(task)} sx="font-family:'Material Symbols Rounded'; font-size:15px; line-height:1; color:rgba(255,255,255,.3); cursor:pointer;" hover="color:#fff">edit</Box>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={css('margin-top:20px; display:flex; flex-direction:column; gap:18px;')}>
          <div>
            <div style={css('display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;')}>
              <div style={css('font-size:11px; font-weight:700; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>TODAY’S TO-DOS</div>
              <div style={css('font-size:10px; color:rgba(255,255,255,.32);')}>{tasks.length}</div>
            </div>
            {tasks.length === 0 ? (
              <div style={css('padding:12px; border-radius:11px; background:rgba(255,255,255,.035); font-size:11.5px; color:rgba(255,255,255,.4);')}>Nothing asking for your attention yet.</div>
            ) : (
              <div style={css('display:flex; flex-direction:column; gap:7px;')}>
                {tasks.map((task) => (
                  <div key={task.id} style={css('display:flex; align-items:center; gap:9px; padding:10px 11px; border-radius:11px; background:rgba(255,255,255,.04);')}>
                    <Box onClick={() => onToggleTask(task.id)} aria-label={task.completed ? `Mark ${task.title} incomplete` : `Complete ${task.title}`} sx="font-family:'Material Symbols Rounded'; font-size:18px; line-height:1; color:rgba(130,175,255,.9); cursor:pointer;" hover="color:#fff">{task.completed ? 'check_circle' : 'radio_button_unchecked'}</Box>
                    <div style={css('flex:1; min-width:0; font-size:12px; color:rgba(255,255,255,.82); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-decoration:' + (task.completed ? 'line-through' : 'none') + ';')}>{task.title}</div>
                    <Box onClick={() => onEditTask(task)} sx="font-family:'Material Symbols Rounded'; font-size:15px; line-height:1; color:rgba(255,255,255,.3); cursor:pointer;" hover="color:#fff">edit</Box>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={css('display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;')}>
              <div style={css('font-size:11px; font-weight:700; letter-spacing:.14em; color:rgba(255,255,255,.42);')}>TODAY’S HABITS</div>
              <div style={css('font-size:10px; color:rgba(255,255,255,.32);')}>{habits.length}</div>
            </div>
            {habits.length === 0 ? (
              <div style={css('padding:12px; border-radius:11px; background:rgba(255,255,255,.035); font-size:11.5px; color:rgba(255,255,255,.4);')}>A quiet day for your routines.</div>
            ) : (
              <div style={css('display:flex; flex-direction:column; gap:7px;')}>
                {habits.map((habit) => (
                  <div key={habit.id} style={css('display:flex; align-items:center; gap:9px; padding:10px 11px; border-radius:11px; background:rgba(255,255,255,.04);')}>
                    <span style={css("font-family:'Material Symbols Rounded'; font-size:18px; line-height:1; color:rgba(93,202,165,.9);")}>repeat</span>
                    <div style={css('flex:1; font-size:12px; color:rgba(255,255,255,.82);')}>{habit.name}</div>
                    <Box onClick={onOpenHabits} sx="font-size:10px; color:rgba(255,255,255,.42); cursor:pointer;" hover="color:#fff">Check in</Box>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={css('margin-top:22px; padding:13px 14px; border-radius:12px; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.08);')}>
          <div style={css('font-size:11.5px; font-weight:700; color:rgba(255,255,255,.72);')}>Before the day gathers speed</div>
          <div style={css('margin-top:4px; font-size:11px; line-height:1.5; color:rgba(255,255,255,.42);')}>What would make today feel like a day well spent?</div>
          <Box onClick={onOpenJournal} sx="display:inline-block; margin-top:9px; border:1px solid rgba(255,255,255,.12); border-radius:9px; padding:7px 10px; font-size:11px; color:rgba(255,255,255,.65); cursor:pointer;" hover="background:rgba(255,255,255,.08); color:#fff">Set an intention</Box>
        </div>
        <div style={css('display:flex; gap:8px; justify-content:flex-end; margin-top:12px;')}>
          <Box onClick={onClose} sx="border-radius:10px; padding:9px 14px; font-size:11.5px; font-weight:700; color:#fff; background:rgba(76,141,255,.95); cursor:pointer;" hover="background:rgba(96,157,255,1)">Let’s begin</Box>
        </div>
      </div>
    </div>
  )
}
