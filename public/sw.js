// Some Chromium browsers (e.g. Perplexity Comet, Arc) keep their own new-tab
// page and never hand it to an unpacked extension, so `chrome_url_overrides`
// silently does nothing there. This fallback makes Locus reachable anyway:
// clicking the toolbar icon opens the dashboard in a normal tab. No extra
// permissions needed.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
})

// ---- task reminders -------------------------------------------------------
// The new-tab page keeps chrome.alarms in sync with the task list and mirrors
// each alarm's notification text into storage (alarms themselves carry no
// payload). When one fires we look the text up and post a notification.
const TASK_PREFIX = 'locus.task.'
const REMINDERS_KEY = 'locus.reminders'

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(TASK_PREFIX)) return
  const stored = await chrome.storage.local.get(REMINDERS_KEY)
  const map = stored[REMINDERS_KEY] || {}
  const r = map[alarm.name]
  if (!r) return

  const when = r.time ? `${r.due} at ${r.time}` : r.due
  chrome.notifications.create(alarm.name, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Locus reminder',
    message: r.title,
    contextMessage: `Due ${when}`,
    priority: 2,
  })

  // One-shot: drop it so a later re-sync doesn't resurrect a fired reminder.
  delete map[alarm.name]
  await chrome.storage.local.set({ [REMINDERS_KEY]: map })
})

chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
  chrome.notifications.clear(id)
})
