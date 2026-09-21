import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import api from '@/api'
import CustomCardPicker from '@/arkham/components/debug/CustomCardPicker.vue'
import { loadLocaleMessages, normalizeLocale } from '@/locales/messages'
import type { Game } from '@/arkham/types/Game'

let closeCurrent: (() => void) | null = null
let generation = 0

export async function mountPicker(game: Game, investigatorId: string) {
  const current = ++generation
  closeCurrent?.()
  const token = localStorage.getItem('arkham-token')
  if (!token) return
  api.defaults.headers.common.Authorization = `Token ${token}`
  const { locale, messages } = await loadLocaleMessages(normalizeLocale(localStorage.getItem('language') ?? 'en'))
  if (current !== generation) return
  const host = document.createElement('div')
  host.id = 'legacy-custom-card-picker'
  document.body.appendChild(host)
  const close = () => {
    app.unmount()
    host.remove()
    window.removeEventListener('hashchange', close)
    window.removeEventListener('keydown', escape)
    closeCurrent = null
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopImmediatePropagation(); close() }
  }
  const app = createApp(CustomCardPicker, { game, investigatorId, editorHref: '/?ui=legacy#/card-builder', onClose: close })
  app.use(createPinia())
  app.use(createI18n({ legacy: false, locale, messages: { [locale]: messages }, warnHtmlMessage: false }))
  app.mount(host)
  closeCurrent = close
  window.addEventListener('hashchange', close, { once: true })
  window.addEventListener('keydown', escape)
}
