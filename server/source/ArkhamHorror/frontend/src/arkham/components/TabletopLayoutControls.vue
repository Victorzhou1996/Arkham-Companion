<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watchEffect } from 'vue'
import { useMediaQuery, useResizeObserver, useStorage } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { TABLETOP_MEDIA_QUERY } from '@/arkham/tabletopLayout'
import { movePanel, normalizePanels, panelDefaults, panelLimits, persistentPanels, temporaryPileDefaults, type PanelKey, type PanelLayout } from '@/arkham/tabletopPanels'

const desktop = useMediaQuery(TABLETOP_MEDIA_QUERY)
const { locale } = useI18n()
const zh = computed(() => locale.value.toLowerCase().startsWith('zh'))
const layer = ref<HTMLElement | null>(null)
const root = computed(() => layer.value?.closest<HTMLElement>('#game') ?? null)
const board = computed(() => layer.value?.parentElement ?? null)
const saved = useStorage<Partial<PanelLayout>>('arkham-tabletop-panels-v1', persistentPanels(panelDefaults))
// Only these two separators are temporary. Ignore legacy saved pile splits.
const temporaryPiles = ref({ ...temporaryPileDefaults })
const size = ref({ width: 1, height: 1, phase: 36, tabs: 32 })
const upperMax = computed(() => size.value.height <= 1 ? 76 : Math.max(42, Math.min(76, (size.value.height - size.value.tabs - 222) / size.value.height * 100)))
const layout = computed(() => { const p = normalizePanels({ ...saved.value, ...temporaryPiles.value }); return { ...p, upper: Math.min(p.upper, upperMax.value) } })
function setPanel(key: PanelKey, value: number) {
  const next = normalizePanels({ ...layout.value, [key]: value })
  if (key === 'piles' || key === 'pileRows') temporaryPiles.value = { ...temporaryPiles.value, [key]: next[key] }
  else saved.value = persistentPanels(next)
}
const dragging = ref<PanelKey | null>(null)
let drag: { pointer: number; x: number; y: number; start: PanelLayout; span: number; target: HTMLElement } | null = null
const names: Record<PanelKey, [string, string]> = {
  left: ['左侧卡牌区 / 地图', 'Scenario cards / map'], right: ['地图 / 日志与牌堆', 'Map / log and piles'],
  upper: ['地图 / 调查员区域', 'Map / investigator area'], threat: ['威胁区 / 手牌', 'Threats / hand'],
  hand: ['装备 / 威胁区与手牌', 'Assets / threats and hand'], piles: ['个人牌堆 / 遭遇牌堆', 'Player / encounter piles'],
  pileRows: ['抽牌堆 / 弃牌堆', 'Draw / discard piles'],
}
const vertical = (key: PanelKey) => ['left', 'right', 'threat', 'piles'].includes(key)
const label = (key: PanelKey) => names[key][zh.value ? 0 : 1]
function measure() {
  if (!board.value || !root.value) return
  const style = getComputedStyle(root.value)
  size.value = { width: board.value.clientWidth, height: board.value.clientHeight,
    phase: root.value.querySelector('.phases')?.clientHeight ?? 36,
    tabs: root.value.querySelector('.tabs-row')?.clientHeight ?? (parseFloat(style.getPropertyValue('--tabletop-tab-height')) || 32) }
}
useResizeObserver([board, root], measure)
const lowerTop = computed(() => size.value.height * layout.value.upper / 100 + size.value.tabs + 2)
const lowerHeight = computed(() => Math.max(1, size.value.height - lowerTop.value))
const middleWidth = computed(() => size.value.width * (100 - layout.value.left - layout.value.right) / 100)
const threatX = computed(() => size.value.width * layout.value.left / 100 + middleWidth.value * layout.value.threat / 100)
function position(key: PanelKey) {
  const p = layout.value, s = size.value
  const left = s.width * p.left / 100, right = s.width * (100 - p.right) / 100
  switch (key) {
    case 'left': return { left: `${left}px`, top: `${s.phase}px`, bottom: '0' }
    case 'right': return { left: `${right}px`, top: '0', bottom: '0' }
    case 'upper': return { top: `${s.height * p.upper / 100}px`, left: '0', right: '0' }
    case 'threat': return { left: `${threatX.value}px`, top: `${lowerTop.value + lowerHeight.value * p.hand / 100}px`, bottom: '0' }
    case 'hand': return { left: `${left}px`, right: `${s.width - right}px`, top: `${lowerTop.value + lowerHeight.value * p.hand / 100}px` }
    case 'piles': return { left: `${right + (s.width - right) * p.piles / 100}px`, top: `${lowerTop.value}px`, bottom: '0' }
    case 'pileRows': return { left: `${right}px`, right: '0', top: `${lowerTop.value + lowerHeight.value * p.pileRows / 100}px` }
  }
}
watchEffect(() => {
  if (!root.value) return
  for (const [key, value] of Object.entries(layout.value)) root.value.style.setProperty(`--panel-${key}`, String(value))
})
function start(event: PointerEvent, key: PanelKey) {
  if (event.button !== 0) return
  measure()
  const target = event.currentTarget as HTMLElement
  const span = key === 'threat' ? middleWidth.value : key === 'piles' ? size.value.width * layout.value.right / 100
    : ['hand', 'pileRows'].includes(key) ? lowerHeight.value : vertical(key) ? size.value.width : size.value.height
  drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: layout.value, span: Math.max(1, span), target }
  dragging.value = key
  target.setPointerCapture(event.pointerId)
  event.preventDefault()
}
function move(event: PointerEvent) {
  if (!drag || !dragging.value || event.pointerId !== drag.pointer) return
  const key = dragging.value
  const distance = vertical(key) ? event.clientX - drag.x : event.clientY - drag.y
  setPanel(key, movePanel(drag.start, key, distance / drag.span * 100 * (key === 'right' ? -1 : 1))[key])
}
function end() {
  if (drag?.target.hasPointerCapture(drag.pointer)) drag.target.releasePointerCapture(drag.pointer)
  drag = null
  dragging.value = null
}
function keyboard(event: KeyboardEvent, key: PanelKey) {
  const positive = vertical(key) ? 'ArrowRight' : 'ArrowDown'
  const negative = vertical(key) ? 'ArrowLeft' : 'ArrowUp'
  if (event.key === 'Home') setPanel(key, panelDefaults[key])
  else if (event.key === positive || event.key === negative) setPanel(key, movePanel(layout.value, key,
    (event.key === positive ? 1 : -1) * (event.shiftKey ? 5 : 1) * (key === 'right' ? -1 : 1))[key])
  else return
  event.preventDefault()
}
onBeforeUnmount(end)
</script>

