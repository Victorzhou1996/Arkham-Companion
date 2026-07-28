export type HandCardTriggerMetadata = {
  type_code: string
  real_text?: string
}

const FAST_PLAY_LINE = /(?:^|\n)\s*Fast\.(?:\s|$)/i

export function supportsHandPlayTriggerMode(
  card: HandCardTriggerMetadata | null | undefined,
): boolean {
  if (!card || !['asset', 'event'].includes(card.type_code)) return false
  return FAST_PLAY_LINE.test(card.real_text ?? '')
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
