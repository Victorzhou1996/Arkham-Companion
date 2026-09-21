import type { Game } from './types/Game'
import type { Message } from './types/Message'
import type { Question } from './types/Question'

type ModeGame = Pick<Game, 'investigators' | 'activeInvestigatorId'>
// Only optional abilities. Unknown/forced/action/payment choices are never discarded.
export function skippedOptionalAbility(game: ModeGame, choice: Message): boolean {
  if (choice.tag !== 'AbilityLabel') return false
  let type = choice.ability.type
  while (type.tag === 'Objective' || type.tag === 'DelayedAbility') type = type.abilityType
  if (!['FastAbility', 'ReactionAbility', 'ConstantReaction'].includes(type.tag)) return false
  const settings = game.investigators[choice.investigatorId]?.settings?.perCardSettings
  const code = choice.ability.cardCode
  const mode = settings?.[code]?.cardAbilityModes?.[String(choice.ability.index)]
  return mode === 'AbilityAutoSkip' || (mode === 'AbilityOwnerOnly' && game.activeInvestigatorId !== choice.investigatorId)
}

// Preserve original server indices: never filter/reindex answer arrays.
export function visibleTriggerChoices(game: ModeGame, choices: readonly Message[]): Message[] {
  return choices.map(c => skippedOptionalAbility(game, c) ? {tag: 'InvalidLabel', label: ''} as Message : c)
}

export function automaticTriggerSkip(game: ModeGame, question: Question | undefined, raw: readonly Message[]): number {
  while (question?.question) question = question.question
  if (question?.tag !== 'ChooseOne' || (!question.isPlayerWindow && !question.isWindowResponse)) return -1
  const skips = raw.map((c,i) => c.tag === 'SkipTriggersButton' ? i : -1).filter(i => i >= 0)
  if (skips.length !== 1) return -1
  const rest = raw.filter(c => c.tag !== 'SkipTriggersButton' && c.tag !== 'Info' && c.tag !== 'InvalidLabel')
  return rest.length > 0 && rest.every(c => skippedOptionalAbility(game,c)) ? skips[0] : -1
}

export function authorizedAutomaticSeat(solo: boolean, authenticatedSeat: string | null, target: string): boolean {
  return Boolean(authenticatedSeat) && (solo || authenticatedSeat === target)
}
