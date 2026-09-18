type Translate = (key: string, params?: Record<string, unknown>) => string

const normalized = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[.。]+$/, '')

// Older backend records humanize keys without preserving punctuation or accents.
const recordKey = (value: string) => '@record:' + normalized(value)
  .normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '')

export function buildKnownTranslations(
  source: unknown,
  target: unknown,
  result = new Map<string, string>(),
) {
  if (typeof source === 'string' && typeof target === 'string') {
    const key = normalized(source)
    if (key && source !== target && !source.includes('<')) {
      result.set(key, target)
      const alias = recordKey(source)
      const existing = result.get(alias)
      // Ambiguous normalized phrases must not acquire an unrelated translation.
      result.set(alias, existing === undefined || existing === target ? target : '')
    }
    return result
  }

  if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return result
  for (const key of Object.keys(source as Record<string, unknown>)) {
    buildKnownTranslations(
      (source as Record<string, unknown>)[key],
      (target as Record<string, unknown>)[key],
      result,
    )
  }
  return result
}

export function translateGameLogText(
  text: string,
  t: Translate,
  knownTranslations: Map<string, string>,
): string {
  if (!text.trim()) return text

  const fixed: Record<string, string> = {
    ' played ': ` ${t('gameLog.played')} `,
    ' draws ': ` ${t('gameLog.draws')} `,
    ' chaos token': ` ${t('gameLog.chaosToken')}`,
    ' chaos tokens': ` ${t('gameLog.chaosTokens')}`,
  }
  if (fixed[text]) return fixed[text]

  const directive = text.match(/^(Remember|Forgot|Record) "(.+)"(?: \((\d+)\))?$/)
  if (directive) {
    const [, action, rawValue, amount] = directive
    const value = knownTranslations.get(normalized(rawValue))
      ?? (knownTranslations.get(recordKey(rawValue)) || rawValue)
    const key = action === 'Remember' ? 'remember' : action === 'Forgot' ? 'forgot' : 'record'
    const translated = t(`gameLog.${key}`, { value })
    return amount ? `${translated} (${amount})` : translated
  }

  const leading = text.match(/^\s*/)?.[0] ?? ''
  const trailing = text.match(/\s*$/)?.[0] ?? ''
  const core = text.slice(leading.length, text.length - trailing.length)
  const known = knownTranslations.get(normalized(core))
  if (known !== undefined) return `${leading}${known}${trailing}`
  const translated = core
    .replace(/\bmust\s+discard\s+down\s+to\s+(\d+)\s+cards?\b/gi,
      (_match, count) => t('gameLog.discardDownTo', { count: Number(count) }))
    .replace(/\bdiscovered\s+(\d+)\s+clues?\b/gi,
      (_match, count) => t('gameLog.discoveredClues', { count: Number(count) }))
  return `${leading}${translated}${trailing}`
}
