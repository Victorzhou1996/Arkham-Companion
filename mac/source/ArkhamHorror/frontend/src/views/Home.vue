<script lang="ts" setup>
import { ref, computed, onUnmounted, Ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRouter, useRoute } from 'vue-router'
import {
  deleteGame,
  fetchGames,
  fetchEvents,
  fetchNotifications,
  fetchPublicStats,
} from '@/arkham/api'
import { cullGameLocalStorage, removeGameLocalStorage } from '@/arkham/localStorage'
import type { GameDetails } from '@/arkham/types/Game'
import type { EventListEntry } from '@/arkham/types/EpicEvent'
import type { AppNotification } from '@/arkham/api'
import type { PublicStats } from '@/arkham/api'
import GameRow from '@/arkham/components/GameRow.vue'
import EventRow from '@/arkham/components/EventRow.vue'
import NewGame from '@/arkham/views/NewCampaign.vue'
import ImportGame from '@/arkham/components/ImportGame.vue'
import PrimaryButton from '@/components/PrimaryButton.vue'
import { storeToRefs } from 'pinia'
import { APP_VERSION } from '@/version'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const { currentUser } = storeToRefs(store)
const homeCacheVersion = 1
const homeCacheMaxAge = 7 * 24 * 60 * 60 * 1000
const publicStatsRefreshMs = 60 * 60 * 1000

interface HomeCache {
  version: number
  savedAt: number
  games: GameDetails[]
  events: EventListEntry[]
}

function tokenCacheKey() {
  const token = localStorage.getItem('arkham-token') ?? 'guest'
  let hash = 2166136261
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `arkham-home-summary:${(hash >>> 0).toString(16)}`
}

function readHomeCache(): HomeCache | null {
  try {
    const cached = JSON.parse(localStorage.getItem(tokenCacheKey()) ?? 'null') as HomeCache | null
    if (
      cached?.version !== homeCacheVersion ||
      !Array.isArray(cached.games) ||
      !Array.isArray(cached.events) ||
      Date.now() - cached.savedAt > homeCacheMaxAge
    ) {
      return null
    }
    return cached
  } catch {
    return null
  }
}

const cachedHome = readHomeCache()
const games: Ref<GameDetails[]> = ref(cachedHome?.games ?? [])
const events: Ref<EventListEntry[]> = ref(cachedHome?.events ?? [])
const notifications: Ref<AppNotification[]> = ref([])
const publicStats: Ref<PublicStats | null> = ref(null)

const dismissedNotifications = JSON.parse(localStorage.getItem('dismissedNotifications') ?? '[]')

const activeGames = computed(() => games.value.filter((g) => g.gameState.tag !== 'IsOver'))
const finishedGames = computed(() => games.value.filter((g) => g.gameState.tag === 'IsOver'))

function writeHomeCache() {
  try {
    localStorage.setItem(
      tokenCacheKey(),
      JSON.stringify({
        version: homeCacheVersion,
        savedAt: Date.now(),
        games: games.value,
        events: events.value,
      } satisfies HomeCache),
    )
  } catch {
    // A fresh server response still remains available for this visit.
  }
}

fetchGames()
  .then((result) => {
    const availableGames = result.filter((g) => g.tag === 'game') as GameDetails[]
    cullGameLocalStorage(availableGames)
    games.value = availableGames
    writeHomeCache()
  })
  .catch((error) => {
    console.warn('Could not refresh saved games', error)
  })

// Epic Multiplayer events surface as a single entry each, inline with regular
// games (group games are hidden from fetchGames by the backend). A user who is
// both organizer and player of an event gets duplicate membership rows; collapse
// to one entry, preferring the organizer role.
fetchEvents()
  .then((result) => {
    const byId = new Map<string, EventListEntry>()
    for (const entry of result) {
      const existing = byId.get(entry.id)
      if (!existing || entry.role === 'organizer') byId.set(entry.id, entry)
    }
    events.value = [...byId.values()]
    writeHomeCache()
  })
  .catch((error) => {
    console.warn('Could not refresh events', error)
  })

