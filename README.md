# Jarvis — new-tab dashboard for Chrome

Replaces the browser's new-tab page with a personal dashboard: bookmark boards
that sync two-way with Chrome, a to-do list, quick notes, a calendar journal, a
habit tracker, custom wallpaper, a search-engine switcher, a Google-apps
launcher, plus real history and top sites.

**100% local.** No account, no server, no tracking. Everything is stored in
`chrome.storage.local` on your machine and never leaves the browser. Bookmarks
are read from and written to Chrome's own bookmark store.

Built with Vite + React + TypeScript. Manifest V3.

---

## Install (unpacked)

Not on the Chrome Web Store yet — load it manually. Works in Chrome, Edge,
Brave, and any other Chromium browser.

1. **Download the code** — clone this repo or use *Code → Download ZIP* and unzip
   it.
2. **Build it:**
   ```bash
   cd jarvis
   npm install
   npm run build
   ```
   This creates a `dist/` folder.
3. Open `chrome://extensions` (Edge: `edge://extensions`, Brave:
   `brave://extensions`).
4. Turn on **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the `jarvis/dist` folder.
6. **Keep the `dist` folder where it is** — don't move or delete it. Chrome loads
   the extension from that path every time.
7. Open a new tab. If Chrome asks *"An extension changed your New Tab page"* →
   **Keep it**.

To update later: `git pull`, `npm run build` again, then click the ↻ reload icon
on the Jarvis card in `chrome://extensions`.

To uninstall: `chrome://extensions` → **Remove**. Your normal new tab comes back.

### The "Developer mode extensions" bar

Because Jarvis is loaded unpacked, Chrome shows a bar every time you start the
browser:

> **Disable developer mode extensions** — Extensions running in developer mode
> can harm your computer.

This is normal for any unpacked extension and does **not** mean anything is
wrong. Just click the **✕** to dismiss it for the session. Options to stop it
reappearing:

- **Easiest:** click ✕ each time it shows up.
- Keep the browser open (it only appears on a fresh launch).
- On managed/enterprise Chrome it can be suppressed via policy, but that's not
  worth it for personal use.

It goes away entirely once the extension is installed from the Chrome Web Store.

---

## First run

The first time you open a new tab, Jarvis:

- runs a **guided walkthrough** that spotlights each part of the dashboard in
  turn — pages, search, boards, notes, habits, calendar, tasks, the toolbar —
  with a tooltip pointing at each one (Next / Back or ← →, Skip any time).
  Replay it from **Settings → Help → Replay walkthrough**;
- adds a few **sample cards** — a couple of notes, tasks and habits — so the
  dashboard isn't empty. Delete them whenever you like;
- creates one sample bookmark board called **"Getting started"** *only if you
  have no bookmark folders yet*. If you already have bookmark folders, your real
  ones show up instead and nothing is added.

---

## Features

- **Bookmark boards** — a board is a top-level folder under the Bookmarks Bar or
  Other Bookmarks. Add / rename / delete boards and bookmarks here and it writes
  through to your real Chrome bookmarks; external changes show up live. Drag the
  ⠿ handle to reorder (Jarvis-local order, doesn't touch your bookmark bar).
  **Boards are per-page** — each board belongs to one page and only shows there.
  New boards land on the page you're on; move a board to another page with the
  ⇄ icon in its header (or drag its ⠿ handle onto a page tab). Any folder made
  directly in Chrome shows up on whichever page is active when Jarvis first sees
  it.
- **Tasks** — due dates, times, priority, today / upcoming / done filters.
- **Notes** — lightweight titled text notes.
- **Habit tracker** — 7-day grid, click a cell to toggle, click the name to
  rename.
- **Calendar journal** — click any day to add dated entries with categories.
- **Pages** — the tabs at the top are independent dashboards: each has its own
  notes, tasks, habits, journal **and bookmark boards** (e.g. Work vs Personal).
- **Search** — type to search, press `/` anywhere to focus the box. Switch
  between Google, Google Images, Bing, DuckDuckGo, YouTube. Paste or drop an
  image with the Images engine for a reverse-image search.
- **Google apps launcher** — grid icon; the pencil opens a picker to add/remove
  apps.
- **Wallpaper** — the icon top-right sets any local image or GIF as the
  background.
- **History & top sites** — real data from your profile, in Settings.
- **Import / export** — see below.
- **Privacy mode** — opens an incognito window (needs "Allow in Incognito"
  enabled on `chrome://extensions`).

---

## Develop

```bash
cd jarvis
npm install
npm run dev      # http://localhost:5173
```

In `vite dev` there is no `chrome.*` API, so:

- bookmarks fall back to a local seeded list stored in `localStorage`,
- favicons render as letter tiles,
- history / incognito are inert.

```bash
npm run lint     # oxlint
npm run build    # tsc -b && vite build  -> dist/
```

`npx vite build --watch` rebuilds `dist/` on every change; still hit the reload
icon on the extension card to pick it up.

---

## Project layout

```
src/
  App.tsx            all state (useReducer) + layout + widgets + modals
  state.ts           constants, sample-data seeds, reducer, persisted-key list
  types.ts
  components/        Box, Clock, Favicon, Walkthrough, ErrorBoundary
  lib/               css (string->style parser), storage, nav, id, normalize
  chrome/            bookmarks, history, topsites, favicon, windows, env
  import/            format detection + adapters
public/
  manifest.json      MV3
  fonts/             self-hosted Manrope + Material Symbols (woff2)
  icons/             16 / 48 / 128 png
```

### Stable extension ID

`public/manifest.json` contains a `key` (a public key). It pins the extension ID
so your stored data survives reloads and reinstalls from the same folder. It is
**not** a secret. The private half (`.extension-key.pem`) is git-ignored and only
matters if you want to package a signed `.crx` — for normal unpacked use you can
ignore it, or delete the `key` line entirely and Chrome will assign an ID.

---

## Import / export

Settings → Import / export. Import detects the file format, shows a preview
(counts + per-board breakdown + warnings), and only applies on confirm.
Bookmarks merge into boards of the same name; duplicate URLs and already-present
notes/tasks/habits are skipped, so re-importing is a safe no-op.

Supported:

- **Jarvis backup** — `jarvis-backup.json` from Export
- **Browser bookmarks HTML** — the `bookmarks.html` Chrome / Firefox / Safari /
  Edge export
- **Chrome bookmarks file** — the raw `Bookmarks` JSON from a Chrome profile dir
- **Boardmarks** export
- **Generic (best effort)** — any other JSON, scanned for bookmark / note / task
  / habit shapes

Add a format by writing an adapter (`detect` + `parse`) in
`src/import/adapters/` and registering it in `src/import/index.ts`.

---

## Privacy

Jarvis requests these permissions and nothing else:

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | save your notes/tasks/habits/journal/wallpaper locally |
| `bookmarks` | show and edit your bookmark boards |
| `history` | the "recent activity" list in Settings |
| `topSites` | the top-sites suggestions |
| `favicon` | site icons on bookmarks |

No network requests are made by the extension itself. No analytics. Your data is
yours and stays on your device.

---

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship your own version.
