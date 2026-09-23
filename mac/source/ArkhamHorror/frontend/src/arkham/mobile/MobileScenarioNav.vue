<script setup lang="ts">
import { useMobileBoard } from './context'
const board = useMobileBoard()!
const zones = [{id:'scene',label:'场景'}, {id:'encounter',label:'遭遇'}, {id:'reference',label:'冒险'}, {id:'other',label:'其他'}] as const
</script>
<template>
  <nav class="mobile-scenario-nav" aria-label="场景卡牌分类">
    <button v-for="zone in zones" :key="zone.id" type="button"
      :aria-pressed="board.scenarioZone.value === zone.id"
      :aria-description="board.scenarioActions.value[zone.id] ? '有可用操作' : undefined"
      :class="{ 'mobile-zone-action': board.scenarioActions.value[zone.id] }"
      @click="board.scenarioZone.value = zone.id">{{ zone.label }}</button>
  </nav>
</template>
