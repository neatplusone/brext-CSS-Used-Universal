<script lang="ts">
  import chrome from './mockChromeAPI'
  import debugMode from '../const/debugMode'

  // Whether this extention can access file://
  let isFileProtocol = false
  let haveAccessToFileURLs = true
  let isGooglePreservedPages = false
  let strHtml = ''
  let strCss = ''
  let popVisible = false
  let tipsVisible = false
  let popText = ''
  let unreadable: string[] = []
  // only the devtools page sets this, through storage. Messages can't.
  let generation: number | null = null
  let dispatchTimer: ReturnType<typeof setTimeout>
  // a fast run can answer before storage tells this panel about its generation
  let earlyMessages = []
  const tabId = chrome.devtools.inspectedWindow.tabId
  const generationKey = 'generation:' + tabId
  // the panel can't ask for the tab in Firefox, background.js can
  const canUseTabs = !!chrome.tabs
  let dataForCodepen = {
    title: 'New Pen!',
    html: '<div>Hello, World!</div>',
    css: '',
  }

  function checkAllowedFileSchemeAccess(): Promise<boolean> {
    return new Promise((res) => {
      if (canUseTabs) {
        chrome.extension.isAllowedFileSchemeAccess((allow: boolean) => {
          res(allow)
        })
      } else {
        chrome.runtime.sendMessage(
          { action: 'getPageInfo', tabId },
          (info: { fileAccess?: boolean }) => {
            res(!!(info && info.fileAccess))
          }
        )
      }
    })
  }

  async function updateAccessToURL() {
    // check file:// permission
    haveAccessToFileURLs = await checkAllowedFileSchemeAccess()
    // check if is google preserved pages
    const inspectedTabUrl = await getInspectedTabUrl()
    if (
      inspectedTabUrl.match(
        /^(chrome|about:|moz-extension:|https:\/\/chrome\.google\.com\/webstore|https:\/\/addons\.mozilla\.org)/
      ) !== null
    ) {
      isGooglePreservedPages = true
    } else {
      isGooglePreservedPages = false
    }
    // check if local files
    if (inspectedTabUrl.match(/^(file)/) !== null) {
      isFileProtocol = true
    } else {
      isFileProtocol = false
    }
  }

  function getInspectedTabUrl(): Promise<string> {
    return new Promise((res) => {
      if (!canUseTabs) {
        chrome.runtime.sendMessage(
          { action: 'getPageInfo', tabId },
          (info: { url?: string }) => {
            res((info && info.url) || '')
          }
        )
        return
      }
      chrome.tabs.query({}, function (results) {
        results.forEach(function (ele) {
          if (ele.id === chrome.devtools.inspectedWindow.tabId) {
            res(ele.url)
          }
        })
        res('')
      })
    })
  }
  function preview() {
    const regNoProtocol = /(['"]|\(['"]?)\/\//g
    const strAddProtocol = '$1http://'
    const html = strHtml.replace(regNoProtocol, strAddProtocol)
    const css = strCss.replace(regNoProtocol, strAddProtocol)

    const previewDoc = new DOMParser().parseFromString(
      '<!DOCTYPE html>' + html,
      'text/html'
    )
    // the local preview will have two injected style
    // which contains body fontsize 75%
    // making body fontsize 75%*75%
    // That's not correct.
    const styleDefault = previewDoc.createElement('style')
    styleDefault.appendChild(previewDoc.createTextNode(`body{font-size:100%;}`))
    previewDoc.head.appendChild(styleDefault)
    // insert the picked css rules, which must not close the style tag when serialized
    const styleInsert = previewDoc.createElement('style')
    styleInsert.appendChild(
      previewDoc.createTextNode(css.replace(/<\/style/gi, '<\\/style'))
    )
    previewDoc.head.appendChild(styleInsert)

    const url = URL.createObjectURL(
      new Blob(['<!DOCTYPE html>' + previewDoc.documentElement.outerHTML], {
        type: 'text/html',
      })
    )
    window.open(url)
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  let textareaCss: HTMLTextAreaElement
  let btnCopyText = 'Copy'

  function copyResult() {
    textareaCss.select()
    document.execCommand('copy')
    btnCopyText = 'Copied'
    setTimeout(() => {
      btnCopyText = 'Copy'
    }, 1500)
  }

  function openCSSUsedSettings() {
    chrome.tabs.create({
      url: 'chrome://extensions/?id=' + chrome.runtime.id,
    })
  }

  // function refreshContentScript() {
  //   chrome.devtools.inspectedWindow.reload()
  // }

  function gotoGithubFAQ() {
    window.open('https://github.com/neatplusone/brext-CSS-Used-Universal#faq')
  }

  let className = ''
  updateTheme()
  function updateTheme() {
    className = ' theme-' + chrome.devtools.panels.themeName
  }

  function isCurrentRun(message: { generation?: number }) {
    return (
      debugMode || (generation !== null && message.generation === generation)
    )
  }

  function showUnavailable(expected = generation) {
    updateAccessToURL().then(() => {
      if (expected !== generation) {
        return
      }
      popVisible = true
      if (isGooglePreservedPages) {
        popText = 'Extensions are not allowed to run on this browser page.'
      } else if (isFileProtocol) {
        tipsVisible = true
      } else {
        popText = "Can't work on this page."
      }
    })
  }

  function handleRunMessage(message) {
    clearTimeout(dispatchTimer)
    if (message.action === 'inform') {
      popVisible = true
      popText = message.info
    } else if (message.action === 'celebrate') {
      popVisible = false
      unreadable = message.unreadable || []
      strHtml = message.html
      strCss = message.css
      dataForCodepen.html = strHtml
      dataForCodepen.css = strCss
    }
  }

  chrome.storage.local.get(generationKey, (items) => {
    if (generation === null && items[generationKey] !== undefined) {
      generation = items[generationKey]
      const replay = earlyMessages.filter((m) => isCurrentRun(m))
      earlyMessages = earlyMessages.filter((m) => m.generation > generation)
      replay.forEach(handleRunMessage)
    }
  })
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[generationKey] && changes[generationKey].newValue) {
      generation = changes[generationKey].newValue
      const replay = earlyMessages.filter((m) => isCurrentRun(m))
      earlyMessages = earlyMessages.filter((m) => m.generation > generation)
      replay.forEach(handleRunMessage)
    }
  })
  chrome.storage.local.set({ ['panelLoaded:' + tabId]: Date.now() })

  chrome.runtime.onMessage.addListener((message, sender) => {
    // console.log('sender,message from panel', sender, message)
    // console.log('sender.tab',sender.tab);
    tipsVisible = false
    // Messages from content scripts should have sender.tab set
    // or be relayed by background.js
    if (
      (sender.tab && sender.tab.id === tabId) ||
      (message.relayed && message.tabId === tabId)
    ) {
      if (isCurrentRun(message)) {
        handleRunMessage(message)
      } else if (
        message.action !== 'evalGetCssUsed' &&
        (generation === null || message.generation > generation)
      ) {
        earlyMessages.push(message)
      }
    } else {
      // Messages from devtools.js
      if (message.tabId === tabId) {
        if (message.action === 'inform') {
          if (
            message.info === 'onShown' ||
            message.info === 'onSelectionChanged'
          ) {
            // updateAccessToFileURLs()
            updateTheme()
          } else if (message.info === 'onNavigated') {
            popVisible = true
            popText = 'onNavigated'
          } else if (message.info === 'frameURLsEmpty') {
            clearTimeout(dispatchTimer)
            showUnavailable()
          } else if (message.info === 'selectionUnreachable') {
            clearTimeout(dispatchTimer)
            popVisible = true
            popText =
              "Can't reach this element. In Firefox, extensions can't read a selection inside a cross-origin iframe. Open the iframe's URL in its own tab instead."
          } else if (message.info === 'runDispatched') {
            // no answer means no content script here, such as on a restricted page
            clearTimeout(dispatchTimer)
            dispatchTimer = setTimeout(() => {
              if (isCurrentRun(message)) {
                showUnavailable()
              }
            }, 1500)
          }
        }
      }
    }
  })

  function debugSendMessage() {
    chrome.runtime.sendMessage({
      action: 'inform',
      info: 'onSelectionChanged\n' + Math.random(),
      _from: 'content',
    })
  }
  function debugSendMessageError() {
    chrome.runtime.sendMessage({
      action: 'inform',
      info: 'frameURLsEmpty',
      _from: 'devtools',
    })
  }
