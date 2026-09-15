/** Display-only helpers. No game state or backend messages are changed here. */
// Desktop/tablet windows keep the tabletop even when taller than they are wide.
// Keep this breakpoint in sync with styles/tabletop.css (covered by a test).
export const TABLETOP_MEDIA_QUERY = '(min-width: 801px)'

export function scenarioFitScale(availableWidth: number, availableHeight: number, contentWidth: number, contentHeight: number) {
  const available = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0
  const content = (n: number) => Number.isFinite(n) ? Math.max(1, n) : 1
  return Math.min(1, available(availableWidth) / content(contentWidth), available(availableHeight - 2) / content(contentHeight))
}

export function visibleActionCount(value: number, threshold = 6) {
  const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  return { count, icons: count > threshold ? 1 : count, collapsed: count > threshold }
}

export function handLayout(count: number, availableWidth: number, cardWidth: number, minTouchStrip = 24) {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  const width = Number.isFinite(cardWidth) ? Math.max(1, cardWidth) : 100
  const available = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0
  // Preserve a usable strip of every card. Very large hands scroll instead of
  // squeezing cards to invisible slivers or discarding any of them.
  const minimumStep = Math.min(width, minTouchStrip)
  const step = n < 2 ? width + 6 : Math.max(minimumStep, Math.min(width + 6, (available - width) / (n - 1)))
  return { step, width: n === 0 ? 0 : width + (n - 1) * step, overlapping: step < width }
}
