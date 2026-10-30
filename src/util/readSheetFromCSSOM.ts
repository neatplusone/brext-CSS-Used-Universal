function findSheet(
  sheets: ArrayLike<CSSStyleSheet>,
  url: string,
  seen: Set<CSSStyleSheet>
): CSSStyleSheet | null {
  for (const sheet of Array.from(sheets)) {
    if (seen.has(sheet)) {
      continue
    }
    seen.add(sheet)
    if (sheet.href === url) {
      return sheet
    }
    let rules: CSSRule[] = []
    try {
      rules = Array.from(sheet.cssRules)
    } catch (e) {
      // cross-origin sheet, its imports can't be reached either
    }
    const imported = rules
      .map((rule) => (rule as CSSImportRule).styleSheet)
      .filter((importedSheet) => !!importedSheet)
    const found = findSheet(imported, url, seen)
    if (found) {
      return found
    }
  }
  return null
}

// the fallback when the stylesheet file can't be fetched again.
// Includes sheets reached by @import, as serializing the parent only keeps the @import line.
export default function readSheetFromCSSOM(
  doc: Document,
  url: string
): string | null {
  const sheet = findSheet(doc.styleSheets, url, new Set())
  if (sheet === null) {
    return null
  }
  try {
    return Array.from(sheet.cssRules)
      .map((rule) => rule.cssText)
      .join('\n')
  } catch (e) {
    return null
  }
}
