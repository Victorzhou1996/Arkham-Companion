<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { useMediaQuery, useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { TABLETOP_MEDIA_QUERY } from '@/arkham/tabletopLayout'
import { useMobileBoard } from '@/arkham/mobile/context'
import { useDragHold } from '@/arkham/mobile/useDragHold'
import { useAccountPanels } from '@/arkham/composables/useAccountPanels'
import { collapsedLogWidth, logCollapsed, movePanel, normalizePanels, panelDefaults, panelLimits, persistentPanels, temporaryPileDefaults, type PanelKey, type PanelLayout } from '@/arkham/tabletopPanels'

const desktopWidth = useMediaQuery(TABLETOP_MEDIA_QUERY)
const props = defineProps<{ edge?: boolean; unreadLogCount?: number }>()
const showLog = defineModel<boolean>('showLog', { default: true })
const mobileBoard = useMobileBoard()
const tablet = computed(() => !!mobileBoard?.tablet.value)
const desktop = computed(() => desktopWidth.value || tablet.value)
const dragHold = useDragHold()
const { locale } = useI18n()
const zh = computed(() => locale.value.toLowerCase().startsWith('zh'))
const layer = ref<HTMLElement | null>(null)
const root = computed(() => layer.value?.closest<HTMLElement>('#game') ?? null)
const board = computed(() => layer.value?.parentElement ?? null)
const { saved, save, flush } = useAccountPanels()
// Only these two separators are temporary. Ignore legacy saved pile splits.
const temporaryPiles = ref({ ...temporaryPileDefaults })
const size = ref({ width: 1, height: 1, phase: 36, tabs: 32 })
const upperMax = computed(() => size.value.height <= 1 ? 76 : Math.max(42, Math.min(76, (size.value.height - size.value.tabs - 222) / size.value.height * 100)))
const layout = computed(() => { const p = normalizePanels({ ...saved.value, ...temporaryPiles.value }); return { ...p, upper: Math.min(p.upper, upperMax.value) } })
const logIsCollapsed = ref(false)
watch(() => size.value.width * layout.value.log / 100, width => {
  if (size.value.width > 1) {
    logIsCollapsed.value = logCollapsed(width, logIsCollapsed.value)
    if (logIsCollapsed.value) showLog.value = false
  }
}, { immediate: true })
const logClosed = computed(() => logIsCollapsed.value || !showLog.value)
const logWidth = computed(() => logClosed.value ? (props.edge ? 0 : collapsedLogWidth) : size.value.width * layout.value.log / 100)
watch(showLog, visible => {
  if (visible && logIsCollapsed.value && size.value.width > 1) setPanel('log', Math.max(panelDefaults.log, 190 / size.value.width * 100))
})
function setPanel(key: PanelKey, value: number) {
  const next = normalizePanels({ ...layout.value, [key]: value })
  if (key === 'piles' || key === 'pileRows') temporaryPiles.value = { ...temporaryPiles.value, [key]: next[key] }
  else save({ [key]: next[key] })
  if (key === 'log' && next.log * size.value.width / 100 >= 190) showLog.value = true
}
const dragging = ref<PanelKey | null>(null)
let drag: { pointer: number; x: number; y: number; start: PanelLayout; span: number; target: HTMLElement } | null = null
const names: Record<PanelKey, [string, string]> = {
  left: ['左侧卡牌区 / 地图', 'Scenario cards / map'], right: ['中间区域 / 四宫格牌堆', 'Player area / four piles'],
  log: ['地图 / 战役日志', 'Map / campaign log'],
  investigator: ['调查员 / 装备与手牌', 'Investigator / assets and hand'],
  upper: ['地图 / 调查员区域', 'Map / investigator area'], threat: ['威胁区 / 手牌', 'Threats / hand'],
  hand: ['装备 / 威胁区与手牌', 'Assets / threats and hand'], piles: ['个人牌堆 / 遭遇牌堆', 'Player / encounter piles'],
  pileRows: ['抽牌堆 / 弃牌堆', 'Draw / discard piles'],
}
const vertical = (key: PanelKey) => ['left', 'investigator', 'right', 'log', 'threat', 'piles'].includes(key)
const label = (key: PanelKey) => props.edge && key === 'right' ? (zh.value ? '场景与密谋宽度' : 'Act / agenda width') : names[key][zh.value ? 0 : 1]
function measure() {
  if (!board.value || !root.value) return
  const style = getComputedStyle(root.value)
  const next = { width: board.value.clientWidth, height: board.value.clientHeight,
    phase: props.edge ? 0 : root.value.querySelector('.phases')?.clientHeight ?? 36,
    tabs: props.edge ? 0 : root.value.querySelector('.tabs-row')?.clientHeight ?? (parseFloat(style.getPropertyValue('--tabletop-tab-height')) || 32) }
  if (Object.keys(next).some(k => next[k as keyof typeof next] !== size.value[k as keyof typeof next])) size.value = next
}
const edgeZone = computed(() => props.edge ? root.value?.querySelector<HTMLElement>('#player-zone') : null)
useResizeObserver([board, root, edgeZone], measure)
const lowerTop = computed(() => size.value.height * layout.value.upper / 100 + size.value.tabs + 2)
const lowerHeight = computed(() => Math.max(1, size.value.height - lowerTop.value))
const middleWidth = computed(() => size.value.width * (100 - layout.value.investigator - layout.value.right) / 100)
const threatX = computed(() => size.value.width * layout.value.investigator / 100 + middleWidth.value * layout.value.threat / 100)
function position(key: PanelKey) {
  const p = layout.value, s = size.value
  if (props.edge && board.value && root.value) {
    const base = board.value.getBoundingClientRect()
    const zone = root.value.querySelector('#player-zone')?.getBoundingClientRect()
    const person = root.value.querySelector('.tab:not([style*="display: none"]) .player-container')?.getBoundingClientRect()
    const hand = root.value.querySelector('.tab:not([style*="display: none"]) .hand-area')?.getBoundingClientRect()
    const equipment = root.value.querySelector('.tab:not([style*="display: none"]) .tabletop-equipment')?.getBoundingClientRect()
    if (zone) {
      if (key === 'upper') return { top: `${zone.top - base.top}px`, left: `${zone.left - base.left}px`, right: '0' }
      if (key === 'right') {
        const shelf = root.value.querySelector('.edge-scene-shelf')?.getBoundingClientRect()
        return { left: `${(shelf?.left ?? zone.right) - base.left}px`, bottom: '0', height: '30px' }
      }
      if (key === 'log') {
        const map = root.value.querySelector<HTMLElement>('.location-cards-container')
        // Native scrollbars can paint over DOM overlays on Windows. Put the
        // collapsed handle inside the content edge, not over the scrollbar.
        const gutter = map ? Math.max(0, map.offsetWidth - map.clientWidth) : 0
        return { left: `${root.value.getBoundingClientRect().right - base.left - (logClosed.value ? gutter + 20 : logWidth.value)}px`, top: '0', height: `${zone.top - base.top}px` }
      }
      if (person && key === 'investigator') return { left: `${person.right - base.left}px`, top: `${zone.top - base.top}px`, bottom: '0' }
      if (hand && key === 'threat') return { left: `${hand.left - base.left}px`, top: `${hand.top - base.top}px`, bottom: '0' }
      if (hand && key === 'hand') return { left: `${(equipment?.left ?? hand.left) - base.left}px`, right: `${base.right - zone.right}px`, top: `${hand.top - base.top}px` }
    }
  }
  const left = s.width * p.left / 100, right = s.width * (100 - p.right) / 100
  switch (key) {
    case 'left': return { left: `${left}px`, top: `${s.phase}px`, height: `${Math.max(0, s.height * p.upper / 100 - s.phase)}px` }
    case 'investigator': return { left: `${s.width * p.investigator / 100}px`, top: `${lowerTop.value}px`, bottom: '0' }
    case 'right': return { left: `${right}px`, top: `${s.height * p.upper / 100}px`, bottom: '0' }
    case 'log': return { left: `${s.width - logWidth.value}px`, top: '0', height: `${s.height * p.upper / 100}px` }
    case 'upper': return { top: `${s.height * p.upper / 100}px`, left: '0', right: '0' }
    case 'threat': return { left: `${threatX.value}px`, top: `${lowerTop.value + lowerHeight.value * p.hand / 100}px`, bottom: '0' }
    case 'hand': return { left: `${s.width * p.investigator / 100}px`, right: `${s.width - right}px`, top: `${lowerTop.value + lowerHeight.value * p.hand / 100}px` }
    case 'piles': return { left: `${right + (s.width - right) * p.piles / 100}px`, top: `${lowerTop.value}px`, bottom: '0' }
    case 'pileRows': return { left: `${right}px`, right: '0', top: `${lowerTop.value + lowerHeight.value * p.pileRows / 100}px` }
  }
}
watchEffect(() => {
  if (!root.value) return
  for (const [key, value] of Object.entries(layout.value)) root.value.style.setProperty(`--panel-${key}`, String(value))
  root.value.style.setProperty('--tabletop-log-width', `${logWidth.value}px`)
  root.value.classList.toggle('tabletop-log-collapsed', logClosed.value)
})
function start(event: PointerEvent, key: PanelKey) {
  if (event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  if (tablet.value && event.pointerType !== 'mouse') {
    event.preventDefault()
    dragHold.start(event, () => begin(event, key, target))
  } else begin(event, key, target)
}
function begin(event: PointerEvent, key: PanelKey, target: HTMLElement) {
  measure()
  const span = key === 'threat' ? middleWidth.value : key === 'piles' ? size.value.width * layout.value.right / 100
    : ['hand', 'pileRows'].includes(key) ? lowerHeight.value : vertical(key) ? size.value.width : size.value.height
  const start = key === 'log' && logClosed.value ? { ...layout.value, log: logWidth.value / size.value.width * 100 } : layout.value
  drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start, span: Math.max(1, span), target }
  dragging.value = key
  if (event.isTrusted) target.setPointerCapture(event.pointerId)
  event.preventDefault()
}
function move(event: PointerEvent) {
  if (!drag || !dragging.value || event.pointerId !== drag.pointer) return
  const key = dragging.value
  const distance = vertical(key) ? event.clientX - drag.x : event.clientY - drag.y
  setPanel(key, movePanel(drag.start, key, distance / drag.span * 100 * (key === 'right' || key === 'log' ? -1 : 1))[key])
}
function end() {
  dragHold.cancel()
  if (drag?.target.hasPointerCapture(drag.pointer)) drag.target.releasePointerCapture(drag.pointer)
  drag = null
  dragging.value = null
  flush()
}
function keyboard(event: KeyboardEvent, key: PanelKey) {
  const positive = vertical(key) ? 'ArrowRight' : 'ArrowDown'
  const negative = vertical(key) ? 'ArrowLeft' : 'ArrowUp'
  if (event.key === 'Home') setPanel(key, panelDefaults[key])
  else if (event.key === positive || event.key === negative) setPanel(key, movePanel(layout.value, key,
    (event.key === positive ? 1 : -1) * (event.shiftKey ? 5 : 1) * (key === 'right' || key === 'log' ? -1 : 1))[key])
  else return
  event.preventDefault()
  event.stopPropagation() // Unhandled keys (including U) belong to the game.
}
onBeforeUnmount(end)
</script>

<template>
  <div ref="layer" class="tabletop-dividers" :class="{ 'tabletop-dividers--dragging': dragging, 'tabletop-dividers--touch': tablet, 'tabletop-dividers--holding': dragHold.waiting.value }">
    <template v-if="desktop">
      <div v-for="(_, key) in panelDefaults" v-show="!props.edge || !['left', 'piles', 'pileRows'].includes(key)" :key="key" role="separator" tabindex="0"
        class="tabletop-divider" :class="vertical(key) ? 'tabletop-divider--vertical' : 'tabletop-divider--horizontal'"
        :data-panel="key" :style="position(key)" :aria-label="label(key)"
        :aria-orientation="vertical(key) ? 'vertical' : 'horizontal'" :aria-valuenow="Math.round(layout[key])"
        :aria-valuemin="panelLimits[key][0]" :aria-valuemax="key === 'upper' ? Math.round(upperMax) : panelLimits[key][1]"
        :title="`${label(key)} · ${tablet ? (zh ? '长按后拖动调整' : 'Hold then drag to resize') : (zh ? '拖动调整；双击复位' : 'Drag to resize; double-click to reset')}`"
        @pointerdown.stop="start($event, key)" @pointermove.stop="move" @pointerup.stop="end"
        @pointercancel="end" @lostpointercapture="end" @keydown="keyboard($event, key)"
        @dblclick.stop="setPanel(key, panelDefaults[key])"><span /><i class="tabletop-divider__grip" aria-hidden="true" /><button v-if="key === 'log' && logClosed && unreadLogCount" class="log-unread" type="button" :aria-label="zh ? `${unreadLogCount}条新日志，展开日志` : `${unreadLogCount} new entries, open log`" @pointerdown.stop @keydown.enter.stop @keydown.space.stop @click.stop="showLog = true">{{ unreadLogCount > 99 ? '99+' : unreadLogCount }}</button></div>
    </template>
  </div>
</template>

<style scoped>
.tabletop-dividers { position: absolute; inset: 0; pointer-events: none; z-index: 18; }
.log-unread { position: absolute; right: 1px; top: calc(50% + 18px); min-width: 24px; min-height: 24px; padding: 2px; border: 1px solid #c7b47c; border-radius: 5px; color: #f3e7c4; background: #18372b; cursor: pointer; font-size: 11px; font-style: normal; }
.tabletop-divider { position: absolute; pointer-events: auto; touch-action: none; user-select: none; outline: none; }
.tabletop-divider--vertical { width: 9px; transform: translateX(-50%); cursor: col-resize; }
.tabletop-divider--horizontal { height: 9px; transform: translateY(-50%); cursor: row-resize; }
.tabletop-divider span { position: absolute; inset: 4px; background: var(--tabletop-line); transition: background .15s; }
.tabletop-divider--vertical span { width: 1px; }
.tabletop-divider--horizontal span { height: 1px; }
.tabletop-divider:hover, .tabletop-divider:focus-visible { background: #e0ca8220; }
.tabletop-divider:is(:hover, :focus-visible) span, .tabletop-dividers--dragging span { background: var(--select); }
.tabletop-dividers--dragging { pointer-events: auto; }
.tabletop-divider__grip { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; transform: translate(-50%, -50%); pointer-events: auto; }
/* Two 6×12 right-isosceles triangles, with a 4px gap from the line.
   Their transparent 44px hit box stays usable without a large visible pill. */
.tabletop-divider__grip::before, .tabletop-divider__grip::after { content: ''; position: absolute; background: #c2ac73; transition: background .15s; }
.tabletop-divider--vertical .tabletop-divider__grip::before { width: 6px; height: 12px; left: 11px; top: 16px; clip-path: polygon(100% 0, 0 50%, 100% 100%); }
.tabletop-divider--vertical .tabletop-divider__grip::after { width: 6px; height: 12px; right: 11px; top: 16px; clip-path: polygon(0 0, 100% 50%, 0 100%); }
.tabletop-divider--horizontal .tabletop-divider__grip::before { width: 12px; height: 6px; top: 11px; left: 16px; clip-path: polygon(0 100%, 50% 0, 100% 100%); }
.tabletop-divider--horizontal .tabletop-divider__grip::after { width: 12px; height: 6px; bottom: 11px; left: 16px; clip-path: polygon(0 0, 50% 100%, 100% 0); }
.tabletop-divider:is(:hover, :focus-visible) .tabletop-divider__grip::before, .tabletop-divider:is(:hover, :focus-visible) .tabletop-divider__grip::after,
.tabletop-dividers--dragging .tabletop-divider__grip::before, .tabletop-dividers--dragging .tabletop-divider__grip::after { background: #ffe4a0; }
.tabletop-dividers--holding .tabletop-divider:active .tabletop-divider__grip { outline: 1px dotted #c2ac7380; border-radius: 50%; }
:global(#game:has(.location-cards-container--fullscreen) .tabletop-dividers) { display: none; }
</style>
