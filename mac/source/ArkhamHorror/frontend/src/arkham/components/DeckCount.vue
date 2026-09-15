<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ count?: number }>()
const label = computed(() => props.count === undefined ? '' : String(props.count))
const digits = computed(() => label.value.length)
</script>

<template>
  <span class="deck-size" :class="{ 'deck-size--large': digits > 3 }"
    :style="{ '--deck-count-digits': digits }" :title="label">{{ label }}</span>
</template>

<style scoped>
/* Preserve each deck component's existing badge position and normal-count
   appearance. Long numbers use the full card width, not a clipped circle. */
.deck-size.deck-size--large {
  box-sizing: border-box;
  width: max-content;
  max-width: calc(var(--card-width, 100px) - 2px);
  height: auto;
  aspect-ratio: auto;
  padding: 2px;
  border-radius: 3px;
  background: #0a211cef;
  color: #efe6c8;
  font-family: system-ui, sans-serif;
  font-weight: 700;
  font-size: min(1em, calc((var(--card-width, 100px) - 6px) / (var(--deck-count-digits) * .62)));
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: center;
}
</style>
