<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import type { User } from '@/types'
import api from '@/api'
import { fetchGameExport, fetchGames, importGame } from '@/arkham/api'
import { useDbCardStore } from '@/stores/dbCards'
import { useSettings } from '@/stores/settings'
import { checkImageExists } from '@/arkham/helpers'
import { isDevBuild } from '@/arkham/displayRules'
import { loadLocaleMessages, normalizeLocale } from '@/locales/messages'
import {
  applyCardHoverZoom,
  CARD_HOVER_ZOOM_DEFAULT,
  CARD_HOVER_ZOOM_KEY,
  CARD_HOVER_ZOOM_OPTIONS,
  CDN_BADGE_KEY,
} from '@/cardImagePreferences'

const props = defineProps<{
  user: User
  updateReleaseChannels: (beta: boolean, dev: boolean) => void
}>()

const store = useDbCardStore()
const settings = useSettings()
const { epicMultiplayerStored, aiInvestigatorsStored } = storeToRefs(settings)
const dev = isDevBuild()
const { availableLocales, locale, setLocaleMessage, t } = useI18n({ useScope: 'global' })
const language = ref(localStorage.getItem('language') || locale.value)
const beta = ref(props.user.beta ? 'On' : 'Off')
const devContent = ref(props.user.dev ? 'On' : 'Off')
const cardHoverZoom = ref(
  Number(localStorage.getItem(CARD_HOVER_ZOOM_KEY) ?? CARD_HOVER_ZOOM_DEFAULT),
)
const showCdnBadge = ref(localStorage.getItem(CDN_BADGE_KEY) === '1')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordBusy = ref(false)
const passwordMessage = ref('')
const saveBusy = ref(false)
const saveMessage = ref('')
const runtimeInfo = ref<RuntimeInfo | null>(null)
const runtimeHealthy = ref<boolean | null>(null)
const currentOrigin = window.location.origin

interface RuntimeInfo {
  version?: string
  platform?: string
  lanUrl?: string
  localUrl?: string
  generatedAt?: string
}

const downloadJson = (value: unknown, fileName: string) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

const changePassword = async () => {
  passwordMessage.value = ''
  if (newPassword.value !== confirmPassword.value) {
    passwordMessage.value = t('settingsForm.passwordMismatch')
    return
  }

  passwordBusy.value = true
  try {
    await api.put('account/password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordMessage.value = t('settingsForm.passwordChanged')
  } catch (error: any) {
    passwordMessage.value =
      error?.response?.status === 403
        ? t('settingsForm.currentPasswordWrong')
        : t('settingsForm.passwordChangeFailed')
  } finally {
    passwordBusy.value = false
  }
}

const backupOwnSaves = async () => {
  saveBusy.value = true
  saveMessage.value = ''
  try {
    const games = (await fetchGames()).filter((game) => game.tag === 'game')
    const exports = []
    for (const game of games) {
      const blob = await fetchGameExport(game.id)
      exports.push(JSON.parse(await blob.text()))
    }
    downloadJson(
      {
        format: 'arkham-personal-save-bundle',
        version: 1,
        exportedAt: new Date().toISOString(),
        games: exports,
      },
      `arkham-personal-saves-${new Date().toISOString().slice(0, 10)}.json`,
    )
    saveMessage.value = t('settingsForm.saveBackupComplete', { count: exports.length })
  } catch {
    saveMessage.value = t('settingsForm.saveBackupFailed')
  } finally {
    saveBusy.value = false
  }
}

const restoreOwnSaves = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  saveBusy.value = true
  saveMessage.value = ''
  try {
    const payloads: unknown[] = []
    for (const file of Array.from(input.files)) {
      const parsed = JSON.parse(await file.text())
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { games?: unknown[] }).games)
      ) {
        payloads.push(...(parsed as { games: unknown[] }).games)
      } else {
        payloads.push(parsed)
      }
    }

    for (const [index, payload] of payloads.entries()) {
      const form = new FormData()
      form.append(
        'file',
        new File([JSON.stringify(payload)], `arkham-save-${index + 1}.json`, {
          type: 'application/json',
        }),
      )
      await importGame(form)
    }
    saveMessage.value = t('settingsForm.saveRestoreComplete', { count: payloads.length })
  } catch {
    saveMessage.value = t('settingsForm.saveRestoreFailed')
  } finally {
    input.value = ''
    saveBusy.value = false
  }
}

