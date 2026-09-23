import {
  cardArtReference, customCardArt, customCardDef, customCardDefs, customCardPlaceholder,
  customCards, isCustomCardCode, registerCustomCards, stripCardCodePrefix, unregisterCustomCard,
} from '@/arkham/customCards'
import { LEGACY_UI_PATH } from './editorMode'
import { createApp, type App } from 'vue'
import MusicControls from '@/arkham/components/MusicControls.vue'
import { setMusicScenario } from '@/arkham/bgm'

let generation = 0
let musicApp: App | null = null
let musicHost: HTMLElement | null = null
function mountMusic() {
  if (musicHost && !musicHost.isConnected) {
    musicApp?.unmount()
    musicApp = null
    musicHost = null
  }
  const panel = document.querySelector('#narration-panel')
  if (!panel || musicHost) return
  musicHost = document.createElement('div')
  panel.prepend(musicHost)
  musicApp = createApp(MusicControls)
  musicApp.mount(musicHost)
  const heading = document.createElement('h3')
  heading.textContent = text('语音朗读', 'Voice narration')
  heading.style.cssText = 'font-size:16px;color:inherit;margin:0 0 10px'
  musicHost.after(heading)
}
const enabled = () => localStorage.getItem('arkhamCustomCardsEnabled') === 'true'
const chinese = () => (localStorage.getItem('language') ?? 'en').startsWith('zh')
const text = (zh: string, en: string) => chinese() ? zh : en

