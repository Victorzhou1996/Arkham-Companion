import type { NarrationCategory } from '@/arkham/narration'

type CardCategory = { type_code?: string; encounter_code?: string | null }

export const cardNarrationCategory = (
  card?: CardCategory | null,
  element?: Element | null,
): NarrationCategory => {
  if (card?.type_code === 'act' || card?.type_code === 'agenda') return 'actAgenda'
  if (card?.type_code === 'location' || card?.type_code === 'enemy') return 'locationEnemy'
  if (card?.encounter_code) return 'encounter'
  // Player weaknesses can also be treacheries; database identity takes priority.
  if (card) return 'playerCard'
  if (element?.closest('.act-container, .agenda-container, .card--agenda, .card--sideways')) {
    return 'actAgenda'
  }
  if (element?.closest('.card--locations, .enemy')) return 'locationEnemy'
  if (element?.closest('.treachery')) return 'encounter'
  return 'playerCard'
}
