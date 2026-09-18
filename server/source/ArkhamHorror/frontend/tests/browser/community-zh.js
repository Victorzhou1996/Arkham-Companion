import '../../src/styles/index.css'
import { createApp, h, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import GameMessage from '../../src/arkham/components/GameMessage.vue'
import QuestionChoices from '../../src/arkham/components/QuestionChoices.vue'
import FormattedEntry from '../../src/arkham/components/FormattedEntry.vue'
import { useDbCardStore } from '../../src/stores/dbCards'
import { loadLocaleMessages } from '../../src/locales/messages'
import { imgsrc, checkImageExists } from '../../src/arkham/helpers'

const language = new URLSearchParams(location.search).get('lang') || 'zh'
localStorage.setItem('language', language)
const pinia = createPinia()
setActivePinia(pinia)
await useDbCardStore().initDbCards()
await checkImageExists(language)
const images = ['cards/01001.avif', 'cards/01001b.avif', 'customizations/09100.jpg', 'portraits/01001.jpg',
  'boxes/01.jpg', 'encounter-sets/a-light-in-the-fog.png', 'mini-cards/acolyte-any.jpg',
  'playing-cards/Ace-Clubs.png', 'seals/seal-a-active.png', 'sets/01.png', 'tarot/tarot-0.jpg']
const { messages, locale } = await loadLocaleMessages(language)
const { messages: en } = await loadLocaleMessages('en')
const missing = []
const i18n = createI18n({ legacy: false, locale, fallbackLocale: false, warnHtmlMessage: false,
  messages: { en, [locale]: messages }, missing: (_locale, key) => { missing.push(key); return key } })
const game = { investigators: {}, locations: {} }
const labels = ['Discover Clue at Rainy London Streets', 'Damage Paracausal Entity',
  '$name __name=s:"60268" name=s:"Establish Motive"', '$name __name=s:"60566" name=s:"Lie in Wait"']
const logs = ['阿曼达·夏普：学生 must discard down to 9 cards', '阿曼达·夏普：学生 discovered 1 clue',
  'Record "you havent seen the last of the red gloved man"', 'Record "the cell knows of desis past"']
const entries = []
for (const campaign of ['thePathToCarcosa', 'theForgottenAge', 'theCircleUndone', 'theInnsmouthConspiracy', 'edgeOfTheEarth', 'theScarletKeys']) {
  for (const [i] of messages[campaign].specialRules.entries()) {
    for (const field of ['title', 'body']) entries.push(`${campaign}.specialRules[${i}].${field}`)
  }
}
entries.push(...Object.keys(messages.theScarletKeys.dealingsInTheDark.act2Setup).map(key => `theScarletKeys.dealingsInTheDark.act2Setup.${key}`))
const chosen = ref(null)
createApp({ render: () => h('main', { style: 'max-width:900px;margin:20px auto;padding:16px;background:#fafafa;color:#222' }, [
  h('div', { id: 'reaction' }, i18n.global.t('Reaction')),
  h(QuestionChoices, { game, choices: labels.map((label, i) => [{ tag: 'Label', label }, i]), onChoose: i => { chosen.value = i } }),
  h('output', { id: 'chosen' }, String(chosen.value)),
  ...logs.map(msg => h('section', { class: 'log' }, h(GameMessage, { game, msg }))),
  h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' }, images.map(src => h('img', { src: imgsrc(src), 'data-asset': src, alt: src, style: 'width:75px;height:110px;object-fit:contain' }))),
  ...entries.map(key => h('section', { 'data-key': key, style: 'margin:16px 0;overflow-wrap:anywhere' },
    h(FormattedEntry, { entry: { tag: 'I18nEntry', key, variables: {} } }))),
]) }).use(pinia).use(i18n).mount('#app')
await nextTick()
window.communityQA = { missing, entries: entries.length }
