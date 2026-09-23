import type { Game } from './types/Game'
import type { Question } from './types/Question'
import { automaticTriggerSkip } from './triggerModeChoices'

export type TaskKind = 'response' | 'action' | 'location' | 'card' | 'payment' | 'read' | 'choice'
export function questionTaskKind(question: Question): TaskKind {
  let q = question
  while (q.question) q = q.question
  if (q.tag === 'Read' || q.tag === 'ChooseOneWizard') return 'read'
  if (q.tag === 'ChoosePaymentAmounts' || q.tag === 'ChooseAmounts' || q.tag === 'ChooseExchangeAmounts') return 'payment'
  if (q.tag === 'ChooseOne' && (q.isWindowResponse || (q.isPlayerWindow && !q.choices.some(c => c.tag === 'EndTurnButton')))) return 'response'
  if (q.tag === 'ChooseOne' && q.isPlayerWindow) return 'action'
  const choices = (q.choices ?? []).filter(c => c.tag !== 'Done' && c.tag !== 'SkipTriggersButton' && c.tag !== 'Info' && c.tag !== 'InvalidLabel')
  if (choices.length && choices.every(c => c.tag === 'TargetLabel' && c.target.tag === 'LocationTarget')) return 'location'
  if (choices.length && choices.every(c => c.tag === 'CardLabel' || (c.tag === 'TargetLabel' && c.target.tag === 'CardIdTarget'))) return 'card'
  return 'choice'
}

export function pendingGameTasks(game: Game) {
  return Object.entries(game.question).filter(([,q]) => {
    let inner = q
    while (inner.question) inner = inner.question
    return automaticTriggerSkip(game,q,inner.choices ?? []) < 0
  }).map(([playerId, question]) => ({
    playerId,
    // A seat can own multiple investigators; do not invent a single owner.
    investigators: game.playerOrder.map(id => game.investigators[id]).filter(i => i && !i.eliminated && i.playerId === playerId),
    kind: questionTaskKind(question),
  }))
}
