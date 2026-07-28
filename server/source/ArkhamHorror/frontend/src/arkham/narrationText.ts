import type {
  FlavorText,
  FlavorTextEntry,
  FlavorTextModifier,
  ListItemEntry,
} from '@/arkham/types/FlavorText'
import type { NarrationCategory, NarrationItem } from '@/arkham/narration'

type Translate = (key: string, params?: Record<string, unknown>) => string

const localizeBasicEntry = (text: string) => {
  const translator = (
    globalThis as typeof globalThis & {
      __translateBasicEntryZh?: (source: string) => string
    }
  ).__translateBasicEntryZh
  return translator ? translator(text) : text
}

const readableIdentifier = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')

const entryText = (entry: FlavorTextEntry, t: Translate): string => {
  switch (entry.tag) {
    case 'BasicEntry':
      return localizeBasicEntry(entry.text.startsWith('$') ? t(entry.text.slice(1)) : entry.text)
    case 'I18nEntry':
      return t(entry.key, entry.variables)
    case 'HeaderEntry':
      return t(entry.key)
    case 'InvalidEntry':
    case 'ValidEntry':
      return entry.text
    case 'ModifyEntry':
      return entryText(entry.entry, t)
    case 'CompositeEntry':
    case 'ColumnEntry':
      return entry.entries.map((child) => entryText(child, t)).join('。')
    case 'ListEntry':
      return entry.list.map((item) => listItemText(item, t)).join('。')
    case 'CardEntry':
      return t('gameBar.narration.references.card', { code: entry.cardCode })
    case 'TarotEntry':
      return t('gameBar.narration.references.tarot', {
        name: readableIdentifier(entry.tarot),
      })
    case 'ChaosTokenEntry':
      return t('gameBar.narration.references.chaosToken', {
        name: readableIdentifier(entry.chaosTokenFace),
      })
    case 'ChaosTokenMorphEntry':
      return t('gameBar.narration.references.chaosTokenMorph', {
        from: readableIdentifier(entry.morphFrom),
        to: readableIdentifier(entry.morphTo),
      })
    case 'EntrySplit':
      return ''
  }
}

const listItemText = (item: ListItemEntry, t: Translate): string =>
  [entryText(item.entry, t), ...item.nested.map((nested) => listItemText(nested, t))]
    .filter(Boolean)
    .join('。')

const allModifiers = (entry: FlavorTextEntry): FlavorTextModifier[] => {
  switch (entry.tag) {
    case 'ModifyEntry':
      return [...entry.modifiers, ...allModifiers(entry.entry)]
    case 'CompositeEntry':
    case 'ColumnEntry':
      return entry.entries.flatMap(allModifiers)
    case 'ListEntry':
      return entry.list.flatMap((item) => [
        ...allModifiers(item.entry),
        ...item.nested.flatMap((nested) => allModifiers(nested.entry)),
      ])
    default:
      return []
  }
}

const storyCategory = (flavorText: FlavorText): NarrationCategory => {
  const modifiers = flavorText.body.flatMap(allModifiers)
  if (modifiers.includes('ResolutionEntry')) return 'resolution'
  if (modifiers.includes('InterludeEntry')) return 'interlude'
  if (modifiers.includes('CodexEntry')) return 'codex'
  return 'story'
}

export const flavorTextNarration = (flavorText: FlavorText, t: Translate): NarrationItem => {
  const title = flavorText.title
    ? flavorText.title.startsWith('$')
      ? t(flavorText.title.slice(1))
      : flavorText.title
    : ''
  const body = flavorText.body.map((entry) => entryText(entry, t)).filter(Boolean)
  const category = storyCategory(flavorText)
  const text = [title, ...body].join('。')

  return {
    id: `story:${category}:${text}`,
    category,
    segments: [{ category, text }],
  }
}
