<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { handLayout, TABLETOP_MEDIA_QUERY } from '@/arkham/tabletopLayout'
import { useMobileBoard } from '@/arkham/mobile/context'

const props = defineProps<{ previewOnTap?: boolean; desktopOnly?: boolean }>()
const desktop = useMediaQuery(TABLETOP_MEDIA_QUERY)
const mobileBoard = useMobileBoard()
const touch = computed(() => !!mobileBoard?.touchEnabled.value)
const enabled = computed(() => touch.value || !props.desktopOnly || desktop.value)
const root = ref<HTMLElement>()
const step = ref(106)
const measuredCardWidth = ref(100)
const contentWidth = ref(0)
const overlapping = ref(false)
let selectedCard: HTMLElement | undefined
let pointerType = ''
let resize: ResizeObserver | undefined
let mutation: MutationObserver | undefined
let observedCard: Element | undefined
const keyboardStops = new Set<HTMLElement>()

function cards(): HTMLElement[] {
  return Array.from(root.value?.querySelector('.adaptive-hand-row')?.children ?? []) as HTMLElement[]
}
function measure() {
  if (!root.value) return
  if (!enabled.value) {
    keyboardStops.forEach(card => card.removeAttribute('tabindex'))
    keyboardStops.clear()
    selectedCard = undefined
    return
  }
  const entries = cards()
  const first = entries[0]
  if (first && first !== observedCard) {
    if (observedCard) resize?.unobserve(observedCard)
    resize?.observe(first)
    observedCard = first
  }
  const width = first?.querySelector('img.card')?.getBoundingClientRect().width || first?.getBoundingClientRect().width || 100
  measuredCardWidth.value = width
  const layout = handLayout(entries.length, Math.max(0, root.value.clientWidth - 16), width, touch.value ? 44 : 24)
  step.value = layout.step
  contentWidth.value = layout.width
  overlapping.value = layout.overlapping
  if (selectedCard && !entries.includes(selectedCard)) selectedCard = undefined
  // One keyboard stop per card, including face-down cards and encounter cards.
  // Existing inner controls keep their own keyboard behavior.
  for (const card of keyboardStops) if (!entries.includes(card)) keyboardStops.delete(card)
  entries.forEach(card => { if (!card.hasAttribute('tabindex')) { card.tabIndex = 0; keyboardStops.add(card) } })
}
function previewCard(event: MouseEvent) {
  if (touch.value || !enabled.value || !overlapping.value || event.detail === 0 || !(props.previewOnTap || pointerType === 'touch' || pointerType === 'pen')) return
  const card = cards().find(entry => entry.contains(event.target as Node))
  if (!card || card === selectedCard) return
  // The first tap on an overlapped strip only reveals it. A second tap reaches
  // the original card/ability handler; no choices or permissions are invented.
  event.preventDefault()
  event.stopImmediatePropagation()
  selectedCard = card
  card.focus({ preventScroll: true })
  card.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
function onKey(event: KeyboardEvent) {
  if (!enabled.value) return
  const entries = cards()
  const index = entries.indexOf(event.target as HTMLElement)
  if (index < 0) return
  const target = event.key === 'ArrowRight' ? Math.min(entries.length - 1, index + 1)
    : event.key === 'ArrowLeft' ? Math.max(0, index - 1)
    : event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : -1
  if (target < 0) return
  event.preventDefault()
  entries[target]?.focus({ preventScroll: true })
  entries[target]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
onMounted(async () => {
  await nextTick()
  resize = new ResizeObserver(measure)
  if (root.value) resize.observe(root.value)
  const row = root.value?.querySelector('.adaptive-hand-row')
  mutation = new MutationObserver(measure)
  if (row) mutation.observe(row, { childList: true })
  measure()
})
onBeforeUnmount(() => { resize?.disconnect(); mutation?.disconnect() })
watch(enabled, () => nextTick(measure))
</script>

<template>
  <div ref="root" :class="{ 'adaptive-hand': enabled, 'adaptive-hand--disabled': !enabled, 'adaptive-hand--overlap': enabled && overlapping, 'adaptive-hand--touch': touch }"
    :style="{ '--hand-step': `${step}px`, '--hand-content-width': `${contentWidth}px`, '--hand-card-width': `${measuredCardWidth}px` }"
    @keydown="onKey" @pointerdown.capture="pointerType = $event.pointerType" @click.capture="previewCard">
    <slot />
  </div>
</template>

<style scoped>
.adaptive-hand--disabled, .adaptive-hand--disabled :deep(.adaptive-hand-row) { display: contents; }
.adaptive-hand { min-width: 0; width: 100%; overflow: auto; padding: 24px 8px 8px; scroll-padding-inline: 8px; scrollbar-width: thin; scrollbar-color: #80714b #10231f; }
.adaptive-hand::-webkit-scrollbar { width: 6px; height: 6px; }
.adaptive-hand::-webkit-scrollbar-thumb { background: #80714b; border-radius: 4px; }
.adaptive-hand::-webkit-scrollbar-track { background: #10231f; }
.adaptive-hand :deep(.adaptive-hand-row) { display: flex; align-items: flex-start; gap: 0; overflow: visible; width: max(100%, var(--hand-content-width)); min-height: calc(var(--hand-card-width) * 1.4); padding: 0; }
.adaptive-hand :deep(.adaptive-hand-row > *) { flex: 0 0 var(--hand-card-width); width: var(--hand-card-width); min-width: var(--hand-card-width); position: relative; transition: translate 140ms ease, filter 140ms ease; }
.adaptive-hand :deep(.adaptive-hand-row > * + *) { margin-left: calc(var(--hand-step) - var(--hand-card-width)); }
.adaptive-hand :deep(.adaptive-hand-row > :is(:hover, :focus-within)) { z-index: 100; filter: drop-shadow(0 6px 6px #0009); }
/* A previously keyboard-focused card must not cover the card now under the
   pointer. When the pointer leaves, keyboard focus remains fully revealed. */
.adaptive-hand :deep(.adaptive-hand-row > :hover) { z-index: 101; }
.adaptive-hand :deep(.adaptive-hand-row > :focus-visible) { outline: 2px solid #dbc582; outline-offset: 2px; }
.adaptive-hand :deep(.ability-trigger-mode) { position: relative; z-index: 2; }
.adaptive-hand--touch :deep(.adaptive-hand-row > :is(:hover, :focus-within)) { translate: none; filter: none; z-index: auto; }
@media (prefers-reduced-motion: reduce) { .adaptive-hand :deep(.adaptive-hand-row > *) { transition: none; } }
</style>