const refreshRuntimeInfo = async () => {
  try {
    const response = await fetch(`/runtime-info.json?t=${Date.now()}`, { cache: 'no-store' })
    runtimeInfo.value = response.ok ? await response.json() : null
  } catch {
    runtimeInfo.value = null
  }

  try {
    runtimeHealthy.value = (await fetch('/health', { cache: 'no-store' })).ok
  } catch {
    runtimeHealthy.value = false
  }
}

const downloadDiagnostics = async () => {
  await refreshRuntimeInfo()
  downloadJson(
    {
      generatedAt: new Date().toISOString(),
      page: window.location.href,
      userAgent: navigator.userAgent,
      language: language.value,
      runtime: runtimeInfo.value,
      health: runtimeHealthy.value,
      buildReachable: await fetch('/build/', { cache: 'no-store' })
        .then((response) => response.ok)
        .catch(() => false),
    },
    `arkham-diagnostics-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.json`,
  )
}

const releaseChannelsUpdate = async () =>
  props.updateReleaseChannels(beta.value === 'On', devContent.value === 'On')

const updateCardHoverZoom = () => {
  localStorage.setItem(CARD_HOVER_ZOOM_KEY, String(cardHoverZoom.value))
  applyCardHoverZoom(cardHoverZoom.value)
}

const updateCdnBadge = () => {
  localStorage.setItem(CDN_BADGE_KEY, showCdnBadge.value ? '1' : '0')
  window.dispatchEvent(new Event('cdn-badge-toggle'))
}

// Dev-only Epic Multiplayer flag, bound to the persisted store value via On/Off.
const epicMultiplayer = computed({
  get: () => (epicMultiplayerStored.value ? 'On' : 'Off'),
  set: (value: string) => settings.setEpicMultiplayerEnabled(value === 'On'),
})

// Dev-only AI Investigators flag (WIP), bound to the persisted store value.
const aiInvestigators = computed({
  get: () => (aiInvestigatorsStored.value ? 'On' : 'Off'),
  set: (value: string) => settings.setAiInvestigatorsEnabled(value === 'On'),
})

const updateLanguage = async (a: Event) => {
  const target = a.target as HTMLSelectElement
  const selectedLanguage = target.value
  const uiLocale = normalizeLocale(selectedLanguage)

  if (!availableLocales.includes(uiLocale)) {
    const messages = await loadLocaleMessages(uiLocale)
    setLocaleMessage(messages.locale, messages.messages)
  }

  language.value = selectedLanguage
  locale.value = selectedLanguage
  localStorage.setItem('language', selectedLanguage)
  await store.initDbCards()
  await checkImageExists()
}

onMounted(refreshRuntimeInfo)
</script>

