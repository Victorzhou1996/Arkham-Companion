type Translate = (key: string, params?: Record<string, unknown>) => string

const normalized = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[.。]+$/, '')

export function buildKnownTranslations(
  source: unknown,
  target: unknown,
  result = new Map<string, string>(),
) {
  if (typeof source === 'string' && typeof target === 'string') {
    const key = normalized(source)
    if (key && source !== target && !source.includes('<')) result.set(key, target)
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
    const value = knownTranslations.get(normalized(rawValue)) ?? rawValue
    const key = action === 'Remember' ? 'remember' : action === 'Forgot' ? 'forgot' : 'record'
    const translated = t(`gameLog.${key}`, { value })
    return amount ? `${translated} (${amount})` : translated
  }

  const leading = text.match(/^\s*/)?.[0] ?? ''
  const trailing = text.match(/\s*$/)?.[0] ?? ''
  const core = text.slice(leading.length, text.length - trailing.length)
  return `${leading}${knownTranslations.get(normalized(core)) ?? core}${trailing}`
}
