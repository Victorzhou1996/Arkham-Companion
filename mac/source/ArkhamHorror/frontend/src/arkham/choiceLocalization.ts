type Translate = (key: string, params?: Record<string, unknown>) => string

export function translateChoiceText(
  text: string,
  t: Translate,
  cardName: (name: string, type: string) => string,
): string {
  const discover = text.match(/^Discover Clue at (.+)$/)
  if (discover) return t('choiceText.discoverClueAt', { name: cardName(discover[1], 'location') })
  const damage = text.match(/^Damage (.+)$/)
  if (damage) return t('choiceText.damageTarget', { name: cardName(damage[1], 'enemy') })
  // These reprint names are still English in the bundled Chinese card database.
  if (text === 'Establish Motive') return t('choiceText.establishMotive')
  if (text === 'Lie in Wait') return t('choiceText.lieInWait')
  return text
}