async function load(gameId: string) {
  const request = ++generation
  const token = localStorage.getItem('arkham-token')
  if (!token) return []
  const response = await fetch(`/api/v1/arkham/games/${encodeURIComponent(gameId)}/custom-cards`, {
    headers: { Authorization: `Token ${token}` }, credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`Custom cards: ${response.status}`)
  const cards = await response.json()
  if (!Array.isArray(cards)) throw new Error('Invalid custom card response')
  if (request !== generation) return customCardDefs()
  for (const card of customCards()) unregisterCustomCard(card.def.cardCode)
  registerCustomCards(cards)
  return customCardDefs()
}

export function resolveArt(path: string): { url?: string; reference?: string } | null {
  const match = /^(cards|portraits)\/(c?\*[^/]+)\.(avif|jpe?g|png)$/.exec(path.replace(/^\//, ''))
  if (!match) return null
  const code = stripCardCodePrefix(match[2])
  const def = customCardDef(code) ?? customCardDef(code.replace(/[ab]$/, ''))
  const portrait = match[1] === 'portraits'
  const art = portrait ? (code.endsWith('b') ? def?.meta?.portraitBack : def?.meta?.portrait) ?? customCardArt(code) : customCardArt(code)
  const reference = cardArtReference(art)
  if (reference) return { reference: `${portrait ? 'portraits' : 'cards'}/${reference}.${portrait ? 'jpg' : 'avif'}` }
  if (typeof art === 'string' && /^(https?:\/\/|data:image\/|blob:|\/(?!\/))/.test(art)) return { url: art }
  return { url: customCardPlaceholder(code) }
}

function unknownCards(game: any): boolean {
  for (const kind of ['investigators', 'assets', 'enemies', 'events', 'treacheries', 'locations', 'skills']) {
    for (const entity of Object.values(game?.[kind] ?? {}) as any[]) {
      if (typeof entity.cardCode === 'string' && isCustomCardCode(entity.cardCode) && !customCardDef(entity.cardCode)) return true
      for (const card of [...(entity.hand ?? []), ...(entity.discard ?? [])]) {
        const code = card.contents?.cardCode ?? card.cardCode
        if (typeof code === 'string' && isCustomCardCode(code) && !customCardDef(code)) return true
      }
    }
  }
  return false
}

// The old app is a pinned compiled bundle. Its exact hooks are verified at build time.
;(window as any).arkhamLegacyCustomCards = {
  updateMusic(game: any) {
    setMusicScenario(game?.id ?? null, game?.phase === 'CampaignPhase' || game?.gameState?.tag === 'IsOver' ? null : game?.scenario?.id ?? null)
  },
  load, resolveArt, unknownCards, enabled,
  buttonLabel: () => text('+ 自定义卡牌', '+ Custom card'),
  async openPicker(game: any, investigatorId: string) {
    if (!enabled()) return
    const { mountPicker } = await import('./mountPicker')
    await mountPicker(game, investigatorId)
  },
}

function mountNavigation() {
  mountMusic()
  if (!enabled()) for (const link of document.querySelectorAll('[data-custom-deck-link]')) link.remove()
  for (const deck of document.querySelectorAll<HTMLAnchorElement>('a[href*="#/deck/"]')) {
    const id = /#\/deck\/([a-zA-Z0-9-]+)/.exec(deck.href)?.[1]
    if (!id || !enabled() || deck.parentElement?.querySelector('[data-custom-deck-link]')) continue
    const link = document.createElement('a')
    link.dataset.customDeckLink = 'true'
    link.href = `/?ui=legacy#/card-builder/deck/${id}`
    link.textContent = text('自定义牌组调整', 'Custom deck overlay')
    link.style.cssText = 'display:inline-block;padding:6px 10px;color:inherit'
    deck.parentElement?.appendChild(link)
  }
  for (const nav of document.querySelectorAll<HTMLElement>('#nav .main-links, #nav .mobile-menu')) {
    if (localStorage.getItem('arkham-token') && !nav.querySelector('a[href$="#/cards"]')) {
      const link = document.createElement('a')
      link.className = 'nav-link'
      link.href = '/?ui=legacy#/cards'
      link.textContent = text('卡牌', 'Cards')
      for (const attribute of nav.querySelector('a')?.attributes ?? []) if (attribute.name.startsWith('data-v-')) link.setAttribute(attribute.name, '')
      nav.appendChild(link)
    }
    const existing = nav.querySelector('[data-custom-cards-link]')
    if (!enabled()) { existing?.remove(); continue }
    if (existing || !localStorage.getItem('arkham-token')) continue
    const link = document.createElement('a')
    link.dataset.customCardsLink = 'true'
    link.className = 'nav-link'
    link.href = '/?ui=legacy#/card-builder'
    link.textContent = text('自定义卡牌', 'Custom Cards')
    const sample = nav.querySelector('[data-v-]') ?? nav.querySelector('a')
    for (const attribute of sample?.attributes ?? []) if (attribute.name.startsWith('data-v-')) link.setAttribute(attribute.name, '')
    nav.appendChild(link)
  }
  if (location.hash.split('?')[0] !== '#/settings' || document.getElementById('legacy-custom-cards-settings')) return
  const page = document.querySelector('.page-content')
  if (!page) return
  const section = document.createElement('section')
  section.id = 'legacy-custom-cards-settings'
  section.className = 'box'
  const title = document.createElement('h2')
  title.textContent = text('自定义卡牌', 'Custom cards')
  const warning = document.createElement('p')
  warning.textContent = text('实验性功能，可能影响游戏进度。编辑器与新版共用同一套卡牌数据；旧版界面偏好保持不变。', 'Experimental. May affect games in progress. Both interfaces share the same card library; your classic UI preference is preserved.')
  const label = document.createElement('label')
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'; checkbox.checked = enabled()
  checkbox.onchange = () => { localStorage.setItem('arkhamCustomCardsEnabled', String(checkbox.checked)); mountNavigation() }
  label.append(checkbox, document.createTextNode(text('启用自定义卡牌', 'Enable custom cards')))
  const link = document.createElement('a')
  link.href = '/?ui=legacy#/card-builder'
  link.textContent = text('打开卡牌编辑器', 'Open card builder')
  link.style.cssText = 'display:inline-block;margin:12px;padding:8px 12px;border:1px solid #87915b;border-radius:4px;color:inherit'
  section.append(title, warning, label, link)
  page.appendChild(section)
}

if (location.pathname.startsWith(LEGACY_UI_PATH)) {
  const observer = new MutationObserver(mountNavigation)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('hashchange', mountNavigation)
  window.addEventListener('hashchange', () => {
    if (!/^#\/games\//.test(location.hash)) setMusicScenario(null, null)
  })
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true })
  mountNavigation()
}
