<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useMutationObserver, useResizeObserver } from '@vueuse/core'
import { scenarioFitScale } from '@/arkham/tabletopLayout'

const props = defineProps<{ enabled: boolean }>()
const content = ref<HTMLElement | null>(null)
const host = computed(() => content.value?.parentElement ?? null)
const scale = ref(1)
let frame = 0
function measure() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (!props.enabled || !content.value || !host.value) { scale.value = 1; return }
    // offset/scroll dimensions are untransformed: resizing never feeds the
    // previous scale back into the next measurement. Include attachments and
    // extra scenario decks, not just the usual one agenda + one act.
    const decks = content.value.querySelector<HTMLElement>('.scenario-decks')
    const count = decks?.querySelectorAll(':scope > .agenda-container, :scope > .act-container').length ?? 0
    let best = { columns: 1, scale: 1, cardWidth: -1 }
    // Choose the packing with the largest fully visible cards, including the
    // real attached cards, headings and counters in the measured height.
    for (let columns = 1; columns <= Math.max(1, Math.min(4, count)); columns++) {
      content.value.style.setProperty('--scenario-columns', String(columns))
      const height = Math.max(content.value.offsetHeight, content.value.scrollHeight)
      const width = Math.max(content.value.offsetWidth, content.value.scrollWidth)
      const nextScale = scenarioFitScale(host.value.clientWidth, host.value.clientHeight, width, height)
      const cardWidth = ((decks?.clientWidth ?? width) / columns) * nextScale
      if (cardWidth > best.cardWidth + .5) best = { columns, scale: nextScale, cardWidth }
    }
    content.value.style.setProperty('--scenario-columns', String(best.columns))
    scale.value = best.scale
  })
}
useResizeObserver([content, host], measure)
useMutationObserver(content, measure, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
watch(() => props.enabled, measure, { flush: 'post' })
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div ref="content" class="scenario-cards-content" :class="{ 'scenario-cards-content--fit': enabled }" :style="{ '--scenario-fit-scale': scale }" @load.capture="measure">
    <slot />
  </div>
</template>

<style scoped>
.scenario-cards-content { display: contents; }
.scenario-cards-content--fit {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: absolute;
  top: 0;
  left: 50%;
  width: 100%;
  box-sizing: border-box;
  padding: 6px;
  transform: translateX(-50%) scale(var(--scenario-fit-scale, 1));
  transform-origin: top center;
}
.scenario-cards-content--fit > :deep(*) { flex-shrink: 0; }
</style>
