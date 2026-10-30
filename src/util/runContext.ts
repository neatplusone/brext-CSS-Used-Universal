// state of one extraction run, passed through every async stage of it
export interface RunContext {
  generation: number
  doc: Document
  isCurrent: () => boolean
  unreadable: Set<string>
}

// progress for the panel. A run that was superseded stays silent.
export function inform(ctx: RunContext, info: string) {
  if (!ctx.isCurrent()) {
    return
  }
  chrome.runtime
    .sendMessage({
      action: 'inform',
      info,
      generation: ctx.generation,
    })
    .catch(() => {})
}
