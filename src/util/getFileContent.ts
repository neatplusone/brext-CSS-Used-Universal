import debugMode from '../const/debugMode'

const getByFetch = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    fetch(url, {
      method: 'GET',
      mode: 'no-cors',
    })
      .then((resonse) => resonse.arrayBuffer())
      .then((data) => {
        const decoder = new TextDecoder()
        resolve(decoder.decode(data))
      })
      .catch((error) => reject(error))
  })
}

// answered by devtools.js, or by background.js where devtools has no getResources
const getByChromeAPI = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'getResourceContent',
        url,
      },
      (response) => {
        // console.log('response',response);
        if (
          !response ||
          response.ok === false ||
          typeof response.content !== 'string'
        ) {
          reject(
            new Error(
              (response && response.reason) ||
                (chrome.runtime.lastError &&
                  chrome.runtime.lastError.message) ||
                'no content'
            )
          )
        } else {
          resolve(response.content)
        }
      }
    )
  })
}

export function getFileContent(url: string) {
  if (debugMode) {
    return getByFetch(url)
  }
  return getByChromeAPI(url)
}
