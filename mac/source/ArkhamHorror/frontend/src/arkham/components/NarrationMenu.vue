<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ChevronDownIcon,
  PauseIcon,
  PlayIcon,
  SpeakerWaveIcon,
  StopIcon,
} from '@heroicons/vue/20/solid'
import { useI18n } from 'vue-i18n'
import { type NarrationCategory, useNarration } from '@/arkham/narration'
import {
  cardNarrationCsvState,
  loadCardNarrationCsv,
  reloadCardNarrationCsv,
} from '@/arkham/narrationCsv'

const { t } = useI18n()
const narration = useNarration()

const groups: { title: string; categories: NarrationCategory[] }[] = [
  {
    title: 'content',
    categories: ['story', 'interlude', 'resolution', 'codex', 'campaignLog'],
  },
  {
    title: 'scenarioCards',
    categories: ['actAgenda', 'locationEnemy', 'encounter', 'playerCard'],
  },
  {
    title: 'cardFields',
    categories: ['cardName', 'cardSubname', 'cardTraits', 'cardText', 'cardFlavor'],
  },
]

const currentAvailable = computed(() => !!narration.current.value)
const label = (category: NarrationCategory) => t(`gameBar.narration.categories.${category}`)

const menuOpen = ref(false)
const buttonRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

function updatePanelPosition() {
  if (!buttonRef.value) return

  const rect = buttonRef.value.getBoundingClientRect()
  const panelWidth = Math.min(420, window.innerWidth - 16)
  const panelLeft = Math.min(
    Math.max(8, rect.right - panelWidth),
    window.innerWidth - panelWidth - 8,
  )
  const panelTop = Math.max(8, rect.bottom + 2)

  panelStyle.value = {
    top: `${panelTop}px`,
    left: `${panelLeft}px`,
    width: `${panelWidth}px`,
    maxHeight: `${Math.max(180, window.innerHeight - panelTop - 8)}px`,
  }
}

async function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) {
    await nextTick()
    updatePanelPosition()
  }
}

function closeMenu() {
  menuOpen.value = false
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu()
}

function handleViewportChange() {
  if (menuOpen.value) updatePanelPosition()
}

