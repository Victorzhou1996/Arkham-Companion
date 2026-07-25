import type { ArkhamDbDecklist } from '@/arkham/types/Deck'

export interface UpgradeDeckUploadActions {
  setModel: (deck: ArkhamDbDecklist) => void
  setDeckList: (deck: ArkhamDbDecklist) => void
  setDeckUrl: (url: string | null) => void
  setDeck: (url: string | null) => void
  setDeckInvestigator: (investigatorCode: string) => void
  upgrade: () => void | Promise<void>
}

function normalizeUploadableUpgradeDeck(data: unknown): ArkhamDbDecklist | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  const nestedList = typeof d.list === 'object' && d.list !== null && !Array.isArray(d.list)
    ? d.list as Record<string, unknown>
    : null
  const source = nestedList ?? d

  if (typeof d.id !== 'string' && typeof d.id !== 'number') return null
  if (typeof d.name !== 'string') return null
  if (typeof source.investigator_code !== 'string' || source.investigator_code.length === 0) return null

  const slots = source.slots
  if (typeof slots !== 'object' || slots === null || Array.isArray(slots)) return null
  if (!Object.values(slots as Record<string, unknown>).every((v) => typeof v === 'number')) return null

  const sideSlots = source.sideSlots ?? source.side_slots
  if (sideSlots !== undefined && (typeof sideSlots !== 'object' || sideSlots === null || Array.isArray(sideSlots))) return null

  const normalized: ArkhamDbDecklist = {
    id: String(d.id),
    url: typeof d.url === 'string' ? d.url : null,
    name: d.name,
    investigator_code: source.investigator_code,
    investigator_name: typeof d.investigator_name === 'string'
      ? d.investigator_name
      : (typeof d.investigatorName === 'string' ? d.investigatorName : source.investigator_code),
    slots: slots as Record<string, number>,
  }

  if (sideSlots !== undefined) normalized.sideSlots = sideSlots as Record<string, number>
  if (typeof source.taboo_id === 'number' || source.taboo_id === null) normalized.taboo_id = source.taboo_id
  if (typeof source.meta === 'string' || (typeof source.meta === 'object' && source.meta !== null)) {
    normalized.meta = source.meta as ArkhamDbDecklist['meta']
  }

  return normalized
}

export function loadUpgradeDeckFromJsonText(
  jsonText: string,
  actions: UpgradeDeckUploadActions,
): boolean {
  try {
    const data = normalizeUploadableUpgradeDeck(JSON.parse(jsonText) as unknown)
    if (!data) return false

    const deckUrl = data.url ?? null

    actions.setModel(data)
    actions.setDeckList(data)
    actions.setDeckUrl(deckUrl)
    actions.setDeck(deckUrl)
    actions.setDeckInvestigator(data.investigator_code)
    actions.upgrade()

    return true
  } catch {
    return false
  }
}
