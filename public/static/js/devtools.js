const inspectedTabId = chrome.devtools.inspectedWindow.tabId
// Firefox has no getResources, nor the frameURL and useContentScriptContext eval options.
const hasResourcesApi =
  typeof chrome.devtools.inspectedWindow.getResources === 'function'

// In Firefox onShown only fires when switching between sidebar panes
let panelVisible = !hasResourcesApi
let isPageLoaded = true
// seeded by time to keep increasing when this page reloads
let generation = Date.now()

function informPanel(info, extra = {}) {
  chrome.runtime
    .sendMessage({
      action: 'inform',
      info,
      tabId: inspectedTabId, // to specify message from
      ...extra,
    })
    .catch(console.log)
}

// stored before anything else happens, the panel takes the current generation from here
function nextGeneration() {
  generation += 1
  const current = generation
  return new Promise((resolve) => {
    chrome.storage.local.set({ ['generation:' + inspectedTabId]: current }, () => {
      resolve(current)
    })
  })
}

function getAllFramesUrl() {
  const framesURLArray = []
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.getResources((resources) => {
      for (var i = 0; i < resources.length; i++) {
        if (
          resources[i].type === 'document' &&
          resources[i].url.match(/^(https?:|file:\/)\/\//) !== null
        ) {
          framesURLArray.push(resources[i].url)
        }
      }
      resolve(framesURLArray)
    })
  })
}

function evalInAllFrames(cancel, current) {
  getAllFramesUrl().then((arrFrameURL) => {
    // a late cancel must not stop the newer run
    if (current !== generation) {
      return
    }
    // console.log('arrFrameURL', arrFrameURL)
    if (arrFrameURL.length === 0) {
      informPanel('frameURLsEmpty')
    }
    arrFrameURL.forEach(function (ele) {
      chrome.devtools.inspectedWindow.eval(
        'getCssUsed(' + (cancel ? 'undefined' : '$0') + ',' + current + ')',
        {
          frameURL: ele,
          useContentScriptContext: true,
        },
        function (result, isException) {
          if (isException) {
            console.log("evalGetCssUsed isException: ",isException);
          } else {
            // console.log('evalGetCssUsed result: ',result);
          }
        }
      )
    })
  })
}

function dispatchSelection(cancel, current) {
  chrome.runtime.sendMessage(
    { action: 'cancelRun', tabId: inspectedTabId, generation: current },
    () => {
      if (cancel || current !== generation) {
        return
      }
      // before the dispatch, as the content script can answer the panel right after it
      informPanel('runDispatched', { generation: current })
      chrome.devtools.inspectedWindow.eval(
        `(() => {
          const el = $0
          if (!el) return 'none'
          el.dispatchEvent(new CustomEvent('css-used:select', {
            bubbles: false, composed: true, detail: ${current},
          }))
          return 'dispatched'
        })()`,
        (result, exception) => {
          if (current !== generation) {
            return
          }
          if (exception) {
            informPanel('frameURLsEmpty')
          } else if (result === 'none') {
            // $0 is empty when the selection is inside a cross-origin frame
            informPanel('selectionUnreachable', { generation: current })
          }
        }
      )
    }
  )
}

async function evalGetCssUsed(cancel = false) {
  if ((!cancel && !panelVisible) || (hasResourcesApi && !isPageLoaded)) {
    return
  }
  const current = await nextGeneration()
  if (current !== generation) {
    return
  }
  if (hasResourcesApi) {
    evalInAllFrames(cancel, current)
  } else {
    dispatchSelection(cancel, current)
  }
}

chrome.devtools.panels.elements.onSelectionChanged.addListener(function () {
  evalGetCssUsed()
  // console.log('onSelectionChanged')
  informPanel('onSelectionChanged')
})

chrome.devtools.network.onNavigated.addListener(function () {
  // console.log('onNavigated')
  isPageLoaded = false
  nextGeneration()
  informPanel('onNavigated')
  // initialText = `on Navigated.<li>Select another dom on the left </li>or<li>Reopen the Devtool</li>`
})

chrome.devtools.panels.elements.createSidebarPane(
  'CSS Used',
  function (sidebar) {
    // sidebar.setHeight('calc(100vh - 48px)')
    sidebar.setPage('panel.html')
    sidebar.onShown.addListener(function (win) {
      // console.log('onShown')
      panelVisible = true
      evalGetCssUsed()
      informPanel('onShown')
    })
    sidebar.onHidden.addListener(function () {
      // console.log('onHidden')
      evalGetCssUsed(true)
      panelVisible = false
      informPanel('onHidden')
    })
  }
)

if (!hasResourcesApi) {
  // a result produced before the panel was loaded would be lost
  chrome.storage.onChanged.addListener((changes) => {
    if (changes['panelLoaded:' + inspectedTabId]) {
      evalGetCssUsed()
    }
  })
}

// passing resources to content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // console.log('sender,message', sender, message)
  // Messages from content scripts should have sender.tab set, or be relayed by background.js
  if (
    (sender.tab && sender.tab.id === inspectedTabId) ||
    (message.relayed && message.tabId === inspectedTabId)
  ) {
    if (message.action == 'getResourceContent' && hasResourcesApi) {
      chrome.devtools.inspectedWindow.getResources((resources) => {
        // console.log('resources', resources);
        const resourceMatched = resources.find((r) => r.url === message.url)
        if (!resourceMatched) {
          sendResponse({ ok: false, url: message.url, reason: 'not a page resource' })
          return
        }
        resourceMatched.getContent((content, encoding) => {
          // https://developer.chrome.com/docs/extensions/reference/devtools_inspectedWindow/#method-getResources
          // encoding:Currently, only base64 is supported.
          // console.log(resourceMatched, encoding, content.length);
          sendResponse({
            url: message.url,
            content,
          })
        })
      })
      // https://stackoverflow.com/questions/44056271/chrome-runtime-onmessage-response-with-async-await
      return true
    } else if (message.action == 'evalGetCssUsed') {
      isPageLoaded = true
      evalGetCssUsed()
    }
  } else {
    // Messages from panel scripts
  }
})
