<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDebug } from '@/arkham/debug'
import { handTriggerModeIndexes } from '@/arkham/abilityTriggerModeEligibility'
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
}>()

const { t } = useI18n()
const debug = useDebug()
const saving = ref(false)

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
  const current = props.abilities
    .map((entry) => entry.contents)
    .filter((entry) => entry.tag === MessageType.ABILITY_LABEL)
    .filter((entry) =>
      entry.investigatorId === investigator.value?.id
      && entry.ability.cardCode === props.cardCode
      && isOptionalTrigger(entry.ability.type)
    )
    .map((entry) => entry.ability.index)

  const saved = Object.keys(savedModes.value).map(Number)
  if (props.currentAbilitiesOnly) {
    return handTriggerModeIndexes(saved, current, props.includePlayMode ?? false)
  }

  const playMode = props.includePlayMode ? [-1] : []
  return [...new Set([...saved, ...playMode, ...current])]
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
    <button
      v-for="index in abilityIndexes"
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
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
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
</style>
