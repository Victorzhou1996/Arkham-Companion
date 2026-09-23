<script setup lang="ts">
import type { Investigator } from '@/arkham/types/Investigator'
import type { Message } from '@/arkham/types/Message'
import { computed, inject, type Ref } from 'vue'
import { playerDeckChoice } from '@/arkham/playerDeckChoice'
const props = defineProps<{ investigator: Investigator; choices: readonly Message[]; playerId: string }>()
defineEmits<{ choose: [index: number] }>()
const draw = computed(() => playerDeckChoice(props.choices, props.playerId, props.investigator.playerId))
const solo = inject<Ref<boolean>>('solo')
</script>
<template>
  <div class="mobile-player-status" aria-label="人物状态">
    <small v-if="investigator.playerId !== playerId" class="mobile-perspective-note">{{ solo ? '仅查看 · 点眼睛切换操作视角' : '正在查看其他调查员' }}</small>
    <span><i>行动</i><b>{{ investigator.remainingActions }}</b></span>
    <span><i>资源</i><b>{{ investigator.tokens.Resource ?? 0 }}</b></span>
    <span><i>线索</i><b>{{ investigator.tokens.Clue ?? 0 }}</b></span>
    <span class="mobile-health"><i>伤害</i><b>{{ investigator.tokens.Damage ?? 0 }}</b></span>
    <span class="mobile-horror"><i>恐惧</i><b>{{ investigator.tokens.Horror ?? 0 }}</b></span>
    <button type="button" :disabled="draw === -1" :data-game-actionable="draw !== -1 || undefined" @click="$emit('choose', draw)">抽牌</button>
  </div>
</template>
