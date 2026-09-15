<script setup lang="ts">
import { computed } from 'vue'
import { visibleActionCount } from '@/arkham/tabletopLayout'
const props = defineProps<{ count: number }>()
const display = computed(() => visibleActionCount(props.count))
</script>

<template>
  <span class="action-count" :title="String(display.count)" :aria-label="`${display.count}`">
    <i v-for="n in display.icons" :key="n" class="action" aria-hidden="true"></i>
    <span v-if="display.collapsed" class="action-count-number">×{{ display.count }}</span>
  </span>
</template>

<style scoped>
.action-count { display: inline-flex; align-items: center; gap: 2px; flex: 0 0 auto; color: inherit; }
.action-count-number { font: 600 .95em/1.2 system-ui, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
.action { font-family: 'Arkham'; font-style: normal; line-height: 1; }
.action::before { content: '\0049'; }
</style>
