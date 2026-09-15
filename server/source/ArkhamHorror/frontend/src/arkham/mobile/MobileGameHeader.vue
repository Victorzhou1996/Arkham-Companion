<script setup lang="ts">
import { computed, inject } from 'vue'
import { tabletopUndoKey } from '@/arkham/tabletopControls'
import type { Game } from '@/arkham/types/Game'
import { useMobileBoard } from './context'
import ResponseStatusBar from '@/arkham/components/ResponseStatusBar.vue'
const props = defineProps<{ game: Game }>()
defineEmits<{ log: []; export: [] }>()
const board = useMobileBoard()!
const undo = inject(tabletopUndoKey, null)
const phase = computed(() => ({ MythosPhase: '神话阶段', InvestigationPhase: '调查阶段', EnemyPhase: '敌军阶段', UpkeepPhase: '补给阶段', CampaignPhase: '战役' }[props.game.phase] ?? '进行中'))
</script>
<template>
  <div class="mobile-chrome">
  <header class="mobile-game-header">
    <a href="#/" class="mobile-home" aria-label="返回首页">⌂</a>
    <div class="mobile-game-title"><strong>ARKHAM HORROR</strong><span>{{ phase }} <i>·</i> 毁灭 {{ game.totalDoom }} <i>·</i> 线索 {{ game.totalClues }}</span></div>
    <button v-if="undo?.enabled.value" class="mobile-undo" type="button" aria-label="撤回一步" :disabled="undo.locked.value" @click="undo.run()"><span aria-hidden="true">↶</span><small>{{ undo.locked.value ? '撤回中' : '撤回' }}</small></button>
    <button type="button" aria-label="查看游戏日志" @click="$emit('log')">日志</button>
    <button type="button" :aria-expanded="board.tools.value" @click="board.tools.value = !board.tools.value">{{ board.tools.value ? '收起' : '工具' }}</button>
  </header>
  <ResponseStatusBar :game="game" class="mobile-response-status" />
  </div>
</template>