onMounted(() => {
  void loadCardNarrationCsv()
  document.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<template>
  <div v-if="narration.supported" class="narration-menu">
    <button
      ref="buttonRef"
      type="button"
      class="narration-button"
      :class="{ active: narration.speaking.value, open: menuOpen }"
      :title="t('gameBar.narration.title')"
      :aria-expanded="menuOpen"
      aria-controls="narration-panel"
      @click="toggleMenu"
    >
      <SpeakerWaveIcon aria-hidden="true" />
      {{ t('gameBar.narration.title') }}
      <ChevronDownIcon class="chevron" aria-hidden="true" />
    </button>
    <Teleport to="body">
      <div
        v-if="menuOpen"
        id="narration-panel"
        ref="panelRef"
        class="narration-panel"
        :style="panelStyle"
        role="dialog"
        :aria-label="t('gameBar.narration.title')"
      >
          <label class="master-toggle">
            <input v-model="narration.preferences.autoRead" type="checkbox" />
            <span>{{ t('gameBar.narration.autoRead') }}</span>
          </label>

          <div class="transport">
            <button type="button" :disabled="!currentAvailable" @click="narration.read()">
              <PlayIcon aria-hidden="true" />
              {{ t('gameBar.narration.readCurrent') }}
            </button>
            <button
              type="button"
              :disabled="!narration.speaking.value"
              @click="narration.pauseOrResume()"
            >
              <PauseIcon aria-hidden="true" />
              {{
                narration.paused.value ? t('gameBar.narration.resume') : t('gameBar.narration.pause')
              }}
            </button>
            <button type="button" :disabled="!narration.speaking.value" @click="narration.stop()">
              <StopIcon aria-hidden="true" />
              {{ t('gameBar.narration.stop') }}
            </button>
          </div>

          <fieldset v-for="group in groups" :key="group.title">
            <legend>{{ t(`gameBar.narration.groups.${group.title}`) }}</legend>
            <label v-for="category in group.categories" :key="category">
              <input v-model="narration.preferences.enabled[category]" type="checkbox" />
              <span>{{ label(category) }}</span>
            </label>
          </fieldset>

          <div class="settings">
            <div class="csv-source" :class="{ error: cardNarrationCsvState.error }">
              <span>
                {{
                  cardNarrationCsvState.loading
                    ? t('gameBar.narration.csvLoading')
                    : cardNarrationCsvState.error
                      ? t('gameBar.narration.csvError')
                      : t('gameBar.narration.csvLoaded', { count: cardNarrationCsvState.rows })
                }}
              </span>
              <button type="button" @click="reloadCardNarrationCsv">
                {{ t('gameBar.narration.csvReload') }}
              </button>
            </div>
            <label>
              <span>{{ t('gameBar.narration.voice') }}</span>
              <select v-model="narration.preferences.voiceURI">
                <option value="">{{ t('gameBar.narration.systemVoice') }}</option>
                <option
                  v-for="voice in narration.voices.value"
                  :key="voice.voiceURI"
                  :value="voice.voiceURI"
                >
                  {{ voice.name }} ({{ voice.lang }})
                </option>
              </select>
            </label>
            <label>
              <span>{{ t('gameBar.narration.rate') }}</span>
              <input
                v-model.number="narration.preferences.rate"
                type="range"
                min="0.6"
                max="1.6"
                step="0.1"
              />
            </label>
            <label>
              <span>{{ t('gameBar.narration.volume') }}</span>
              <input
                v-model.number="narration.preferences.volume"
                type="range"
                min="0"
                max="1"
                step="0.1"
              />
            </label>
          </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.narration-menu {
  position: relative;
  display: inline-flex;
  align-self: stretch;
  height: 100%;
}

.narration-button.active {
  color: var(--accent);
}

.narration-button.open {
  background: rgb(0 0 0 / 40%);
}

.narration-button {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 100%;
  padding: 5px 10px;
  color: inherit;
  background: none;
  border: 0;
}

.narration-button:hover {
  background: rgb(0 0 0 / 40%);
}

.narration-button svg {
  width: 15px;
}

.narration-button .chevron {
  width: 14px;
  transition: transform 0.2s ease-in-out;
}

.narration-button.open .chevron {
  transform: rotate(180deg);
}

.narration-panel {
  position: fixed;
  z-index: var(--z-index-100000, 100000);
  display: block;
  height: auto;
  overflow-y: auto;
  padding: 12px;
  color: var(--text);
  background: var(--background-mid);
  border: 1px solid var(--box-border);
  box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
}

.master-toggle,
fieldset label,
.settings label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.master-toggle {
  padding-bottom: 10px;
  font-weight: 700;
  border-bottom: 1px solid var(--box-border);
}

.transport {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 10px 0;
}

.transport button {
  display: flex;
  align-items: center;
  gap: 5px;
  justify-content: center;
  min-height: 34px;
  padding: 5px 8px;
  background: var(--background-dark);
  border: 1px solid var(--box-border);
}

.transport svg {
  width: 15px;
}

.transport button:disabled {
  opacity: 0.45;
}

fieldset {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 12px;
  margin: 10px 0 0;
  padding: 9px 0 0;
  border: 0;
  border-top: 1px solid var(--box-border);
}

legend {
  padding-right: 8px;
  color: var(--title);
  font-weight: 700;
}

.settings {
  display: grid;
  gap: 9px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--box-border);
}

.settings label > span {
  width: 72px;
  flex: 0 0 auto;
}

.settings select,
.settings input[type='range'] {
  min-width: 0;
  flex: 1;
}

.csv-source {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text);
  font-size: 12px;
}

.csv-source.error {
  color: var(--danger);
}

.csv-source button {
  flex: 0 0 auto;
  padding: 4px 8px;
  background: var(--background-dark);
  border: 1px solid var(--box-border);
}

</style>
