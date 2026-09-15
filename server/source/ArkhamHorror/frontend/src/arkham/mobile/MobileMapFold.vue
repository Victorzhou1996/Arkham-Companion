<script setup lang="ts">
import { computed } from 'vue'
import { useMobileBoard } from './context'
const props = defineProps<{ edge: 'top' | 'bottom' }>()
const board = useMobileBoard()!
const collapsed = computed(() => props.edge === 'top' ? board.topCollapsed.value : board.bottomCollapsed.value)
const hasActions = computed(() => collapsed.value && board.actions.value[props.edge])
const label = computed(() => `${collapsed.value ? '展开' : '收起'}${props.edge === 'top' ? '顶部' : '底部'}界面`)
const pointsUp = computed(() => (props.edge === 'top') !== collapsed.value)
function toggle() {
  board.preview.value?.close()
  board.tools.value = false
  if (props.edge === 'top') board.topCollapsed.value = !board.topCollapsed.value
  else board.bottomCollapsed.value = !board.bottomCollapsed.value
}
</script>
<template>
  <div class="mobile-map-fold-row" :class="`mobile-map-fold-row--${edge}`">
    <button type="button" class="mobile-map-fold" :class="{ 'mobile-zone-action': hasActions }" :aria-label="label" :aria-description="hasActions ? '隐藏区域内有可用操作' : undefined" :aria-expanded="!collapsed" :title="label" @pointerdown.stop @click.stop="toggle" @dblclick.stop>
      <span class="mobile-fold-triangle" :class="{ 'mobile-fold-triangle--up': pointsUp }" aria-hidden="true" />
    </button>
  </div>
</template>
