// View preferences only: never part of a game message or saved scenario.
export const panelDefaults = { left: 18, investigator: 18, right: 14, log: 14, upper: 62, threat: 32, hand: 52, piles: 50, pileRows: 50 }
export type PanelKey = keyof typeof panelDefaults
export type PanelLayout = typeof panelDefaults
export const temporaryPileDefaults = { piles: 50, pileRows: 50 }
export function persistentPanels(layout: PanelLayout) {
  const { piles: _piles, pileRows: _pileRows, ...persistent } = layout
  return persistent
}
export const panelLimits: Record<PanelKey, [number, number]> = {
  left: [12, 32], investigator: [12, 32], right: [10, 25], log: [0, 30], upper: [42, 76],
  threat: [12, 65], hand: [30, 70], piles: [30, 70], pileRows: [30, 70],
}
export function normalizePanels(input: Partial<PanelLayout> | null | undefined): PanelLayout {
  const result = { ...panelDefaults }
  for (const key of Object.keys(result) as PanelKey[]) {
    const n = input?.[key]
    const [min, max] = panelLimits[key]
    result[key] = typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : result[key]
  }
  return result
}
export function movePanel(layout: PanelLayout, key: PanelKey, delta: number): PanelLayout {
  return normalizePanels({ ...layout, [key]: layout[key] + (Number.isFinite(delta) ? delta : 0) })
}
// Hysteresis prevents flickering near the threshold; keep a reachable handle.
export const collapsedLogWidth = 18
export function logCollapsed(width: number, previous: boolean): boolean {
  if (!Number.isFinite(width)) return previous
  return previous ? width < 190 : width < 150
}
