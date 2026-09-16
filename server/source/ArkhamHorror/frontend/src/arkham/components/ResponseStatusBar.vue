<script lang="ts" setup>
import { computed } from 'vue'
import type { Game } from '@/arkham/types/Game'
import type { Investigator } from '@/arkham/types/Investigator'
import { useDbCardStore } from '@/stores/dbCards'
import { useI18n } from 'vue-i18n'
import { pendingGameTasks, type TaskKind } from '@/arkham/gameTaskStatus'
import { investigatorStatusBackground } from '@/arkham/investigatorStatusColor'

const props = defineProps<{ game: Game; playerId?: string; processing?: boolean }>()
const store = useDbCardStore()
const { locale } = useI18n()
const zh = computed(() => locale.value.toLowerCase().startsWith('zh'))
const words = computed(() => zh.value ? {
  turn: '回合', view: '视角', waiting: '等待', settling: '正在处理…', idle: '等待游戏状态更新', locate: '查看相关人物',
  response: '处理响应', action: '选择行动', location: '选择地点', card: '选择卡牌', payment: '选择数量或支付', read: '阅读并继续', choice: '作出选择',
} : {
  turn: 'Turn', view: 'Viewing', waiting: 'Waiting for', settling: 'Processing…', idle: 'Waiting for game update', locate: 'View investigator',
  response: 'respond', action: 'choose an action', location: 'choose a location', card: 'choose a card', payment: 'choose amounts or payment', read: 'read and continue', choice: 'make a choice',
})
function name(i?: Investigator) { return i ? (zh.value ? store.getCardName(i.name.title, 'investigator') : i.name.title) : '—' }
const turnInvestigator = computed(() => props.game.investigators[props.game.activeInvestigatorId])
const turnName = computed(() => name(turnInvestigator.value))
const perspectiveInvestigators = computed(() => Object.values(props.game.investigators).filter(i => i.playerId === props.playerId && !i.eliminated))
const perspective = computed(() => perspectiveInvestigators.value.map(name).join(' / ') || '—')
const tasks = computed(() => pendingGameTasks(props.game))
function description(task: { investigators: Investigator[]; kind: TaskKind }) {
  return `${words.value.waiting} ${task.investigators.map(name).join(' / ') || (zh.value ? '玩家' : 'player')} · ${words.value[task.kind]}`
}
function locate(playerId: string) {
  document.dispatchEvent(new CustomEvent('arkham:locate-player', { detail: { gameId: props.game.id, playerId } }))
}
</script>

<template>
  <section v-if="playerId" class="response-status" :aria-label="zh ? '当前游戏状态' : 'Current game status'">
    <span class="response-status__context" :title="`${words.turn}: ${turnName} · ${words.view}: ${perspective}`">
      <span class="response-status__badge" :style="{ background: investigatorStatusBackground(turnInvestigator ? [turnInvestigator] : []) }">{{ words.turn }}：{{ turnName }}</span>
      <span class="response-status__badge response-status__view" :style="{ background: investigatorStatusBackground(perspectiveInvestigators) }">{{ words.view }}：{{ perspective }}</span>
    </span>
    <span v-if="processing" class="response-status__message" role="status">{{ words.settling }}</span>
    <div v-else class="response-status__tasks" aria-live="polite">
      <button v-for="task in tasks" :key="task.playerId" type="button" class="response-status__task"
        :style="{ background: investigatorStatusBackground(task.investigators) }"
        :disabled="!task.investigators.length" :title="`${description(task)} · ${words.locate}`" @click="locate(task.playerId)">
        {{ description(task) }} <span aria-hidden="true">↗</span>
      </button>
      <span v-if="!tasks.length" class="response-status__message">{{ words.idle }}</span>
    </div>
  </section>
  <!-- Phone keeps its compact existing name strip, without decorative status glow. -->
  <section v-else class="response-status response-status--compact" :aria-label="zh ? '调查员' : 'Investigators'">
    <span v-for="id in game.playerOrder.filter(id => game.investigators[id] && !game.investigators[id].eliminated)" :key="id" class="response-status__item">
      {{ id === game.activeInvestigatorId ? '▸ ' : '' }}{{ name(game.investigators[id]) }}
    </span>
  </section>
</template>

<style scoped>
.response-status { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: min(58vw, 940px); padding: 1px 4px; font-size: 11px; line-height: 16px; color: var(--text); }
.response-status__context { display: flex; gap: 3px; flex: 0 1 auto; min-width: 0; max-width: 290px; white-space: nowrap; }
.response-status__badge { display: block; min-width: 0; padding: 2px 5px; border-radius: 4px; color: #fff7e5; overflow: hidden; text-overflow: ellipsis; }
.response-status__tasks { display: flex; min-width: 0; gap: 4px; overflow-x: auto; scrollbar-width: thin; }
.response-status__task { flex: 0 0 auto; max-width: 310px; box-sizing: border-box; min-height: 0; height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 2px 5px; border: 1px solid #9b8c64; border-radius: 4px; background: #18372b; color: #fff7e5; font: inherit; line-height: 16px; cursor: pointer; }
.response-status__task:hover { border-color: #fff0ba; }
.response-status__task:focus-visible { outline: 2px solid #ff784f; outline-offset: 1px; }
.response-status__message { white-space: nowrap; }
.response-status--compact { max-width: 46vw; overflow-x: auto; scrollbar-width: none; }
.response-status__item { flex: 0 0 auto; max-width: 150px; padding: 3px 8px; overflow: hidden; border: 1px solid #78837555; border-radius: 4px; color: var(--text); font-size: 12px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 1100px) { .response-status { max-width: 52vw; } .response-status__context { max-width: 180px; } }
</style>
