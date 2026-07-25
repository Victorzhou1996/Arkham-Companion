const channelName = 'arkham-deck-updates-v1'
const storageKey = 'arkham-deck-update-v1'

export interface DeckSavedNotification {
  type: 'deck-saved'
  deckId: string
  eventId: string
  savedAt: number
}

function parseNotification(value: unknown): DeckSavedNotification | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<DeckSavedNotification>
  if (
    candidate.type !== 'deck-saved' ||
    typeof candidate.deckId !== 'string' ||
    typeof candidate.eventId !== 'string' ||
    typeof candidate.savedAt !== 'number'
  ) {
    return null
  }
  return candidate as DeckSavedNotification
}

export function subscribeToDeckSaves(callback: (notification: DeckSavedNotification) => void) {
  const seen = new Set<string>()
  const deliver = (value: unknown) => {
    const notification = parseNotification(value)
    if (!notification || seen.has(notification.eventId)) return
    seen.add(notification.eventId)
    callback(notification)
    window.setTimeout(() => seen.delete(notification.eventId), 60_000)
  }

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(channelName)
    channel.addEventListener('message', (event) => deliver(event.data))
  } catch {
    channel = null
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return
    try {
      deliver(JSON.parse(event.newValue))
    } catch {
      // Ignore malformed third-party storage values.
    }
  }
  window.addEventListener('storage', onStorage)

  return () => {
    channel?.close()
    window.removeEventListener('storage', onStorage)
  }
}