<template>
  <div class="page-container">
    <div class="page-content column">
      <h2 class="title">{{ $t('settings') }}</h2>

      <section class="box column">
        <h3>{{ $t('language') }}</h3>
        <p>{{ $t('settingsForm.languageHelp') }}</p>
        <select :value="language" @change="updateLanguage">
          <option value="de">Deutsch/German</option>
          <option value="en">English</option>
          <option value="es">Español/Spanish</option>
          <option value="fr">Français/French</option>
          <option value="it">Italiano/Italian</option>
          <option value="ko">한국어/Korean</option>
          <option value="pl">Polski/Polish</option>
          <option value="po">Português/Portuguese</option>
          <option value="ru">Русский/Russian</option>
          <option value="uk">українська/Ukrainian</option>
          <option value="zh">中文/Chinese</option>
        </select>
      </section>

      <section class="box column">
        <h3>{{ $t('settingsForm.cardHoverZoom') }}</h3>
        <p>{{ $t('settingsForm.cardHoverZoomHelp') }}</p>
        <div class="row settings-options">
          <label v-for="zoom in CARD_HOVER_ZOOM_OPTIONS" :key="zoom" class="radio-label">
            <input
              type="radio"
              name="cardHoverZoom"
              :value="zoom"
              v-model="cardHoverZoom"
              @change="updateCardHoverZoom"
            />
            {{ zoom === 0 ? $t('Off') : `+${zoom}%` }}
          </label>
        </div>
      </section>

      <section class="box column">
        <h3>{{ $t('settingsForm.cdnBadge') }}</h3>
        <p>{{ $t('settingsForm.cdnBadgeHelp') }}</p>
        <label class="radio-label">
          <input type="checkbox" v-model="showCdnBadge" @change="updateCdnBadge" />
          {{ $t('settingsForm.showCdnBadge') }}
        </label>
      </section>

      <section class="box column">
        <h3>{{ $t('settingsForm.accountSecurity') }}</h3>
        <p>{{ $t('settingsForm.accountSecurityHelp') }}</p>
        <div class="self-service-grid">
          <input
            v-model="currentPassword"
            class="self-service-input"
            type="password"
            autocomplete="current-password"
            :placeholder="$t('settingsForm.currentPassword')"
          />
          <input
            v-model="newPassword"
            class="self-service-input"
            type="password"
            minlength="6"
            autocomplete="new-password"
            :placeholder="$t('settingsForm.newPassword')"
          />
          <input
            v-model="confirmPassword"
            class="self-service-input"
            type="password"
            minlength="6"
            autocomplete="new-password"
            :placeholder="$t('settingsForm.confirmPassword')"
          />
          <button
            :disabled="
              passwordBusy || !currentPassword || newPassword.length < 6 || !confirmPassword
            "
            @click="changePassword"
          >
            {{ passwordBusy ? $t('settingsForm.processing') : $t('settingsForm.changePassword') }}
          </button>
        </div>
        <p v-if="passwordMessage" class="status-message">{{ passwordMessage }}</p>
      </section>

      <section class="box column">
        <h3>{{ $t('settingsForm.personalSaves') }}</h3>
        <p>{{ $t('settingsForm.personalSavesHelp') }}</p>
        <div class="row settings-options">
          <button :disabled="saveBusy" @click="backupOwnSaves">
            {{ $t('settingsForm.backupOwnSaves') }}
          </button>
          <label class="file-button" :class="{ disabled: saveBusy }">
            {{ $t('settingsForm.restoreOwnSaves') }}
            <input
              type="file"
              accept="application/json,.json"
              multiple
              :disabled="saveBusy"
              @change="restoreOwnSaves"
            />
          </label>
        </div>
        <p v-if="saveMessage" class="status-message">{{ saveMessage }}</p>
      </section>

      <section class="box column">
        <h3>{{ $t('settingsForm.runtimeStatus') }}</h3>
        <div class="runtime-grid">
          <span>{{ $t('settingsForm.version') }}</span>
          <strong>{{ runtimeInfo?.version || $t('settingsForm.unknown') }}</strong>
          <span>{{ $t('settingsForm.platform') }}</span>
          <strong>{{ runtimeInfo?.platform || $t('settingsForm.unknown') }}</strong>
          <span>{{ $t('settingsForm.serviceStatus') }}</span>
          <strong :class="runtimeHealthy ? 'status-ok' : 'status-error'">
            {{
              runtimeHealthy === null
                ? $t('settingsForm.checking')
                : runtimeHealthy
                  ? $t('settingsForm.running')
                  : $t('settingsForm.unreachable')
            }}
          </strong>
          <span>{{ $t('settingsForm.lanAddress') }}</span>
          <a :href="runtimeInfo?.lanUrl || currentOrigin" target="_blank" rel="noreferrer">
            {{ runtimeInfo?.lanUrl || currentOrigin }}
          </a>
        </div>
        <div class="row settings-options">
          <button @click="refreshRuntimeInfo">{{ $t('settingsForm.refreshStatus') }}</button>
          <button @click="downloadDiagnostics">{{ $t('settingsForm.downloadDiagnostics') }}</button>
        </div>
      </section>

      <section class="box column">
        <h3>{{ $t('settingsForm.enrollInBeta') }}</h3>
        <p>{{ $t('settingsForm.betaWarning') }}</p>
        <div class="row">
          <label class="radio-label">
            <input
              type="radio"
              name="beta"
              value="On"
              v-model="beta"
              @change="releaseChannelsUpdate"
            />
            {{ $t('On') }}
          </label>
          <label class="radio-label">
            <input
              type="radio"
              name="beta"
              value="Off"
              v-model="beta"
              @change="releaseChannelsUpdate"
            />
            {{ $t('Off') }}
          </label>
        </div>
      </section>

      <section class="box column">
        <h3>{{ $t('settingsForm.enrollInDev') }}</h3>
        <p>{{ $t('settingsForm.devWarning') }}</p>
        <div class="row">
          <label class="radio-label">
            <input
              type="radio"
              name="devContent"
              value="On"
              v-model="devContent"
              @change="releaseChannelsUpdate"
            />
            {{ $t('On') }}
          </label>
          <label class="radio-label">
            <input
              type="radio"
              name="devContent"
              value="Off"
              v-model="devContent"
              @change="releaseChannelsUpdate"
            />
            {{ $t('Off') }}
          </label>
        </div>
      </section>

      <section v-if="dev" class="box column">
        <div class="dev-flag">
          <h4>{{ $t('settingsForm.epicMultiplayer') }}</h4>
          <p class="warning">{{ $t('settingsForm.epicMultiplayerWarning') }}</p>
          <div class="row">
            <label class="radio-label">
              <input type="radio" name="epicMultiplayer" value="On" v-model="epicMultiplayer" />
              {{ $t('On') }}
            </label>
            <label class="radio-label">
              <input type="radio" name="epicMultiplayer" value="Off" v-model="epicMultiplayer" />
              {{ $t('Off') }}
            </label>
          </div>
        </div>

        <div class="dev-flag">
          <h4>{{ $t('settingsForm.aiInvestigators') }}</h4>
          <p class="warning">{{ $t('settingsForm.aiInvestigatorsWarning') }}</p>
          <div class="row">
            <label class="radio-label">
              <input type="radio" name="aiInvestigators" value="On" v-model="aiInvestigators" />
              {{ $t('On') }}
            </label>
            <label class="radio-label">
              <input type="radio" name="aiInvestigators" value="Off" v-model="aiInvestigators" />
              {{ $t('Off') }}
            </label>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
