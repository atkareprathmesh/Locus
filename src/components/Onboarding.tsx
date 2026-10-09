import { useState } from 'react'
import { Box } from './Box'
import { css } from '../lib/css'

type Props = {
  onComplete: (name: string, enableNotifications: boolean) => void | Promise<void>
}

export function Onboarding({ onComplete }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (enableNotifications: boolean) => {
    const value = name.trim()
    if (!value || busy) return
    setBusy(true)
    await onComplete(value, enableNotifications)
    setBusy(false)
  }

  return (
    <div style={css('position:fixed; inset:0; z-index:300; background:rgba(6,9,14,.7); backdrop-filter:blur(10px); display:flex; align-items:center; justify-content:center; padding:20px;')}>
      <div style={css('width:100%; max-width:390px; background:rgba(18,23,32,.94); border:1px solid rgba(255,255,255,.14); border-radius:22px; box-shadow:0 28px 70px rgba(0,0,0,.55); padding:26px; font-family:Manrope,system-ui,sans-serif;')}>
        <div style={css('font-size:21px; font-weight:700; color:rgba(255,255,255,.95);')}>Welcome to Locus</div>
        <label style={css('display:flex; flex-direction:column; gap:7px; margin-top:20px; font-size:10px; font-weight:700; letter-spacing:.14em; color:rgba(255,255,255,.45);')}>
          WHAT CAN WE CALL YOU?
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit(true)
            }}
            placeholder="Your name"
            style={css('padding:12px 13px; font-size:14px; letter-spacing:normal;')}
          />
        </label>
        <div style={css('display:flex; gap:8px; align-items:center; margin-top:16px; font-size:11px; color:rgba(255,255,255,.45);')}>
          <span style={css("font-family:'Material Symbols Rounded'; font-size:16px; line-height:1; color:rgba(130,175,255,.85); flex-shrink:0;")}>notifications</span>
          Turn on reminders to stay on track.
        </div>
        <Box
          onClick={() => void submit(true)}
          sx="margin-top:20px; border-radius:11px; padding:11px 16px; text-align:center; font-size:12.5px; font-weight:700; color:#fff; background:rgba(76,141,255,.95); cursor:pointer;"
          hover="background:rgba(96,157,255,1)"
        >
          {busy ? 'Setting up Locus…' : 'Continue with reminders'}
        </Box>
        <Box
          onClick={() => void submit(false)}
          sx="margin-top:9px; padding:7px; text-align:center; font-size:11px; color:rgba(255,255,255,.4); cursor:pointer;"
          hover="color:rgba(255,255,255,.75)"
        >
          Continue without reminders
        </Box>
      </div>
    </div>
  )
}