fetchNotifications().then((result) => {
  notifications.value = result.filter(
    (n: AppNotification) => !dismissedNotifications.includes(n.id) && !isSupportNotification(n),
  )
})

function refreshPublicStats() {
  fetchPublicStats()
    .then((result) => {
      publicStats.value = result
    })
    .catch(() => {
      // Local deployments do not run the public statistics endpoint.
    })
}

refreshPublicStats()
const publicStatsTimer = window.setInterval(refreshPublicStats, publicStatsRefreshMs)
onUnmounted(() => window.clearInterval(publicStatsTimer))

async function deleteGameEvent(game: GameDetails) {
  deleteGame(game.id).then(() => {
    removeGameLocalStorage(game.id)
    games.value = games.value.filter((g) => g.id !== game.id)
    writeHomeCache()
  })
}

const newGame = ref(route.path === '/new-game' || false)
const showImportGame = ref(false)
const importGameRef = ref<any>(null)
const supportQrSrc = `${import.meta.env.BASE_URL}wechat_qr.png`
const importGameSelected = computed(() => !!importGameRef.value?.selectedFile)
const importGameCanSubmit = computed(() => importGameRef.value?.canSubmit ?? false)
const importGameLoading = computed(() => importGameRef.value?.loading ?? false)
const submitImportGame = () => importGameRef.value?.submit()

// View Transition helper
function withViewTransition(fn: () => void) {
  const d = document as any
  if (typeof d.startViewTransition === 'function') {
    d.startViewTransition(() => fn())
  } else {
    fn()
  }
}

const toggleNewGame = () => {
  withViewTransition(() => {
    newGame.value = !newGame.value
    showImportGame.value = false
    if (newGame.value === true) {
      router.push({ path: '/new-game' })
    } else {
      router.push({ path: '/' })
    }
  })
}

const toggleImportGame = () => {
  showImportGame.value = !showImportGame.value
}

const dismissNotification = (notification: AppNotification) => {
  localStorage.setItem(
    'dismissedNotifications',
    JSON.stringify([notification.id, ...dismissedNotifications]),
  )
  notifications.value = notifications.value.filter((n) => n.id !== notification.id)
}

const isSupportNotification = (notification: AppNotification) => {
  const body = notification.body.toLowerCase()
  return (
    body.includes('wechat_qr') ||
    body.includes('赞赏码') ||
    body.includes('赞助码') ||
    body.includes('捐赠') ||
    body.includes('二维码')
  )
}
</script>

