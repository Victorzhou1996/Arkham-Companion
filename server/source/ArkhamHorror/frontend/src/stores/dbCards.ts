import { defineStore } from 'pinia'

export interface ArkhamDBCard {
  code: string
  name: string
  xp?: number
  subname?: string
  traits?: string
  text?: string
  back_name?: string
  back_traits?: string
  back_text?: string
  customization_text?: string
  flavor?: string
  back_flavor?: string
  faction_name: string
  faction2_name?: string
  faction3_name?: string
  faction_code?: string
  type_name: string
  pack_code?: string
  pack_name: string
  encounter_name?: string
  real_name: string
  real_traits: string
  real_text: string
  type_code: string
  // "weakness" | "basicweakness"; absent on non-weakness cards
  subtype_code?: string
  is_unique: boolean
  double_sided: boolean
  encounter_code?: string
  // Investigator cards only: required signature cards keyed by code, each
  // mapping to its alternate versions (also keyed by code).
  deck_requirements?: {
    size?: number
    card?: Record<string, Record<string, string> | null>
    random?: unknown[]
  }
}

export interface DbCardsState {
  dbCards: ArkhamDBCard[]
  dbCardsIndex: Map<string, ArkhamDBCard>
  dbCardNameIndex: Map<string, ArkhamDBCard>
  dbCardTypedNameIndex: Map<string, ArkhamDBCard>
  lang: string
  loadingLang: string | null
  loadedLang: string | null
}

let loadingPromise: Promise<void> | null = null
// Failed lazy loads must not turn a render -> loading flag -> render cycle
// into continuous requests. Keep retry bookkeeping outside reactive state.
const failedUntil = new Map<string, number>()

export const useDbCardStore = defineStore('dbCards', {
  state: (): DbCardsState =>
    ({
      dbCards: [],
      dbCardsIndex: new Map(),
      dbCardNameIndex: new Map(),
      dbCardTypedNameIndex: new Map(),
      lang: 'en',
      loadingLang: null,
      loadedLang: null,
    }) as DbCardsState,

  actions: {
    getDbCard(code: string): ArkhamDBCard | null {
      if (this.dbCards.length < 1) {
        void this.initDbCards().catch(() => {})
      }

      // ArkhamDB stores some split-card fronts with an "a" suffix, while the
      // game runtime refers to the same front using the unsuffixed code.
      return this.dbCardsIndex.get(code) ?? this.dbCardsIndex.get(`${code}a`) ?? null
    },

    getCardName(cardTitle: string, typeCode: string = ''): string {
      if (this.dbCards.length < 1) {
        const language = localStorage.getItem('language') || 'en'
        if (language !== 'en') void this.initDbCards().catch(() => {})
      }

      const i = typeCode
        ? this.dbCardTypedNameIndex.get(`${typeCode}\0${cardTitle}`)
        : this.dbCardNameIndex.get(cardTitle)

      return i ? i.name : cardTitle
    },

    async fetchDbCards(lang: string) {
      const data = await fetch(`${import.meta.env.BASE_URL}cards/cards_${lang}.json`).then(
        async (cardResponse) => {
          if (!cardResponse.ok) throw new Error(`Card names unavailable (${cardResponse.status})`)
          if (!(cardResponse.headers.get('content-type') ?? '').includes('json')) {
            throw new Error('Card names response is not JSON')
          }
          return await cardResponse.json()
        },
      )
      if (!Array.isArray(data)) throw new Error('Invalid card-name data')

      if (this.lang !== lang) return

      this.dbCards = data
      const index = new Map<string, ArkhamDBCard>()
      const nameIndex = new Map<string, ArkhamDBCard>()
      const typedNameIndex = new Map<string, ArkhamDBCard>()
      for (const card of data as ArkhamDBCard[]) {
        index.set(card.code, card)
        index.set(`${card.code}b`, card)
        if (!nameIndex.has(card.real_name)) nameIndex.set(card.real_name, card)
        const typedName = `${card.type_code}\0${card.real_name}`
        if (!typedNameIndex.has(typedName)) typedNameIndex.set(typedName, card)
      }
      this.dbCardsIndex = index
      this.dbCardNameIndex = nameIndex
      this.dbCardTypedNameIndex = typedNameIndex
      this.loadedLang = lang
    },

    async initDbCards() {
      const language = (localStorage.getItem('language') || 'en').toLowerCase().split('-')[0]

      if (Date.now() < (failedUntil.get(language) ?? 0)) return

      if (this.lang === language && (this.loadedLang === language || this.dbCards.length > 0)) return
      if (this.loadingLang === language && loadingPromise) return loadingPromise

      this.lang = language
      this.loadingLang = language

      loadingPromise = (async () => {
        await this.fetchDbCards(language)
      })()

      try {
        await loadingPromise
        failedUntil.delete(language)
      } catch (error) {
        failedUntil.set(language, Date.now() + 30_000)
        throw error
      } finally {
        if (this.loadingLang === language) {
          this.loadingLang = null
          loadingPromise = null
        }
      }
    },
  },
})
