# CSS Used Universal

One codebase for Chrome and Firefox. A fork of [painty/CSS-Used-ChromeExt](https://github.com/painty/CSS-Used-ChromeExt) by Bobscript, which added the extraction engine and the Chrome extension this is built on.

![CSS Used](http://ww1.sinaimg.cn/large/4e71f332gw1et7h243kgqj203k03ka9v.jpg)

Get all css rules used by the selected DOM and its descendants.

## Install

- **Firefox:** [CSS Used on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/css-used-firefox/)
- **Chrome:** use the [original CSS Used](https://chrome.google.com/webstore/detail/css-used/cdopjfddjlonogibjahpnmjpoangjfff) by its original developer. This fork isn't published on the Chrome Web Store and its Chrome build isn't maintained as a release, but you can build it and load it unpacked.

## Build and load

Chrome 121+ and Firefox 140+ are supported. After `npm ci`:

| Command | Output |
|---|---|
| `npm run build` | `dist/`, which loads in both browsers, plus `dist-firefox/` and `dist-chrome/` |
| `npm run build:firefox`, `npm run build:chrome` | `dist/` and that browser's folder |
| `npm run package` | The above for both browsers, plus zips in `web-ext-artifacts/` |
| `npm run package:firefox`, `npm run package:chrome` | One browser's folder and zip |

The per-browser folders only differ in their manifest: keys read only by the other browser are removed, which avoids Chrome's `'background.scripts' requires manifest version of 2 or lower` warning.

- Firefox: `about:debugging` > This Firefox > Load Temporary Add-on > `dist-firefox/manifest.json`
- Chrome: `chrome://extensions` > Load unpacked > `dist-chrome/`

## Firefox limitations

- Selecting an element inside a cross-origin iframe isn't possible, because Firefox doesn't expose it to extensions. Open the iframe's URL in its own tab.
- Firefox has no devtools API for the resources a page loaded, so stylesheets are fetched again. If that fails, rules are read from the page where the browser allows it, and the panel names any stylesheet it couldn't read.

## Overview

Get all css rules used by the selected DOM and its descendants. Used to extrac only the used CSS. So the unused css will be left out.

If the selected DOM is the body, the result will be all the used css by the whole page curently.

## Usage

![CSS-Used](https://user-images.githubusercontent.com/5387771/47267284-41b36a80-d574-11e8-9b83-c7896d428827.jpg)

F12 open the Developer Tools, select the dom and activate the "CSS Used" sidebar panel in Elements (Chrome) or Inspector (Firefox). The used CSS rules of the Selected dom and its descendants will be listed.

You can click "Preview" to see the selected part with clean style rules.

## FAQ

1. No result

   1. Check whether it's a store page, such as `https://chrome.google.com/webstore/....` or `https://addons.mozilla.org/....`, which won't allow content script injection.
   1. If it's a normal webpage, check site access permission https://github.com/painty/CSS-Used-ChromeExt/issues/13#issuecomment-687244215
   1. If it's a local file, chrome won't allow local file access by default. You can turn on the "Allow access to file URLs" in the extension management page. In Firefox, allow access to local files for the add-on in `about:addons`.

1. Preview not right

    As for the CSS rule like `.wrap p{...}`, if only `<p>` is selected, the result `.wrap p{...}` may not apply directly to `<p>`.
    Either changing this rule's selector to `p{...}` or giving the `<p>` a `.wrap` parent in the final HTML.

1. Not all the CSS is got

    1. The result is generated based on the CURRENT HTML DOM. If a div doesn't exist in the document unless a specific user interaction, the result may miss out the style rules for the newly born div.
    1. CSS custom properties (variables) are partially supported. Not working for declarations defined by $0's ancestor. Thinking it as a inheritable CSS property, as this tool won't handle inherit style.

## Changelog

Go to the [Changelog page](CHANGELOG.md)
