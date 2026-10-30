import convUrlToAbs from './convUrlToAbs'
import { getFileContent } from './getFileContent'
import readSheetFromCSSOM from './readSheetFromCSSOM'
import { inform } from './runContext'
import type { RunContext } from './runContext'

function getSavedSettings() {
  return new Promise((resolve) => {
    if (chrome && chrome.storage) {
      chrome.storage.sync.get(
        {
          convUrlToAbsolute: true,
        },
        function (items) {
          resolve(items.convUrlToAbsolute)
        }
      )
    } else {
      resolve(true)
    }
  })
}

interface customCssObj {
  url: string
  cssraw: string
  failed?: boolean
}

function makeRequest(url: string, ctx: RunContext): Promise<customCssObj> {
  const result: customCssObj = { url, cssraw: '' }
  inform(ctx, 'Getting : ' + url)
  return new Promise(function (resolve) {
    getFileContent(url)
      .catch((error) => {
        console.log('CSS-Used: Fail to get: ' + url, error)
        const fromCSSOM = readSheetFromCSSOM(ctx.doc, url)
        if (fromCSSOM === null) {
          throw error
        }
        return fromCSSOM
      })
      .then((data) => {
        result.cssraw = data
        // console.log("Success:", url, data);
        getSavedSettings().then((willConvUrlToAbs) => {
          if (willConvUrlToAbs) {
            result.cssraw = result.cssraw.replace(
              /url\((['"]?)(.*?)\1\)/g,
              function (_a: string, p1: string, p2: string) {
                return `url(${p1}${convUrlToAbs(url, p2)}${p1})`
              }
            )
          }
          resolve(result)
          inform(ctx, 'Parsing : ' + url)
        })
      })
      .catch((error) => {
        console.log('CSS-Used: Fail to read: ' + url, error)
        result.cssraw = ''
        result.failed = true
        ctx.unreadable.add(url)
        resolve(result)
      })
  })
}

function convLinkToText(
  links: string[],
  ctx: RunContext
): Promise<customCssObj[]> {
  var promises = []
  return new Promise(function (resolve, reject) {
    if (links.length === 0) {
      resolve([])
    } else {
      for (var i = 0; i < links.length; i++) {
        promises.push(makeRequest(links[i], ctx))
      }
      Promise.all(promises)
        .then((result: customCssObj[]) => {
          resolve(result)
        })
        .catch(function (err) {
          reject(err)
        })
    }
  })
}

export default convLinkToText
