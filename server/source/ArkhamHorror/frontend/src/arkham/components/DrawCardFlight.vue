<script setup lang="ts">
import { ref, nextTick, watch, onBeforeUnmount, type CSSProperties } from 'vue'
import type { DrawOrigin } from '@/arkham/drawTransition'
const props = defineProps<{ origin?: DrawOrigin }>()
const emit = defineEmits<{ arrived: [] }>()
const content = ref<HTMLElement | null>(null)
const flying = ref(false)
const waiting = ref(!!props.origin)
const slotStyle = ref<CSSProperties>({})
const flightStyle = ref<CSSProperties>({})
let generation = 0
let animation: Animation | undefined
let imageWait: ReturnType<typeof setTimeout> | undefined
let cancelImageWait: (() => void) | undefined
function restore(notify = true) {
  generation++
  animation?.cancel(); animation = undefined
  clearTimeout(imageWait); cancelImageWait?.(); cancelImageWait = undefined
  flying.value = false; waiting.value = false
  slotStyle.value = {}; flightStyle.value = {}
  document.removeEventListener('visibilitychange', background)
  window.removeEventListener('resize', viewportChanged)
  window.removeEventListener('scroll', viewportChanged, true)
  if (notify) emit('arrived')
}
const background = () => { if (document.hidden) restore() }
const viewportChanged = () => restore()
watch(() => props.origin, async origin => {
  restore(false)
  if (!origin) return
  if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { emit('arrived'); return }
  const run = generation
  waiting.value = true
  await nextTick()
  const img = content.value?.querySelector<HTMLImageElement>('img.in-hand')
  if (!img) { restore(); return }
  // Only one real rendered card exists. Teleport moves it; no clone is made.
  if (!img.complete || !img.naturalWidth) {
    await Promise.race([
      img.decode().catch(() => {}),
      new Promise<void>(resolve => { cancelImageWait = resolve; imageWait = setTimeout(resolve, 1200) }),
    ])
    clearTimeout(imageWait); cancelImageWait = undefined
  }
  if (run !== generation) return
  const to = img.getBoundingClientRect()
  if (!to.width || !to.height || !origin.width || !origin.height ||
      to.right <= 0 || to.bottom <= 0 || to.left >= innerWidth || to.top >= innerHeight) { restore(); return }
  slotStyle.value = { display: 'block', width: `${to.width}px`, height: `${to.height}px` }
  flightStyle.value = {
    position: 'fixed', left: `${to.left}px`, top: `${to.top}px`,
    width: `${to.width}px`, height: `${to.height}px`, zIndex: 100000,
    '--card-width': `${to.width}px`, '--card-height': `${to.height}px`,
    '--select': getComputedStyle(img).getPropertyValue('--select'),
    pointerEvents: 'none', transformOrigin: 'top left',
    transform: `translate(${origin.left - to.left}px,${origin.top - to.top}px) scale(${origin.width / to.width},${origin.height / to.height})`,
  }
  flying.value = true
  await nextTick()
  if (run !== generation || !content.value) return
  waiting.value = false
  document.addEventListener('visibilitychange', background)
  window.addEventListener('resize', viewportChanged)
  window.addEventListener('scroll', viewportChanged, true)
  try {
    animation = content.value.animate([
      { transform: flightStyle.value.transform as string },
      { transform: 'translate(0,0) scale(1,1)' },
    ], { duration: 760, delay: origin.delay, easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'both' })
    animation.finished.then(() => { if (run === generation) restore() }, () => { if (run === generation) restore() })
  } catch { restore() }
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => restore(false))
</script>
<template>
  <div v-if="origin || flying || waiting" class="draw-card-anchor" :style="slotStyle">
    <Teleport to="body" :disabled="!flying">
      <div ref="content" class="draw-card-content" :class="{ 'draw-card-flight': flying, 'draw-card-waiting': waiting }"
        :style="flightStyle" :inert="flying || waiting || undefined"><slot /></div>
    </Teleport>
  </div>
  <slot v-else />
</template>
<style scoped>
.draw-card-anchor, .draw-card-content { display: contents; }
.draw-card-flight { display: block; }
.draw-card-waiting { visibility: hidden; }
.draw-card-flight :deep(img.in-hand) { width: 100% !important; min-width: 0 !important; height: auto; margin: 0; }
.draw-card-flight :deep(button), .draw-card-flight :deep(.abilities), .draw-card-flight :deep(.ability-trigger-modes) { visibility: hidden; }
</style>
