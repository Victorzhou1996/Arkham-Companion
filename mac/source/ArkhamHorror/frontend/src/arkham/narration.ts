import { reactive, readonly, ref, watch } from 'vue'

export type NarrationCategory =
  | 'story'
  | 'interlude'
  | 'resolution'
  | 'codex'
  | 'campaignLog'
  | 'actAgenda'
  | 'locationEnemy'
  | 'encounter'
  | 'playerCard'
  | 'cardName'
  | 'cardSubname'
  | 'cardTraits'
  | 'cardText'
  | 'cardFlavor'

export type NarrationSegment = {
  category: NarrationCategory
  text: string
}

export type NarrationItem = {
  id: string
  category: NarrationCategory
  segments: NarrationSegment[]
}

type NarrationPreferences = {
  autoRead: boolean
  rate: number
  volume: number
  voiceURI: string
  enabled: Record<NarrationCategory, boolean>
}

const STORAGE_KEY = 'arkham:narration:v1'

const defaultEnabled: Record<NarrationCategory, boolean> = {
  story: true,
  interlude: true,
  resolution: true,
  codex: true,
  campaignLog: true,
  actAgenda: true,
  locationEnemy: true,
  encounter: true,
  playerCard: true,
  cardName: true,
  cardSubname: true,
  cardTraits: false,
  cardText: true,
  cardFlavor: false,
}

const defaults: NarrationPreferences = {
  autoRead: false,
  rate: 1,
  volume: 1,
  voiceURI: '',
  enabled: defaultEnabled,
}

const loadPreferences = (): NarrationPreferences => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return {
      autoRead: typeof saved.autoRead === 'boolean' ? saved.autoRead : defaults.autoRead,
      rate: typeof saved.rate === 'number' ? saved.rate : defaults.rate,
      volume: typeof saved.volume === 'number' ? saved.volume : defaults.volume,
      voiceURI: typeof saved.voiceURI === 'string' ? saved.voiceURI : defaults.voiceURI,
      enabled: { ...defaultEnabled, ...(saved.enabled ?? {}) },
    }
  } catch {
    return { ...defaults, enabled: { ...defaultEnabled } }
  }
}

const preferences = reactive<NarrationPreferences>(loadPreferences())
const current = ref<NarrationItem | null>(null)
const speaking = ref(false)
const paused = ref(false)
const voices = ref<SpeechSynthesisVoice[]>([])
let queue: string[] = []
let generation = 0
let activeUtterance: SpeechSynthesisUtterance | null = null
let restartTimer: number | null = null

const speech = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null

const plainText = (value: string) => {
  const tokenNames: Record<string, string> = {
    action: '行动',
    fast: '快速',
    free: '快速',
    reaction: '反应',
    willpower: '意志',
    intellect: '智力',
    combat: '战力',
    agility: '敏捷',
    wild: '狂野',
    guardian: '守护者',
    seeker: '探求者',
    rogue: '流浪者',
    mystic: '潜修者',
    survivor: '生存者',
    elder_sign: '远古印记',
    auto_fail: '触手',
    skull: '骷髅',
    cultist: '邪教徒',
    tablet: '石板',
    elder_thing: '古神之物',
    bless: '祝福',
    curse: '诅咒',
    frost: '冰霜',
    per_investigator: '每名调查员',
    codex: '圣典',
  }
  const prepared = value
    .replace(/\[\[([^\]]+)]]/g, '$1')
    .replace(/\[([a-z_]+)]/gi, (_, token: string) => tokenNames[token.toLowerCase()] ?? '')
    .replace(/<br\s*\/?>/gi, '。')
    .replace(/<\/(?:p|div|li|blockquote|h[1-6])>/gi, '。')
  const element = document.createElement('div')
  element.innerHTML = prepared
  return (element.textContent ?? '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[*_#`~|<>{}\[\]]+/g, '')
    .replace(/[•●◆■▶►]+/g, '。')
    .replace(/\s+/g, ' ')
    .replace(/([。！？；，、：])\1+/g, '$1')
    .replace(/\s*([。！？；，、：])\s*/g, '$1')
    .trim()
}

