<script lang="ts">
import { defineComponent, h } from 'vue'
import { chaosTokenImage } from '@/arkham/types/ChaosToken'
import { cardArt } from '@/arkham/cardImages'
import { Game } from '@/arkham/types/Game'
import { handleEmbeddedI18n } from '@/arkham/i18n'
import { useDbCardStore } from '@/stores/dbCards'
import { useI18n } from 'vue-i18n'
import { buildKnownTranslations, translateGameLogText } from '@/arkham/gameLogLocalization'

const knownTranslationCache = new Map<
  string,
  { source: object; target: object; translations: Map<string, string> }
>()


export default defineComponent({
  props: {
    game: { type: Object as () => Game, required: true },
    msg: { type: String, required: true },
  },
  setup() {
    const dbCards = useDbCardStore()
    const { getLocaleMessage, locale, t } = useI18n()
    return { dbCards, getLocaleMessage, locale, t }
  },
  render() {
    const source = this.getLocaleMessage('en')
    const target = this.getLocaleMessage(this.locale)
    let cached = knownTranslationCache.get(this.locale)
    if (!cached || cached.source !== source || cached.target !== target) {
      cached = { source, target, translations: buildKnownTranslations(source, target) }
      knownTranslationCache.set(this.locale, cached)
    }
    const knownTranslations = cached.translations

    const localizedCardName = (code: string, fallback: string) => {
      const card = this.dbCards.getDbCard(code.replace(/^c/, ''))
      if (!card) return fallback.replace(/\\"/g, '"')
      const separator = this.locale.toLowerCase().startsWith('zh') ? '：' : ': '
      return fallback.includes(':') && card.subname
        ? `${card.name}${separator}${card.subname}`
        : card.name
    }

    const msg = handleEmbeddedI18n(this.msg, this.t)
      // Logs written before custom token formatting was fixed contain the
      // Haskell constructor and an extra pair of quotes. Keep saved logs
      // renderable while new entries use the canonical homebrew slug.
      .replace(/\{token:"CustomToken "([^"]+)""\}/g, '{token:"$1"}')
    const splits = msg.split(/({[^}]+})/)
    const els = splits.map((split) => {
      if (/{card:"((?:[^"]|\\.)+)":"([^"]+)":"([^"]+)"}/.test(split)) {
        const found = split.match(/{card:"((?:[^"]|\\.)+)":"([^"]+)":"([^"]+)"}/)
        if (found) {
          const [, cardName, cardCode] = found
          if (cardName && cardCode) {
            return h('span', { 'data-image-id': cardCode }, localizedCardName(cardCode, cardName))
          }
        }
      } else if (/{investigator:"((?:[^"]|\\.)+)":"([^"]+)"}/.test(split)) {
        const found = split.match(/{investigator:"((?:[^"]|\\.)+)":"([^"]+)"}/)
        if (found) {
          const [, name, investigatorId] = found
          if (investigatorId) {
            const code = this.game.investigators[investigatorId]?.cardCode ?? investigatorId
            return name
              ? h(
                  'span',
                  { 'data-image-id': investigatorId, class: 'card--sideways' },
                  localizedCardName(code, name),
                )
              : split
          }
        }
      } else if (/{enemy:"((?:[^"]|\\.)+)":(.+):"([^"]+)"}/.test(split)) {
        const found = split.match(/{enemy:"((?:[^"]|\\.)+)":(.+):"([^"]+)"}/)
        if (found) {
          const [, name, , cardCode] = found
          if (cardCode) {
            return name
              ? h('span', { 'data-image-id': cardCode }, localizedCardName(cardCode, name))
              : split
          }
        }
      } else if (/{location:"((?:[^"]|\\.)+)":(.+):"([^"]+)"}/.test(split)) {
        const found = split.match(/{location:"((?:[^"]|\\.)+)":(.+):"([^"]+)"}/)
        if (found) {
          const [, name, locationId, cardCode] = found
          const location = this.game.locations[locationId]

          if (location) {
            const actualCardCode = cardArt(location.cardCode, location.revealed ? '' : 'b')
            return name
              ? h(
                  'span',
                  { 'data-image-id': actualCardCode },
                  localizedCardName(actualCardCode, name),
                )
              : split
          }

          if (cardCode) {
            return name
              ? h('span', { 'data-image-id': cardCode }, localizedCardName(cardCode, name))
              : split
          }

          return name
            ? h('span', { 'data-image-id': cardCode }, localizedCardName(cardCode, name))
            : split
        }
      } else if (/{location:"((?:[^"]|\\.)+)":(.+)}/.test(split)) {
        const found = split.match(/{location:"((?:[^"]|\\.)+)":(.+)}/)
        if (found) {
          const [, name, locationId] = found
          if (locationId) {
            const code = this.game.locations[locationId]?.cardCode ?? locationId
            return name
              ? h('span', { 'data-image-id': locationId }, localizedCardName(code, name))
              : split
          }
        }
      } else if (/{token:"([^"]+)"}/.test(split)) {
        const found = split.match(/{token:"([^"]+)"}/)
        if (found) {
          const [, token] = found
          if (token) {
            return h('img', { 'src': chaosTokenImage(token), 'width': '23', 'class': 'chaos-token' })
          }
        }
      }
      return translateGameLogText(split, this.t, knownTranslations)
    })

    return h('div', { className: 'message-body' }, els)
  },
})
</script>

<style scoped>
span[data-image-id] {
  color: #bbb;
  cursor: pointer;
}

img.chaos-token {
  display: inline-block;
  vertical-align: text-top;
}
</style>