<template>
  <div class="page-container">
    <NewGame v-if="currentUser && newGame" @close="toggleNewGame">
      <template #cancel>
        <button @click="toggleNewGame" class="cancel-new-game-button">
          <span>{{ $t('cancel') }}</span>
        </button>
      </template>
    </NewGame>

    <div v-if="!newGame" class="home page-content">
      <div class="notification" v-for="notification in notifications" :key="notification.id">
        <p v-html="notification.body"></p>
        <a @click.prevent="dismissNotification(notification)" href="#">{{ $t('home.dismiss') }}</a>
      </div>

      <div class="home-layout">
        <aside class="support-card" aria-labelledby="support-title">
          <h3 id="support-title">{{ $t('home.supportTitle') }}</h3>
          <img :src="supportQrSrc" :alt="$t('home.supportAlt')" />
          <dl v-if="publicStats" class="server-stats" :aria-label="$t('home.serverStats')">
            <div>
              <dt>{{ $t('home.totalPlayers') }}</dt>
              <dd>{{ publicStats.players.toLocaleString() }}</dd>
            </div>
            <div>
              <dt>{{ $t('home.totalGames') }}</dt>
              <dd>{{ publicStats.games.toLocaleString() }}</dd>
            </div>
            <div>
              <dt>{{ $t('home.totalSaveSteps') }}</dt>
              <dd>{{ publicStats.saveSteps.toLocaleString() }}</dd>
            </div>
          </dl>
          <p>{{ $t('home.supportBody') }}</p>
        </aside>

        <div class="container">
          <section>
            <header class="main-header">
              <h2>{{ $t('activeGames') }}</h2>
              <div class="header-actions">
                <button
                  v-if="currentUser"
                  class="secondary-cta"
                  type="button"
                  @click="toggleImportGame"
                >
                  {{ $t('home.loadGame') }}
                </button>
                <PrimaryButton :label="$t('newGame')" @click="toggleNewGame" />
              </div>
            </header>
            <Transition name="slide">
              <div v-if="currentUser && showImportGame" class="load-game-panel">
                <div class="panel-header">
                  <h3>{{ $t('home.loadGame') }}</h3>
                  <div class="panel-actions">
                    <button class="panel-close" type="button" @click="toggleImportGame">
                      {{ $t('cancel') }}
                    </button>
                    <button
                      v-if="importGameSelected"
                      class="panel-load"
                      type="button"
                      :disabled="!importGameCanSubmit"
                      @click="submitImportGame"
                    >
                      {{ importGameLoading ? $t('home.loadingGame') : $t('home.loadGame') }}
                    </button>
                  </div>
                </div>
                <ImportGame ref="importGameRef" />
              </div>
            </Transition>
            <div v-if="activeGames.length === 0 && events.length === 0" class="box">
              <p>{{ $t('home.noActiveGames') }}</p>
            </div>
            <EventRow v-for="event in events" :key="event.id" :event="event" />
            <GameRow
              v-for="game in activeGames"
              :key="game.id"
              :game="game"
              :deleteGame="() => deleteGameEvent(game)"
            />
          </section>

          <section>
            <header>
              <h2 v-if="finishedGames.length > 0">{{ $t('finishedGames') }}</h2>
            </header>
            <GameRow
              v-for="game in finishedGames"
              :key="game.id"
              :game="game"
              :deleteGame="() => deleteGameEvent(game)"
            />
          </section>
        </div>
      </div>
    </div>
    <div v-if="!newGame" class="app-version" aria-label="Application version">
      v{{ APP_VERSION }}
    </div>
  </div>
</template>

<style scoped>
h2 {
  color: var(--title);
  font-size: 2em;
  text-transform: uppercase;
  font-family: teutonic, sans-serif;
  margin: 0;
  @media (max-width: 768px) {
    font-size: 1.5em;
  }
}

.new-game {
  button {
    border-radius: 3px;
    outline: 0;
    padding: 10px 15px;
    background: var(--spooky-green);
    text-transform: uppercase;
    color: white;
    border: 0;
    width: 100%;
    &:hover {
      background: hsl(80, 35%, 32%);
    }
  }
}

.home {
  box-sizing: border-box;
  margin: 0 auto;
  max-width: 1800px;
  width: 98vw;
  @media (max-width: 768px) {
    min-width: unset;
    width: 100%;
    padding: 0 12px;
    box-sizing: border-box;
  }
}

