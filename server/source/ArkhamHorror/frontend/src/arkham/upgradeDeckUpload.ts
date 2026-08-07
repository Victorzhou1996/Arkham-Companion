import type { ArkhamDbDecklist } from '@/arkham/types/Deck'

export interface UpgradeDeckUploadActions {
  setModel: (deck: ArkhamDbDecklist) => void
  setDeckList: (deck: ArkhamDbDecklist) => void
  setDeckUrl: (url: string | null) => void
  setDeck: (url: string | null) => void
  setDeckInvestigator: (investigatorCode: string) => void
  upgrade: () => void | Promise<void>
}

export type UpgradeDeckUploadResult =
  | { ok: true }
  | { ok: false; reason: 'invalidJson' | 'notADecklist' }

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function numericSlots(value: unknown): value is Record<string, number> {
  const slots = record(value)
  return slots !== null && Object.values(slots).every((count) => typeof count === 'number')
}

/* Accept both public API decklists and locally saved `{ list: ... }` exports. This also
 * rejects error responses that fetch() can otherwise mistake for a usable deck. */
export function isUsableDecklist(data: unknown): boolean {
  const outer = record(data)
  if (!outer) return false
  const source = record(outer.list) ?? outer

  if (typeof source.investigator_code !== 'string' || source.investigator_code.length === 0) return false
  if (!numericSlots(source.slots)) return false

  const investigatorName = outer.investigator_name ?? outer.investigatorName
  return investigatorName == null || typeof investigatorName === 'string'
}

function normalizeUploadedDecklist(data: unknown): ArkhamDbDecklist | null {
  if (!isUsableDecklist(data)) return null

  const outer = record(data)!
  const source = record(outer.list) ?? outer
  const sideSlots = source.sideSlots ?? source.side_slots
  if (sideSlots !== undefined && !numericSlots(sideSlots)) return null

  const investigatorCode = source.investigator_code as string
  const normalized: ArkhamDbDecklist = {
    id: outer.id == null ? '' : String(outer.id),
    url: typeof outer.url === 'string' ? outer.url : null,
    name: typeof outer.name === 'string' ? outer.name : '',
    investigator_code: investigatorCode,
    investigator_name: typeof outer.investigator_name === 'string'
      ? outer.investigator_name
      : (typeof outer.investigatorName === 'string' ? outer.investigatorName : investigatorCode),
    slots: source.slots as Record<string, number>,
  }

  if (sideSlots !== undefined) normalized.sideSlots = sideSlots as Record<string, number>
  if (typeof source.taboo_id === 'number' || source.taboo_id === null) normalized.taboo_id = source.taboo_id
  if (typeof source.meta === 'string' || record(source.meta)) {
    normalized.meta = source.meta as ArkhamDbDecklist['meta']
  }

  return normalized
}

/* Parallel investigators store the selected front in meta. */
function uploadedInvestigatorCode(deck: ArkhamDbDecklist): string {
  const meta = (() => {
    if (deck.meta == null) return null
    if (typeof deck.meta !== 'string') return deck.meta
    try {
      return JSON.parse(deck.meta || '{}') as Record<string, unknown>
    } catch {
      return null
    }
  })()

  const front = meta?.alternate_front
  return typeof front === 'string' && front.length > 0 ? front : deck.investigator_code
}

export function loadUpgradeDeckFromJsonText(
  jsonText: string,
  actions: UpgradeDeckUploadActions,
): UpgradeDeckUploadResult {
  let data: unknown
  try {
    data = JSON.parse(jsonText) as unknown
  } catch {
    return { ok: false, reason: 'invalidJson' }
  }

  const deck = normalizeUploadedDecklist(data)
  if (!deck) return { ok: false, reason: 'notADecklist' }

  actions.setModel(deck)
  actions.setDeckList(deck)
  actions.setDeckUrl(deck.url)
  actions.setDeck(deck.url)
  actions.setDeckInvestigator(uploadedInvestigatorCode(deck))
  actions.upgrade()

  return { ok: true }
}