h3 {
  font-size: 1.1em;
  font-weight: bold;
  color: var(--title);
  text-transform: uppercase;
  font-family: teutonic, sans-serif;
  font-size: 1.4em;
}

p {
  color: var(--title);
  opacity: 0.8;
}

select {
  background-color: var(--background-dark);
  color: var(--title);
  border: 1px solid var(--box-border);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 1em;
  width: fit-content;
}

input[type='radio'] {
  display: unset;
  accent-color: var(--spooky-green);
}

input[type='checkbox'] {
  accent-color: var(--spooky-green);
}

.settings-options {
  flex-wrap: wrap;
  gap: 12px;
}

.self-service-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  align-items: center;
}

.self-service-input {
  display: block;
  min-width: 0;
  background-color: var(--background-dark);
  color: var(--title);
  border: 1px solid var(--box-border);
  border-radius: 4px;
  padding: 8px 10px;
}

.file-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  padding: 8px 12px;
  background: var(--background-dark);
  border: 1px solid var(--box-border);
  color: var(--title);
  cursor: pointer;
}

.file-button input {
  display: none;
}

.file-button.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.runtime-grid {
  display: grid;
  grid-template-columns: minmax(120px, max-content) minmax(0, 1fr);
  gap: 8px 16px;
  color: var(--title);
}

.runtime-grid a {
  overflow-wrap: anywhere;
}

.status-message,
.status-ok {
  color: var(--spooky-green);
}

.status-error {
  color: var(--delete);
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--title);
  cursor: pointer;
}

.warning {
  color: var(--delete);
  font-weight: bold;
}

.dev-flag {
  margin: 8px 0 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--box-border);
}

.dev-flag h4 {
  margin: 0 0 4px;
  color: var(--title);
  font-family: teutonic, sans-serif;
  font-size: 1.2em;
  text-transform: uppercase;
}
</style>
