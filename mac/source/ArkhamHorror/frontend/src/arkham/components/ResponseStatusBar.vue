<script lang="ts" setup>
import { computed } from 'vue'
import type { Game } from '@/arkham/types/Game'
import * as ArkhamGame from '@/arkham/types/Game'
import { MessageType } from '@/arkham/types/Message'
import type { Investigator } from '@/arkham/types/Investigator'
import { useDbCardStore } from '@/stores/dbCards'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ game: Game }>()
const store = useDbCardStore()
const { t } = useI18n()

type InvestigatorStatus = {
  investigator: Investigator
  state: 'active' | 'waiting' | 'idle'
}

function waitingInvestigatorIds(game: Game): Set<string> {
  const waiting = new Set<string>()

  for (const playerId of Object.keys(game.question)) {
    if (!ArkhamGame.activeQuestionIsPlayerWindow(game, playerId)) continue

    const abilityOwners = ArkhamGame.choices(game, playerId)
      .filter((choice) => choice.tag === MessageType.ABILITY_LABEL)
      .map((choice) => choice.investigatorId)

    if (abilityOwners.length > 0) {
      abilityOwners.forEach((investigatorId) => waiting.add(investigatorId))
      continue
    }

    // Fast cards do not carry an investigator id in their choice label. In that
    // case the pending decision belongs to the whole player seat.
    Object.values(game.investigators)
      .filter((investigator) => investigator.playerId === playerId)
      .forEach((investigator) => waiting.add(investigator.id))
  }

  return waiting
}

const statuses = computed<InvestigatorStatus[]>(() => {
  const waiting = waitingInvestigatorIds(props.game)
  return props.game.playerOrder
    .map((investigatorId) => props.game.investigators[investigatorId])
    .filter((investigator): investigator is Investigator => !!investigator && !investigator.eliminated)
    .map((investigator) => ({
      investigator,
      state: investigator.id === props.game.activeInvestigatorId
        ? 'active'
        : waiting.has(investigator.id) ? 'waiting' : 'idle',
    }))
})

function investigatorName(investigator: Investigator): string {
  const language = localStorage.getItem('language') || 'en'
  return language === 'en'
    ? investigator.name.title
    : store.getCardName(investigator.name.title, 'investigator')
}

function statusTitle(status: InvestigatorStatus): string {
  const name = investigatorName(status.investigator)
  return `${name}: ${t(`investigator.responseStatus.${status.state}`)}`
}
</script>

<template>
  <section class="response-status" :aria-label="$t('investigator.responseStatus.label')">
    <span
      v-for="status in statuses"
      :key="status.investigator.id"
      class="response-status__item"
      :class="`response-status__item--${status.state}`"
      :title="statusTitle(status)"
    >
      {{ investigatorName(status.investigator) }}
    </span>
  </section>
</template>

<style scoped>
.response-status {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: min(42vw, 620px);
  padding: 2px 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.response-status::-webkit-scrollbar {
  display: none;
}

.response-status__item {
  flex: 0 0 auto;
  max-width: 150px;
  padding: 3px 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.response-status__item--active {
  border-color: rgba(111, 205, 133, 0.78);
  background: rgba(42, 128, 65, 0.86);
  color: #fff;
}

.response-status__item--waiting {
  border-color: rgba(200, 111, 232, 0.82);
  background: rgba(116, 45, 145, 0.9);
  color: #fff;
}

.response-status__item--idle {
  background: rgba(0, 0, 0, 0.28);
}

@media (max-width: 760px) {
  .response-status {
    max-width: 46vw;
  }

  .response-status__item {
    max-width: 96px;
    padding-inline: 6px;
  }
}
</style>
