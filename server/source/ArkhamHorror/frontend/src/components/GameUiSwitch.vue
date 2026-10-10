<script setup lang="ts">
import { computed } from 'vue'
import { ArrowsRightLeftIcon } from '@heroicons/vue/24/outline'
const props = defineProps<{ classic?: boolean; locale: string; compact?: boolean }>()
const label = computed(() => props.locale.startsWith('zh')
  ? props.classic ? '切换新版 UI' : '切换传统 UI'
  : props.classic ? 'Switch to current UI' : 'Switch to classic UI')
function change() {
  const switchUi = (window as unknown as { arkhamSwitchUi?: (mode: string) => void }).arkhamSwitchUi
  switchUi?.(props.classic ? 'current' : 'legacy')
}
</script>

<template>
  <button type="button" class="ui-mode-switch" :title="label" :aria-label="label" @click="change">
    <ArrowsRightLeftIcon aria-hidden="true" />
    <span v-if="!compact">{{ locale.startsWith('zh') ? classic ? '新版 UI' : '传统 UI' : classic ? 'Current UI' : 'Classic UI' }}</span>
  </button>
</template>

<style scoped>
.ui-mode-switch { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex-shrink: 0; white-space: nowrap; box-sizing: border-box; padding: 4px 6px; min-height: 28px; line-height: 18px; font-size: 12px; color: inherit; background: transparent; border: 1px solid currentColor; border-radius: 3px; cursor: pointer; }
.ui-mode-switch svg { width: 16px; height: 16px; flex-shrink: 0; }
.ui-mode-switch:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
</style>
