<script setup lang="ts">
import { useMobileBoard, type MobileZone } from './context'
import { computed } from 'vue'
import { emptyActionZones } from './actionHints'
const props = defineProps<{ hand: number; threats: number; owner: string }>()
const board = useMobileBoard()!
const available = computed(() => board.actions.value.players[props.owner] ?? emptyActionZones())
const zones: { id: MobileZone; icon: string; label: string }[] = [
  { id: 'hand', icon: '▱', label: '手牌' }, { id: 'threats', icon: '◇', label: '威胁' },
  { id: 'equipment', icon: '♜', label: '装备' }, { id: 'investigator', icon: '♟', label: '人物 / 牌库' },
]
</script>
<template>
  <nav class="mobile-player-nav" aria-label="玩家卡牌区域">
    <button v-for="zone in zones" :key="zone.id" type="button" :aria-pressed="board.zone.value === zone.id"
      :class="{ 'mobile-zone-action': available[zone.id] }" :title="available[zone.id] ? `${zone.label}：有可用操作` : zone.label"
      :aria-description="available[zone.id] ? '有可用操作' : undefined"
      @click="board.zone.value = zone.id"><span aria-hidden="true">{{ zone.icon }}</span>{{ zone.label }}<b v-if="zone.id === 'hand'">{{ hand }}</b><b v-if="zone.id === 'threats' && threats">{{ threats }}</b></button>
  </nav>
</template>
