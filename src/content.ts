import filterRules from './util/filterRules'
import convLinkToText from './util/convLinkToText'
import convTextToRules from './util/convTextToRules'
import postTideCss from './util/postTideCss'
import generateRulesAll from './util/generateRulesAll'
import cleanHTML from './util/cleanHTML'
import { inform } from './util/runContext'
import type { RunContext } from './util/runContext'

type cssNodeObj = Awaited<ReturnType<typeof convTextToRules>>

const externalCssCache: { [index: string]: cssNodeObj } = {}
//to store timers of testing if a html element matches a rule selector.
const arrTimerOfTestingIfMatched: ReturnType<typeof setTimeout>[] = []
// the newest arrival always wins, a forged event can't lock out later runs
let latestGeneration = 0

// isOwnFrame: triggered by the selection event, which only reaches the frame $0 is in.
async function getC($0: HTMLElement, generation = 0, isOwnFrame = false) {
  latestGeneration = generation
  arrTimerOfTestingIfMatched.forEach(function (ele) {
    clearTimeout(ele)
  })
  // reset to empty
  arrTimerOfTestingIfMatched.length = 0

  if (
    $0 === null ||
    typeof $0 === 'undefined' ||
    typeof $0.nodeName === 'undefined'
  ) {
    return
  }

  const ctx: RunContext = {
    generation,
    doc: $0.ownerDocument,
    isCurrent: () => generation === latestGeneration,
    unreadable: new Set(),
  }

  if ($0.nodeName.match(/^(<pseudo:|_moz_generated_content)/)) {
    inform(ctx, "It's a pseudo element")
    return
  }

  if ($0.nodeName === 'html' || $0.nodeName.match(/^#/)) {
    inform(ctx, 'Not for this element')
    return
  }

  if (!isOwnFrame) {
    let isInSameOrigin = true
    try {
      $0.ownerDocument.defaultView.parent.document
    } catch (e) {
      isInSameOrigin = false
    }

    if (isInSameOrigin) {
      // if same isInSameOrigin
      // $0 can be accessed from its parent context
      if ($0.ownerDocument.defaultView.parent.document !== document) {
        return
      }
    }
  }

  inform(ctx, 'Preparing ...')

  // console.log('NOT return,begin');
  const links: string[] = []

  ctx.doc
    .querySelectorAll('link[rel~="stylesheet"][href]')
    .forEach((ele: HTMLLinkElement) => {
      // if href==='' , ele.getAttribute('href') !== ele.href
      const current = externalCssCache[ele.href]
      if (
        ele.getAttribute('href') &&
        (current === undefined || current.nodes.length === 0)
      ) {
        links.push(ele.href)
      }
    })

  try {
    const result = await convLinkToText(links, ctx)
    for (let i = 0; i < result.length; i++) {
      const rulesObj = await convTextToRules(result[i].cssraw, links[i])
      // a superseded run must not overwrite what a newer one cached
      if (!ctx.isCurrent()) {
        return
      }
      externalCssCache[rulesObj.href] = rulesObj
    }
  } catch (err) {
    console.error('CSS-Used: ', err)
    inform(ctx, 'convLinkToText error, see detail in console')
  }
  if (!ctx.isCurrent()) {
    return
  }

  const objCss = await generateRulesAll(ctx.doc, externalCssCache, ctx)
  if (!ctx.isCurrent()) {
    return
  }

  // {fontFace : Array, keyFram : Array, normRule : Array}
  const data = await filterRules($0, objCss, arrTimerOfTestingIfMatched, ctx)
  if (!ctx.isCurrent()) {
    return
  }

  chrome.runtime
    .sendMessage({
      action: 'celebrate',
      generation,
      css: postTideCss(data),
      html: cleanHTML($0.outerHTML, ctx.doc),
      unreadable: Array.from(ctx.unreadable),
    })
    .catch(() => {})
}

// Where devtools can't eval in this script's context, it dispatches this on $0 from the page.
window.addEventListener(
  'css-used:select',
  (event: CustomEvent) => {
    getC(event.composedPath()[0] as HTMLElement, event.detail, true)
  },
  true
)

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'cancelRun' && message.generation >= latestGeneration) {
    getC(undefined, message.generation)
  }
})

chrome.runtime
  .sendMessage({
    action: 'evalGetCssUsed',
    info: 'page loaded',
  })
  .catch(() => {
    // console.log('error',error);
  })

export default getC
