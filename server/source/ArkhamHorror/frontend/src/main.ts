import './styles/index.css'
import './styles/tabletop.css'
import './styles/tabletopHome.css'
import './styles/siteSurfaces.css'
import './styles/tabletopInteraction.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import FloatingVue from 'floating-vue'
import Toast from "vue-toastification";
import { createVfm } from 'vue-final-modal'
import App from './App.vue'
import router from './router'
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faExpeditedssl } from "@fortawesome/free-brands-svg-icons";
import { faGear, faLayerGroup, faBan, faCircleExclamation, faGhost, faLocationDot, faSearch, faList, faImage, faAngleDown, faUndo, faTrash, faEye, faCopy, faExternalLink, faRefresh, faBook, faChevronRight, faBars, faTimes, faShieldHeart, faWrench, faPaperclip, faArrowLeft, faArrowUp, faStore, faTriangleExclamation, faShuffle, faTrophy, faDownload, faCheckDouble, faFlask, faBug, faPen, faThumbsUp } from '@fortawesome/free-solid-svg-icons'
import * as VueI18n from 'vue-i18n'
import { loadLocaleMessages, normalizeLocale } from '@/locales/messages'
import { preferredLanguage } from '@/locales/language'
import { initializeCardImagePreferences } from '@/cardImagePreferences'
import mitt from 'mitt';

library.add(faBan, faLocationDot, faCircleExclamation, faGhost, faSearch, faList, faImage, faAngleDown, faExpeditedssl, faUndo, faTrash, faEye, faCopy, faExternalLink, faRefresh, faBook, faChevronRight, faBars, faTimes, faShieldHeart, faWrench, faPaperclip, faArrowLeft, faArrowUp, faStore, faTriangleExclamation, faShuffle, faTrophy, faGear, faLayerGroup, faDownload, faCheckDouble, faFlask, faBug, faPen, faThumbsUp)

async function bootstrap() {
  initializeCardImagePreferences()
  const language = localStorage.getItem('language')
  const naviLanguage = preferredLanguage(navigator.language || 'en')
  const currentLanguage = language ?? naviLanguage
  const currentLocale = normalizeLocale(currentLanguage)
  if (!language) { localStorage.setItem('language', currentLanguage) }

  const loadedMessages: Record<string, any> = {}
  const current = await loadLocaleMessages(currentLocale)
  loadedMessages[current.locale] = current.messages

  const i18n = VueI18n.createI18n({
    locale: currentLocale, // set locale
    fallbackLocale: 'en', // set fallback locale
    legacy: false,
    warnHtmlMessage: false,
    messages: loadedMessages
  })

  const pinia = createPinia()
  const vfm = createVfm()
  const emitter = mitt()

  const app = createApp(App)
  app.use(router)
  app.use(pinia)
  app.use(FloatingVue, {
    themes: {
      'stack-indicator-popover': {
        $extend: 'dropdown',
      },
      'chaos-bag-stats-popover': {
        $extend: 'dropdown',
      },
      'cards-under-popover': {
        $extend: 'dropdown',
      },
    },
  })
  app.use(Toast, {})
  app.use(vfm)
  app.use(i18n)
  app.component("font-awesome-icon", FontAwesomeIcon as any)

  app.config.globalProperties.emitter = emitter

  app.mount('#app')

  if (currentLocale !== 'en') {
    const loadEnglishFallback = async () => {
      const fallback = await loadLocaleMessages('en')
      i18n.global.setLocaleMessage(fallback.locale, fallback.messages)
    }
    const schedule = () => void loadEnglishFallback().catch((error) => {
      console.warn('Could not load English fallback messages', error)
    })
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(schedule, { timeout: 2500 })
    } else {
      globalThis.setTimeout(schedule, 0)
    }
  }
}

void bootstrap()
