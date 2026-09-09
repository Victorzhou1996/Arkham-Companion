const channelName = "arkham-deck-updates-v1";
const storageKey = "arkham-deck-update-v1";

export type DeckSavedNotification = {
  type: "deck-saved";
  deckId: string;
  eventId: string;
  savedAt: number;
};

export function notifyDeckSaved(deckId: string) {
  const notification: DeckSavedNotification = {
    type: "deck-saved",
    deckId,
    eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    savedAt: Date.now(),
  };

  try {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage(notification);
    channel.close();
  } catch {
    // localStorage remains available as a compatibility path.
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(notification));
  } catch {
    // Saving the deck succeeded even if cross-tab notification is unavailable.
  }
}
