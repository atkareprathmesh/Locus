/** True when running as an actual extension page (not `vite dev` in a browser). */
export const isExtension =
  typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id

export const hasBookmarks = isExtension && typeof chrome.bookmarks !== 'undefined'
export const hasHistory = isExtension && typeof chrome.history !== 'undefined'
export const hasTopSites = isExtension && typeof chrome.topSites !== 'undefined'
export const hasStorage = isExtension && typeof chrome.storage !== 'undefined'
export const hasDownloads = isExtension && typeof chrome.downloads !== 'undefined'
export const hasAlarms = isExtension && typeof chrome.alarms !== 'undefined'

export const extensionId = isExtension ? chrome.runtime.id : ''
