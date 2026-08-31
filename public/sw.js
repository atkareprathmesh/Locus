// Some Chromium browsers (e.g. Perplexity Comet, Arc) keep their own new-tab
// page and never hand it to an unpacked extension, so `chrome_url_overrides`
// silently does nothing there. This fallback makes Locus reachable anyway:
// clicking the toolbar icon opens the dashboard in a normal tab. No extra
// permissions needed.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
})