.server-stats {
  border-bottom: 1px solid var(--box-border);
  color: var(--text);
  display: grid;
  font-size: 0.78em;
  gap: 4px;
  margin: 0 0 10px;
  opacity: 0.78;
  padding: 0 2px 10px;
  width: 100%;

  div {
    align-items: baseline;
    display: flex;
    justify-content: space-between;
  }

  dt,
  dd {
    margin: 0;
  }

  dd {
    color: var(--title);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
}

.app-version {
  bottom: 5px;
  color: var(--text);
  font-size: 11px;
  opacity: 0.42;
  pointer-events: none;
  position: fixed;
  right: 8px;
  z-index: 10;
}

.home-layout {
  align-items: start;
  display: grid;
  gap: clamp(16px, 2vw, 32px);
  grid-template-columns: minmax(248px, 0.75fr) minmax(0, 4fr) minmax(248px, 0.75fr);
}

.home-layout::after {
  content: '';
}

.container {
  min-width: 0;
}

.support-card {
  background: var(--box-background);
  border: 1px solid var(--box-border);
  border-radius: 6px;
  color: var(--title);
  padding: 12px;
  position: sticky;
  top: 12px;
  width: 248px;

  h3 {
    font-family: teutonic, sans-serif;
    font-size: 1.1em;
    margin: 0 0 8px;
    text-transform: uppercase;
  }

  img {
    background: white;
    border-radius: 4px;
    display: block;
    margin-bottom: 10px;
    max-width: 100%;
    width: 222px;
  }

  p {
    color: var(--text);
    font-size: 0.9em;
    line-height: 1.45;
  }

  @media (max-width: 1100px) {
    display: none;
  }
}

@media (max-width: 1100px) {
  .home-layout {
    display: block;
  }

  .home-layout::after {
    display: none;
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease-in-out;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}

button {
  transition: background-color 0.3s linear;
}

button.cancel-new-game-button {
  height: fit-content;
  align-self: center;
  font-size: 1em;
  font-weight: bolder;
  width: fit-content;
  background-color: var(--survivor);
  &:hover {
    background-color: var(--survivor-extra-dark);
  }
}

button.new-game-button {
  height: fit-content;
  align-self: center;
  font-size: 1em;
  font-weight: bolder;
  width: fit-content;
  margin-block: 10px;
}

p {
  margin: 0;
  padding: 0;
}

.box {
  background-color: var(--box-background);
  border: 1px solid var(--box-border);
  color: var(--title);
  padding: 10px;
  border-radius: 5px;
}

form.box {
  display: flex;
  flex-direction: column;
  gap: 10px;

  button {
    text-transform: uppercase;
    padding: 10px;
  }
}

header {
  display: flex;
  margin-bottom: 10px;
  align-items: center;
  gap: 12px;
  h2 {
    flex: 1;
  }

  button {
    height: fit-content;
    align-self: center;
    background-color: var(--button-1);
    border-radius: 3px;
    outline: 0;
    padding: 10px 15px;
    text-transform: uppercase;
    color: white;
    border: 0;
    font-size: 1em;
    font-weight: bolder;
    &:hover {
      background: hsl(80, 35%, 32%);
    }
  }
}

.games {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.secondary-cta {
  align-self: center;
  background: transparent;
  border: 1px solid var(--box-border);
  border-radius: 3px;
  color: var(--title);
  cursor: pointer;
  font-size: 0.85em;
  font-weight: 700;
  opacity: 0.8;
  outline: 0;
  padding: 8px 12px;
  text-transform: uppercase;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    opacity: 1;
  }

  @media (max-width: 768px) {
    padding: 6px 9px;
    font-size: 0.75em;
  }
}

.load-game-panel {
  background: var(--box-background);
  border: 1px solid var(--box-border);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.panel-header h3 {
  flex: 1;
  margin: 0;
  color: var(--title);
  font-family: teutonic, sans-serif;
  font-size: 1.4em;
  text-transform: uppercase;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-load,
.panel-close {
  border: 1px solid var(--box-border);
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8em;
  font-weight: bolder;
  padding: 7px 10px;
  text-transform: uppercase;
}

.panel-load {
  background: var(--spooky-green);
  border-color: var(--spooky-green);
  color: white;

  &:hover:not(:disabled) {
    background: hsl(80, 35%, 32%);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.panel-close {
  background: transparent;
  color: var(--title);

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
}

.notification {
  --text: #816f3a;
  --border: var(--text);
  --background: #fff8e6;
  display: flex;
  flex-direction: row;
  box-sizing: border-box;
  padding: 10px;
  border: 2px solid var(--border);
  color: var(--text);
  margin-block: 10px;
  font-size: 1.2em;
  border-radius: 5px;
  background-color: var(--background);
  gap: 5px;

  > p {
    flex: 1;
  }

  :deep(a) {
    color: var(--seeker-dark);
    text-decoration: underline;
  }
}

header.main-header {
  view-transition-name: main-header;
  h2 {
    view-transition-name: main-header-title;
  }
  .primary-btn {
    view-transition-name: main-header-button;
  }
}
</style>
