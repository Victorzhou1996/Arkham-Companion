import '../../src/styles/index.css'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import FormattedEntry from '../../src/arkham/components/FormattedEntry.vue'
import { loadLocaleMessages } from '../../src/locales/messages'

const { messages } = await loadLocaleMessages(new URLSearchParams(location.search).get('lang') || 'zh')
const missing = []
const i18n = createI18n({ legacy: false, locale: 'zh', fallbackLocale: false, warnHtmlMessage: false,
  missing: (_locale, key) => { missing.push(key); return key }, messages: { zh: messages } })
function leaves(value, path) {
  if (typeof value === 'string') return [[path, value]]
  return Object.entries(value).flatMap(([key, entry]) => leaves(entry,
    Array.isArray(value) ? `${path}[${key}]` : /^\w+$/.test(key) ? `${path}.${key}` : `${path}['${key}']`))
}
const entries = ['theDreamEaters', 'theFeastOfHemlockVale', 'theDrownedCity'].flatMap(c => leaves(messages[c], c))
createApp({ render: () => h('main', { style: 'max-width:900px;margin:20px auto;padding:20px;background:#fafafa;color:#222' }, entries.map(([key, text]) => {
  const variables = Object.fromEntries([...text.matchAll(/\{([A-Za-z]\w*)\}/g)].map(m => [m[1], 7]))
  variables.token = 'skull'
  return h('section', { 'data-key': key, style: 'margin-bottom:24px;overflow-wrap:anywhere' },
    [h(FormattedEntry, { entry: { tag: 'I18nEntry', key, variables } })])
})) }).use(createPinia()).use(i18n).mount('#app')
await nextTick()
window.campaignQA = { count: entries.length, missing }
