<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDebug } from '@/arkham/debug'
import { Dropdown } from 'floating-vue'
import { AdjustmentsHorizontalIcon } from '@heroicons/vue/20/solid'
import { handTriggerModeIndexes, normalizeCardCode } from '@/arkham/abilityTriggerModeEligibility'
import type { AbilityType } from '@/arkham/types/Ability'
import type { Game } from '@/arkham/types/Game'
import type { AbilityTriggerMode } from '@/arkham/types/Investigator'
import { MessageType, type AbilityMessage } from '@/arkham/types/Message'

const props = defineProps<{
  game: Game
  playerId: string
  investigatorId: string
  cardCode: string
  abilities: AbilityMessage[]
  includePlayMode?: boolean
  currentAbilitiesOnly?: boolean
  exhausted?: boolean
  knownAbilityIndexes?: readonly number[]
}>()

const { t, locale } = useI18n()
const debug = useDebug()
const saving = ref(false)
const shown = ref(false)
const settingsLabel = computed(() => locale.value.startsWith('zh') ? '能力触发设置' : 'Ability trigger settings')

const investigator = computed(() => {
  const entry = props.game.investigators[props.investigatorId]
  return entry?.playerId === props.playerId ? entry : undefined
})

const savedModes = computed<Record<string, AbilityTriggerMode>>(() =>
  investigator.value?.settings.perCardSettings[props.cardCode]?.cardAbilityModes ?? {}
)

function isOptionalTrigger(type: AbilityType): boolean {
  switch (type.tag) {
    case 'FastAbility':
    case 'ReactionAbility':
    case 'ConstantReaction':
      return true
    case 'Objective':
    case 'DelayedAbility':
      return isOptionalTrigger(type.abilityType)
    default:
      return false
  }
}

const abilityIndexes = computed(() => {
  if (!investigator.value) return []
  const current = props.abilities
    .map((entry) => entry.contents)
    .filter((entry) => entry.tag === MessageType.ABILITY_LABEL)
    .filter((entry) =>
      entry.investigatorId === investigator.value?.id
      && normalizeCardCode(entry.ability.cardCode) === normalizeCardCode(props.cardCode)
      && isOptionalTrigger(entry.ability.type)
    )
    .map((entry) => entry.ability.index)

  const saved = Object.keys(savedModes.value).map(Number)
  if (props.currentAbilitiesOnly) {
    return handTriggerModeIndexes(saved, current, props.includePlayMode ?? false)
  }

  const playMode = props.includePlayMode ? [-1] : []
  // Settings must remain reachable before an optional window is offered.
  // These indices come from verified ability definitions, never guessed icons.
  return [...new Set([...saved, ...playMode, ...current, ...(props.knownAbilityIndexes ?? [])])]
    .filter(Number.isInteger)
    .sort((left, right) => left - right)
})

const modeOrder: AbilityTriggerMode[] = [
  'AbilityOwnerOnly',
  'AbilityAlwaysAsk',
  'AbilityAutoSkip',
]

const currentMode = (index: number): AbilityTriggerMode =>
  savedModes.value[String(index)] ?? 'AbilityAlwaysAsk'

const modeClass = (index: number) =>
  currentMode(index).replace('Ability', '').replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)

const modeLabel = (index: number) =>
  t(`investigator.abilityTriggerMode.${currentMode(index)}.short`)

const modeTooltip = (index: number) =>
  t(
    `investigator.abilityTriggerMode.${currentMode(index)}.${index === -1 ? 'playDescription' : 'description'}`,
    { index },
  )

async function cycleMode(index: number) {
  if (!investigator.value || saving.value) return

  const mode = currentMode(index)
  const nextMode = modeOrder[(modeOrder.indexOf(mode) + 1) % modeOrder.length]
  const nextModes = { ...savedModes.value, [String(index)]: nextMode }

  saving.value = true
  try {
    await debug.send(props.game.id, {
      tag: 'UpdateCardSetting',
      contents: [
        investigator.value.id,
        props.cardCode,
        {
          tag: 'CardAbilityModes',
          value: nextModes,
        },
      ],
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="abilityIndexes.length > 0"
    class="ability-trigger-modes"
    :class="{ exhausted: props.exhausted }"
  >
    <Dropdown v-if="abilityIndexes.length > 1" v-model:shown="shown" :triggers="[]" :auto-hide="true" placement="top" container="body">
      <button type="button" class="ability-trigger-mode -always-ask" :aria-label="settingsLabel" :aria-expanded="shown" v-tooltip="settingsLabel" @click.stop.prevent="shown = !shown"><AdjustmentsHorizontalIcon /></button>
      <template #popper>
        <div class="trigger-settings">
          <strong>{{ settingsLabel }}</strong>
          <button v-for="index in abilityIndexes" :key="index" type="button" :disabled="saving" :aria-label="modeTooltip(index)" @click.stop.prevent="cycleMode(index)">
            <span>{{ index === -1 ? (locale.startsWith('zh') ? '打出' : 'Play') : index }}</span>
            <span>{{ modeLabel(index) }}</span>
            <span>{{ modeTooltip(index) }}</span>
          </button>
        </div>
      </template>
    </Dropdown>
    <button
      v-for="index in abilityIndexes.length === 1 ? abilityIndexes : []"
      :key="index"
      type="button"
      class="ability-trigger-mode"
      :class="modeClass(index)"
      :disabled="saving"
      :aria-label="modeTooltip(index)"
      v-tooltip="modeTooltip(index)"
      @click.stop.prevent="cycleMode(index)"
    >{{ modeLabel(index) }}</button>
  </div>
</template>

<style scoped>
.ability-trigger-modes {
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 12;
  display: flex;
  gap: 2px;
}

.ability-trigger-modes.exhausted {
  top: calc((var(--card-height) - var(--card-width)) / 2 + 3px);
  right: calc((var(--card-width) - var(--card-height)) / 2 + 3px);
}

.ability-trigger-mode {
  /* Keep settings legible when the equipment row fits small cards. Absolute
     controls do not change card height or start a resize/scale feedback loop. */
  width: calc(24px / var(--equipment-control-scale, 1));
  height: calc(24px / var(--equipment-control-scale, 1));
  flex-shrink: 0;
  padding: 0;
  border: calc(2px / var(--equipment-control-scale, 1)) solid rgba(255, 255, 255, 0.9);
  border-radius: calc(5px / var(--equipment-control-scale, 1));
  color: #fff;
  font-size: calc(14px / var(--equipment-control-scale, 1));
  font-weight: 700;
  line-height: 1;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
  cursor: pointer;
}

.ability-trigger-mode:hover,
.ability-trigger-mode:focus-visible {
  filter: brightness(1.25);
  outline: 2px solid #fff;
  outline-offset: 1px;
}

.ability-trigger-mode.-owner-only {
  background: #287d46;
}

.ability-trigger-mode.-always-ask {
  background: #7b3fa0;
}

.ability-trigger-mode.-auto-skip {
  background: #6f2529;
}
.ability-trigger-mode svg { display: block; width: 100%; height: 100%; padding: 2px; }
.trigger-settings { display: grid; gap: 8px; max-width: min(360px, calc(100vw - 36px)); color: #eee8d8; background: #203b32; padding: 12px; }
.trigger-settings button { display: grid; grid-template-columns: 22px 30px minmax(0, 1fr); align-items: center; gap: 8px; min-height: 36px; padding: 6px; color: inherit; background: #344d43; border: 1px solid #8c988c; text-align: left; }
</style>