const chunks = (text: string, limit = 220): string[] => {
  const sentences = plainText(text).split(/(?<=[。！？.!?；;])\s*/)
  const result: string[] = []
  let buffer = ''
  for (const sentence of sentences) {
    if (!sentence) continue
    if (buffer && buffer.length + sentence.length > limit) {
      result.push(buffer)
      buffer = ''
    }
    if (sentence.length <= limit) {
      buffer += sentence
      continue
    }
    if (buffer) result.push(buffer)
    for (let offset = 0; offset < sentence.length; offset += limit) {
      result.push(sentence.slice(offset, offset + limit))
    }
  }
  if (buffer) result.push(buffer)
  return result
}

const itemText = (item: NarrationItem) => {
  if (!preferences.enabled[item.category]) return ''
  return item.segments
    .filter((segment) => preferences.enabled[segment.category])
    .map((segment) => segment.text)
    .filter(Boolean)
    .join('。')
}

const selectedVoice = () => {
  if (!preferences.voiceURI) return null
  return voices.value.find((voice) => voice.voiceURI === preferences.voiceURI) ?? null
}

const finish = (token = generation) => {
  if (token !== generation) return
  if (restartTimer !== null) {
    window.clearTimeout(restartTimer)
    restartTimer = null
  }
  queue = []
  activeUtterance = null
  speaking.value = false
  paused.value = false
}

const speakNext = (token: number) => {
  if (token !== generation) return
  const engine = speech()
  const next = queue.shift()
  if (!engine || !next) {
    finish(token)
    return
  }

  const utterance = new SpeechSynthesisUtterance(next)
  const language = (
    localStorage.getItem('language') ||
    document.documentElement.lang ||
    'en'
  ).toLowerCase()
  utterance.lang = language.startsWith('zh') ? 'zh-CN' : language
  utterance.rate = preferences.rate
  utterance.volume = preferences.volume
  utterance.voice = selectedVoice()
  utterance.onend = () => {
    activeUtterance = null
    speakNext(token)
  }
  utterance.onerror = () => {
    activeUtterance = null
    finish(token)
  }
  activeUtterance = utterance
  speaking.value = true
  engine.speak(utterance)
}

export const readNarration = (item: NarrationItem | null = current.value) => {
  const engine = speech()
  if (!engine || !item) return
  const text = itemText(item)
  if (!text) return

  const token = ++generation
  queue = chunks(text)
  paused.value = false
  const needsRestart = engine.speaking || engine.pending || engine.paused
  if (needsRestart) {
    engine.cancel()
    activeUtterance = null
    restartTimer = window.setTimeout(() => {
      restartTimer = null
      speakNext(token)
    }, 50)
  } else {
    speakNext(token)
  }
}

export const setCurrentNarration = (item: NarrationItem) => {
  const changed = current.value?.id !== item.id
  current.value = item
  if (changed && preferences.autoRead) readNarration(item)
}

export const pauseOrResumeNarration = () => {
  const engine = speech()
  if (!engine || !speaking.value) return
  if (engine.paused) {
    engine.resume()
    paused.value = false
  } else {
    engine.pause()
    paused.value = true
  }
}

export const stopNarration = () => {
  generation += 1
  if (restartTimer !== null) {
    window.clearTimeout(restartTimer)
    restartTimer = null
  }
  speech()?.cancel()
  activeUtterance = null
  finish()
}

export const clearCurrentNarration = () => {
  current.value = null
}

const refreshVoices = () => {
  voices.value = speech()?.getVoices() ?? []
}

if (speech()) {
  refreshVoices()
  speech()!.addEventListener?.('voiceschanged', refreshVoices)
}

watch(preferences, (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)), {
  deep: true,
})

export const useNarration = () => ({
  supported: !!speech(),
  preferences,
  current: readonly(current),
  speaking: readonly(speaking),
  paused: readonly(paused),
  voices: readonly(voices),
  read: readNarration,
  pauseOrResume: pauseOrResumeNarration,
  stop: stopNarration,
})
