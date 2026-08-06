import type { Customization } from '@/arkham/types/Customization'
import type { AbilityLabel, AbilityMessage, Message } from '@/arkham/types/Message'

export type HandCardTriggerMetadata = {
  type_code: string
  real_text?: string
}

const FAST_PLAY_LINE = /(?:^|\n)\s*Fast\.(?:\s|$)/i
const CUSTOMIZED_FAST_PLAY: Record<string, { index: number; cost: number }> = {
  '09023': { index: 3, cost: 3 }, // Custom Modifications: Leather Grip
  '09060': { index: 5, cost: 2 }, // Friends in Low Places: Prompt
  '09100': { index: 2, cost: 2 }, // Makeshift Trap: Simple
}

export function normalizeCardCode(cardCode: string): string {
  return cardCode.replace(/^c/, '').toLowerCase()
}

export function supportsCustomizedFastPlay(
  cardCode: string,
  customizations: Customization[] | null | undefined,
): boolean {
  const requirement = CUSTOMIZED_FAST_PLAY[normalizeCardCode(cardCode)]
  if (!requirement) return false

  const selected = customizations?.find(([index]) => index === requirement.index)
  return (selected?.[1][0] ?? 0) >= requirement.cost
}

export function supportsHandPlayTriggerMode(
  card: HandCardTriggerMetadata | null | undefined,
  cardCode = '',
  customizations: Customization[] | null | undefined = [],
  currentlyPlayableAsFast = false,
): boolean {
  if (!card || !['asset', 'event'].includes(card.type_code)) return false
  return currentlyPlayableAsFast
    || FAST_PLAY_LINE.test(card.real_text ?? '')
    || supportsCustomizedFastPlay(cardCode, customizations)
}

export function triggerModeAbilitiesForCard(
  choices: readonly Message[],
  cardCode: string,
  investigatorId: string,
  matchesInstance: (choice: AbilityLabel) => boolean = () => true,
): AbilityMessage[] {
  const normalized = normalizeCardCode(cardCode)

  return choices.reduce<AbilityMessage[]>((result, choice, index) => {
    if (
      choice.tag === 'AbilityLabel'
      && choice.investigatorId === investigatorId
      && normalizeCardCode(choice.ability.cardCode) === normalized
      && matchesInstance(choice)
    ) {
      result.push({ contents: choice, displayAsAction: false, index })
    }

    return result
  }, [])
}

export function handTriggerModeIndexes(
  savedIndexes: number[],
  currentIndexes: number[],
  includePlayMode: boolean,
): number[] {
  const allowed = new Set(currentIndexes)
  if (includePlayMode) allowed.add(-1)

  return [...new Set([...savedIndexes, ...currentIndexes, ...(includePlayMode ? [-1] : [])])]
    .filter((index) => Number.isInteger(index) && allowed.has(index))
    .sort((left, right) => left - right)
}
