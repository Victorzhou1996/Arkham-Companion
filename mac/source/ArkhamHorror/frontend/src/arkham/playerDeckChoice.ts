import type { Message } from '@/arkham/types/Message'
// Shared by the deck image and the phone's quick-draw control.
export function playerDeckChoice(choices: readonly Message[], playerId: string, ownerId: string) {
  if (playerId !== ownerId) return -1
  return choices.findIndex(c => c.tag === 'ComponentLabel' && c.component.tag === 'InvestigatorDeckComponent')
}
