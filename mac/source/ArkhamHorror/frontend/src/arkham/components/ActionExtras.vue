<script setup lang="ts">
defineProps<{ count: number }>()
</script>
<template>
  <component :is="count > 6 ? 'details' : 'span'" class="action-extras">
    <summary v-if="count > 6" :title="`${count}`">+{{count}} <span aria-hidden="true">▾</span></summary>
    <span class="action-extras-options"><slot /></span>
  </component>
</template>
<style scoped>
.action-extras { position: relative; display: inline-flex; align-items: center; }
.action-extras-options { display: inline-flex; align-items: center; gap: 2px; }
summary { color: #e1cea0; cursor: pointer; list-style: none; padding: 1px 4px; font: 600 13px/20px system-ui, sans-serif; border: 1px solid #827448; border-radius: 3px; background: #132a21; white-space: nowrap; }
details:not([open]) .action-extras-options { display: none; }
details[open] .action-extras-options { display: flex; flex-wrap: wrap; position: absolute; top: 100%; right: 0; z-index: 150; width: 190px; max-height: 180px; overflow: auto; padding: 8px; border: 1px solid #a28c55; background: #132a21; gap: 6px; box-shadow: 0 4px 12px #0009; }
</style>