</script>

<main class={className}>
  <div class="title">
    <span>CSS Used by $0 and its descendants:</span>
    <button class="plain" on:click={gotoGithubFAQ}>FAQ</button>
  </div>
  {#if unreadable.length > 0}
    <div class="notice">
      This result may be incomplete, these stylesheets couldn't be read:
      {#each unreadable as url}
        <div class="notice-url">{url}</div>
      {/each}
    </div>
  {/if}
  <div class="output">
    <textarea
      disabled={strCss === ''}
      value={strCss}
      bind:this={textareaCss}
      placeholder="no data"
      spellcheck="false"
    />
  </div>
  <div class="operate">
    <button on:click={copyResult} disabled={strCss === ''} class="copy"
      >{btnCopyText}</button
    >
    <button on:click={preview} disabled={strCss === ''}>Preview</button>
    <form action="https://codepen.io/pen/define" method="POST" target="_blank">
      <input type="hidden" name="data" value={JSON.stringify(dataForCodepen)} />
      <button
        disabled={strCss === ''}
        title="Send snippet to CodePen"
        type="submit">CodePen</button
      >
    </form>
  </div>

  {#if popVisible}
    <div class="pop">
      <!-- <p>For the first time installed/updated/allowedFileAccess:</p> -->
      {#if tipsVisible}
        <div class="tips">
          <p>Extensions can't work on file:/// pages by default.</p>
          {#if canUseTabs}
            <p>
              You can <button on:click={openCSSUsedSettings} class="plain"
                >turn on</button
              > the "Allow access to file URLs"
            </p>
            <p>And restart chrome if necessary.</p>
          {:else}
            <p>You can allow access to local files for CSS Used in about:addons.</p>
          {/if}
        </div>
      {:else}
        <div class="info">
          <pre>{popText}</pre>
        </div>
      {/if}
    </div>
  {/if}

  {#if debugMode}
    <div class="debug-tool">
      <button on:click={debugSendMessage}>sendmessage:info</button>
      <button on:click={debugSendMessageError}>sendmessage:error</button>
    </div>
  {/if}
</main>

<style>
  .debug-tool {
    position: fixed;
    bottom: 50px;
    left: 10px;
    opacity: 0.3;
    border: 1px solid #38c;
    box-sizing: border-box;
  }
  .debug-tool:hover {
    opacity: 1;
  }
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .title {
    padding: 0 2px;
    box-sizing: border-box;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 26px;
    font-size: 11px;
  }
  .title span {
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  .title button {
    z-index: 1;
    flex: none;
    background: none;
    text-decoration: underline;
    cursor: pointer;
    padding: 0.3em 0.6em;
    border-radius: 4px;
  }
  .notice {
    padding: 4px 10px;
    font-size: 11px;
    color: #b45309;
  }
  .notice-url {
    word-break: break-all;
  }
  .output {
    flex: 1;
    position: relative;
    min-height: 0;
    display: flex;
    align-items: stretch;
  }
  textarea {
    font-family: Consolas, 'Lucida Console', monospace;
    font-size: 12px;
    width: 100%;
    box-sizing: border-box;
    padding: 10px;
    border: 1px solid #ccc;
    border-left: none;
    border-right: none;
    resize: none;
    overflow: auto;
  }
  button {
    position: relative;
    font-size: 12px;
    display: block;
    margin-right: 10px;
    margin: 2px;
    height: 24px;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    padding: 0px 12px;
    font-weight: 500;
    color: #1a73e8;
    background-color: #fff;
    flex: none;
    white-space: nowrap;
    height: 28px;
    margin: 8px 16px 8px 0;
  }
  button[disabled] {
    filter: grayscale(1) opacity(0.5);
  }
  button:not([disabled]):hover {
    background-color: #f3f3f3;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
  button.plain {
    background: none;
    text-decoration: underline;
    cursor: pointer;
    padding: 0.3em 0.6em;
    border-radius: 4px;
    border: none;
  }

  button.copy {
    background-color: #1a73e8;
    border: none;
    color: #fff;
  }
  button.copy:not([disabled]):hover {
    background-color: #3b86e8;
  }

  /* ::selection {
    background: #cfe8fc;
  } */
  textarea:focus {
    outline: none;
  }

  .pop {
    font-size: 12px;
    width: 100%;
    height: 100%;
    position: fixed;
    top: 0px;
    left: 0px;
    background: rgba(255, 255, 255, 0.77);
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
  }
  .pop p {
    margin: auto;
  }

  .pop .info {
    padding-left: 10px;
  }
  .pop .info pre {
    white-space: break-spaces;
  }

  form {
    font-size: 12px;
    margin-right: 10px;
    position: relative;
    display: block;
  }
  /* form .btn{margin:0;} */
  .operate {
    position: relative;
    display: flex;
    clear: both;
    margin-left: 10px;
    flex-wrap: wrap;
  }

  .theme-dark {
    color: rgba(255, 255, 255, 0.87);
    background-color: #242424;
  }
  .theme-dark textarea {
    background-color: #242424;
    border-color: #525252;
    color: rgb(217, 217, 217);
  }
  .theme-dark ::selection {
    background-color: #999;
  }
  .theme-dark .pop {
    color: #ccc;
    background: rgba(0, 0, 0, 0.55);
  }
  .theme-dark ::-webkit-scrollbar {
    background: #333;
    width: 14px;
    cursor: pointer;
  }
  .theme-dark ::-webkit-scrollbar-thumb {
    background: #333333;
    border: 1px solid #414141;
  }
  .theme-dark ::-webkit-scrollbar-thumb:hover {
    cursor: default;
  }
  .theme-dark ::-webkit-scrollbar-track {
    background: #242424;
    border-left: 1px solid #2b2b2b;
  }
  .theme-dark button {
    border-color: rgba(230, 230, 230, 0.2);
    color: #cccccc;
    background-color: rgb(36, 36, 36);
  }
  .theme-dark button.plain {
    border-color: transparent;
    background: none;
  }
  .theme-dark button:not([disabled]):hover {
    background-color: #333333;
    box-shadow: rgba(230, 230, 230, 0.1) 0px 1px 2px;
  }
  .theme-dark .pop button.plain {
    color: inherit;
  }
  .theme-dark .pop button.plain:not([disabled]):hover {
    color: #cccccc;
  }
  .theme-dark button.copy {
    background-color: #0e639c;
    border: none;
    color: #fff;
  }
  .theme-dark button.copy:not([disabled]):hover {
    background-color: #1177bb;
  }
</style>
