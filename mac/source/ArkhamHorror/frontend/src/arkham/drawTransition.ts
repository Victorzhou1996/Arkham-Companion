export interface DrawSnapshot {
  gameId: string
  investigatorId: string
  step: number
  inSetup: boolean
  deck: string[]
  hand: string[]
  discard?: string[]
}

export interface DrawOrigin {
  left: number
  top: number
  width: number
  height: number
  delay: number
}

export function drawnCardIds(before: DrawSnapshot | undefined, after: DrawSnapshot): string[] {
  if (!before || before.gameId !== after.gameId || before.investigatorId !== after.investigatorId ||
      before.inSetup || after.inSetup || after.step < before.step) return []
  return after.hand.filter(id => !before.hand.includes(id) && before.deck.includes(id) && !after.deck.includes(id))
}

// Deck removal and hand insertion can arrive in different server updates.
// Recent departures are consumed once, or cleared on undo/setup/view changes.
export function createDrawTracker() {
  let before: DrawSnapshot | undefined
  const departures = new Map<string, number>()
  return {
    reset() { before = undefined; departures.clear() },
    update(after: DrawSnapshot, now = Date.now()): string[] {
      const previous = before
      before = after
      if (!previous || previous.gameId !== after.gameId || previous.investigatorId !== after.investigatorId ||
          previous.inSetup || after.inSetup || after.step < previous.step) {
        departures.clear(); return []
      }
      for (const id of previous.deck) if (!after.deck.includes(id)) departures.set(id, now)
      for (const [id, time] of departures) {
        if (now - time > 10000 || after.deck.includes(id) || after.discard?.includes(id)) departures.delete(id)
      }
      const result = after.hand.filter(id => !previous.hand.includes(id) && departures.has(id))
      for (const id of after.hand) departures.delete(id)
      return result
    },
  }
}
