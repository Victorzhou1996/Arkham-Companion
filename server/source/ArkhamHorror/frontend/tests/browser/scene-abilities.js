import '../../src/styles/index.css'
import '../../src/styles/tabletop.css'
import '../../src/styles/edgeTabletop.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import FloatingVue from 'floating-vue'
import { createI18n } from 'vue-i18n'
import { createVfm } from 'vue-final-modal'
import mitt from 'mitt'
import Fixture from './scene-abilities.vue'
import { gameDecoder } from '../../src/arkham/types/Game'
import { loadLocaleMessages } from '../../src/locales/messages'
const raw = await (await fetch('/qa-fixture.json')).json()
const game = await gameDecoder.decodeToPromise(raw.game)
const messages = await loadLocaleMessages('en')
const app = createApp(Fixture, { game }).use(createPinia()).use(FloatingVue, { themes: { 'cards-under-popover': { $extend: 'dropdown' } } })
  .use(createI18n({ legacy: false, locale: 'en', messages: { en: messages.messages }, missingWarn: false, fallbackWarn: false }))
  .use(createVfm()).component('font-awesome-icon', { template: '<span />' })
app.config.globalProperties.emitter = mitt()
app.mount('#app')