<template>
  <div ref="layer" class="tabletop-dividers" :class="{ 'tabletop-dividers--dragging': dragging }">
    <template v-if="desktop">
      <div v-for="(_, key) in panelDefaults" :key="key" role="separator" tabindex="0"
        class="tabletop-divider" :class="vertical(key) ? 'tabletop-divider--vertical' : 'tabletop-divider--horizontal'"
        :data-panel="key" :style="position(key)" :aria-label="label(key)"
        :aria-orientation="vertical(key) ? 'vertical' : 'horizontal'" :aria-valuenow="Math.round(layout[key])"
        :aria-valuemin="panelLimits[key][0]" :aria-valuemax="key === 'upper' ? Math.round(upperMax) : panelLimits[key][1]"
        :title="`${label(key)} · ${zh ? '拖动调整；双击复位' : 'Drag to resize; double-click to reset'}`"
        @pointerdown.stop="start($event, key)" @pointermove.stop="move" @pointerup.stop="end"
        @pointercancel="end" @lostpointercapture="end" @keydown.stop="keyboard($event, key)"
        @dblclick.stop="setPanel(key, panelDefaults[key])"><span /></div>
    </template>
  </div>
</template>

<style scoped>
.tabletop-dividers { position: absolute; inset: 0; pointer-events: none; z-index: 18; }
.tabletop-divider { position: absolute; pointer-events: auto; touch-action: none; user-select: none; outline: none; }
.tabletop-divider--vertical { width: 9px; transform: translateX(-50%); cursor: col-resize; }
.tabletop-divider--horizontal { height: 9px; transform: translateY(-50%); cursor: row-resize; }
.tabletop-divider span { position: absolute; inset: 4px; background: var(--tabletop-line); transition: background .15s; }
.tabletop-divider--vertical span { width: 1px; }
.tabletop-divider--horizontal span { height: 1px; }
.tabletop-divider:hover, .tabletop-divider:focus-visible { background: #e0ca8220; }
.tabletop-divider:is(:hover, :focus-visible) span, .tabletop-dividers--dragging span { background: var(--select); }
.tabletop-dividers--dragging { pointer-events: auto; }
:global(#game:has(.location-cards-container--fullscreen) .tabletop-dividers) { display: none; }
</style>
