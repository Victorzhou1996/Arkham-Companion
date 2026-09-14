<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { useMediaQuery, useMutationObserver, useResizeObserver } from '@vueuse/core'
import { TABLETOP_MEDIA_QUERY } from '@/arkham/tabletopLayout'

const enabled = useMediaQuery(TABLETOP_MEDIA_QUERY)
const viewport = ref<HTMLElement | null>(null)
const row = ref<HTMLElement | null>(null)
const dimensions = ref({ scale: 1, width: 0, height: 0 })
let frame = 0
function measure() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (!enabled.value || !viewport.value || !row.value) return
    // The row is measured before its transform, including attached cards,
    // counters and inline controls. Reserve the horizontal scrollbar up front
    // so its appearance cannot oscillate the scale near the width threshold.
    const style = getComputedStyle(row.value)
    const height = Math.max(1, Math.ceil(parseFloat(style.height) || 0), row.value.offsetHeight, row.value.scrollHeight)
    const width = Math.max(1, Math.ceil(parseFloat(style.width) || 0), row.value.offsetWidth, row.value.scrollWidth)
    const available = Math.max(0, viewport.value.offsetHeight - 14)
    const scale = Math.min(1, available / height)
    dimensions.value = { scale, width: Math.ceil(width * scale), height: Math.ceil(height * scale) }
  })
}
useResizeObserver([viewport, row], measure)
useMutationObserver(row, measure, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class'] })
const trackStyle = computed(() => enabled.value ? { width: `${dimensions.value.width}px`, height: `${dimensions.value.height}px` } : undefined)
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div ref="viewport" class="equipment-fit" :class="{ 'equipment-fit--enabled': enabled }" @load.capture="measure">
    <div class="equipment-fit-track" :style="trackStyle">
      <div ref="row" class="equipment-fit-row" :style="enabled ? { transform: `scale(${dimensions.scale})` } : undefined">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.equipment-fit, .equipment-fit-track, .equipment-fit-row { display: contents; }
.equipment-fit--enabled { display: block; flex: 1; min-width: 0; min-height: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #776c3d #0b231a; }
.equipment-fit--enabled::-webkit-scrollbar { height: 6px; }
.equipment-fit--enabled .equipment-fit-track { display: block; position: relative; overflow: hidden; }
.equipment-fit--enabled .equipment-fit-row { display: flex; align-items: flex-start; gap: 6px; width: max-content; position: absolute; top: 0; left: 0; padding: 4px; transform-origin: left top; }
.equipment-fit--enabled .equipment-fit-row > :deep(*) { flex-shrink: 0; }
</style>
