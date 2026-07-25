<script lang="ts">
import { defineComponent, h } from 'vue'
import { imgsrc } from '@/arkham/helpers'
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

function imageFor(tokenFace: string) {
  switch (tokenFace) {
    case 'PlusOne':
      return imgsrc('ct_plus1.png')
    case 'Zero':
      return imgsrc('ct_0.png')
    case 'MinusOne':
      return imgsrc('ct_minus1.png')
    case 'MinusTwo':
      return imgsrc('ct_minus2.png')
    case 'MinusThree':
      return imgsrc('ct_minus3.png')
    case 'MinusFour':
      return imgsrc('ct_minus4.png')
    case 'MinusFive':
      return imgsrc('ct_minus5.png')
    case 'MinusSix':
      return imgsrc('ct_minus6.png')
    case 'MinusSeven':
      return imgsrc('ct_minus7.png')
    case 'MinusEight':
      return imgsrc('ct_minus8.png')
    case 'AutoFail':
      return imgsrc('ct_autofail.png')
    case 'ElderSign':
      return imgsrc('ct_eldersign.png')
    case 'Skull':
      return imgsrc('ct_skull.png')
    case 'Cultist':
      return imgsrc('ct_cultist.png')
    case 'Tablet':
      return imgsrc('ct_tablet.png')
    case 'ElderThing':
      return imgsrc('ct_elderthing.png')
    case 'BlessToken':
      return imgsrc('ct_bless.png')
    case 'CurseToken':
      return imgsrc('ct_curse.png')
    case 'FrostToken':
      return imgsrc('ct_frost.png')
    default:
      return imgsrc('ct_blank.png')
  }
}

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
            return h('img', { src: imageFor(token), width: '23', class: 'chaos-token' })
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
