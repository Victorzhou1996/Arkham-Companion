export const mobileZones = ['hand', 'threats', 'equipment', 'investigator'] as const
export type ActionZones = Record<typeof mobileZones[number], boolean>
export type MobileActionHints = { top: boolean; bottom: boolean; players: Record<string, ActionZones> }
export const emptyActionHints = (): MobileActionHints => ({ top: false, bottom: false, players: {} })
export const emptyActionZones = (): ActionZones => ({ hand: false, threats: false, equipment: false, investigator: false })

// Hidden tabs deliberately participate: they are precisely what needs a hint.
// Read availability from live controls, never from card text or guessed rules.
export const GAME_ACTION_SELECTOR = [
  '[data-game-actionable="true"]', '[data-mobile-ability-available="true"]',
  '[class*="--can-interact"]', '[class*="--can-progress"]', '.can-interact',
  '.deck--can-draw', '.token--can-draw', '.clue--can-take', '.clue--can-spend',
  '.resource--can-take', '.resource--can-spend', '.blocked--selectable',
].join(',')
const zoneSelectors = ['.hand-area', '.tabletop-threats', '.tabletop-equipment', '.investigator-and-deck']
export function inspectMobileScenarioActions(actions: Element[]): Record<string, boolean> {
  const hints: Record<string, boolean> = {}
  for (const action of actions) {
    const group = action.closest('[data-mobile-scenario-group]')?.getAttribute('data-mobile-scenario-group')
    if (group) hints[group] = true
  }
  return hints
}
export function enabledGameActions(root: Element): Element[] {
  return [...root.querySelectorAll(GAME_ACTION_SELECTOR)].filter(action =>
    !action.matches(':disabled, [aria-disabled="true"], .asset--pending')
    && !action.closest('[inert], .asset--pending'))
}

// Tiny controls can be clipped/overlapped at card scale. Their enclosing card
// must advertise the same availability even before its preview is opened.
export function markMobileActionCards(root: Element, actions = enabledGameActions(root)) {
  const cards = new Set(actions.map(action => action.closest('[data-mobile-card]')).filter(Boolean))
  for (const card of root.querySelectorAll('[data-mobile-card]')) {
    if (cards.has(card)) {
      if (card.getAttribute('data-mobile-has-action') !== 'true') card.setAttribute('data-mobile-has-action', 'true')
    } else if (card.hasAttribute('data-mobile-has-action')) card.removeAttribute('data-mobile-has-action')
  }
}
export function inspectMobileActions(root: Element, actions = enabledGameActions(root)): MobileActionHints {
  const hints = emptyActionHints()
  for (const action of actions) {
    const tab = action.closest('[data-player-tab]')
    if (tab) {
      const pid = tab.getAttribute('data-player-tab')
      if (!pid) continue
      hints.bottom = true
      const zones = hints.players[pid] ??= emptyActionZones()
      const zoneIndex = zoneSelectors.findIndex(selector => action.closest(selector))
      if (zoneIndex >= 0) zones[mobileZones[zoneIndex]] = true
    } else if (action.closest('.scenario-cards, .tabletop-tools')) {
      hints.top = true
    }
  }
  return hints
}
