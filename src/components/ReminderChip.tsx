import { css } from '../lib/css'
import { reminderLabel } from '../lib/reminders'

/** Small "a notification is scheduled" marker shown on a task row. */
export function ReminderChip({ remind }: { remind: string }) {
  const label = reminderLabel(remind)
  if (!label) return null
  return (
    <span
      title={'Reminder · ' + label}
      style={css(
        'display:inline-flex; align-items:center; gap:3px; font-size:9.5px; font-weight:600; color:rgba(150,185,255,.92); white-space:nowrap;',
      )}
    >
      <span style={css("font-family:'Material Symbols Rounded'; line-height:1; font-size:12px;")}>notifications_active</span>
      {label}
    </span>
  )
}
