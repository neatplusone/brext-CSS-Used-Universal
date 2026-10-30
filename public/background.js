// Firefox runs this as an event page, Chrome as a service worker.
// In Firefox, messages from content scripts reach neither the panel nor the devtools page,
// and devtools has no getResources. Chrome needs neither of the two workarounds below.
const isEventPage = typeof ServiceWorkerGlobalScope === 'undefined'
const RELAYED_ACTIONS = ['inform', 'celebrate', 'evalGetCssUsed']
const FETCH_TIMEOUT = 15000

async function fetchStylesheet(url) {
  try {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'force-cache',
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok) {
      return { ok: false, status: response.status, reason: 'HTTP ' + response.status }
    }
    // a login redirect or an error page, with status 200
    if (contentType.includes('text/html')) {
      return { ok: false, status: response.status, reason: 'got an HTML page' }
    }
    return { ok: true, status: response.status, content: await response.text() }
  } catch (error) {
    return { ok: false, reason: String(error) }
  }
}

async function getPageInfo(tabId) {
  const tab = await chrome.tabs.get(tabId)
  const fileAccess = await chrome.extension.isAllowedFileSchemeAccess()
  return { url: tab.url || '', fileAccess }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'cancelRun') {
    chrome.tabs
      .sendMessage(message.tabId, {
        action: 'cancelRun',
        generation: message.generation,
      })
      .catch(() => {})
      .then(() => sendResponse({}))
    return true
  }
  if (message.action === 'getPageInfo') {
    getPageInfo(message.tabId).then(sendResponse, () => sendResponse({ url: '' }))
    return true
  }
  if (!isEventPage || !sender.tab) {
    return
  }
  if (message.action === 'getResourceContent') {
    fetchStylesheet(message.url).then(sendResponse)
    return true
  }
  if (RELAYED_ACTIONS.includes(message.action)) {
    chrome.runtime
      .sendMessage({ ...message, relayed: true, tabId: sender.tab.id })
      .catch(() => {})
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(['generation:' + tabId, 'panelLoaded:' + tabId])
})
