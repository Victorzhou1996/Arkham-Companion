<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue'
import { useMobileBoard, mobileCardKey } from './context'
import { createPressGesture } from './pressGesture'
import { mobileCardNarration } from './cardNarration'
import { readNarration, stopNarration, type NarrationItem } from '@/arkham/narration'

const board = useMobileBoard()
const mobile = computed(() => board?.touchEnabled.value ?? false)
const root = ref<HTMLElement | null>(null)
const previewRoot = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const narration = ref<NarrationItem | null>(null)
const id = Symbol('card-preview')
let previousFocus: HTMLElement | null = null
const close = () => {
  open.value = false
  if (board?.preview.value?.id === id) board.preview.value = null
  nextTick(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) })
}
const show = () => {
  if (!mobile.value || open.value) return
  // Preview only the rendered card: never fetch the front of a hidden card.
  if (!root.value?.querySelector('img.card, img.deck, [data-image]')) return
  const img = root.value.querySelector<HTMLImageElement>('img.card, img.deck')
  narration.value = null
  if (img) mobileCardNarration(img).then(item => { if (open.value) narration.value = item }).catch(() => {})
  board?.preview.value?.close()
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  open.value = true
  if (board) board.preview.value = { id, close }
  document.dispatchEvent(new Event('arkham:clear-card-overlay'))
  nextTick(() => closeButton.value?.focus({ preventScroll: true }))
}
const gesture = createPressGesture(show)
provide(mobileCardKey, { preview: open, open: show })
const smallControl = (target: EventTarget | null) => target instanceof Element
  ? target.closest('button:not([data-mobile-direct]), select, input, .aux-arc, .ability-trigger-mode, .token-pool, .poolItem, img.key, .sealed-chaos-tokens') : null
function down(e: PointerEvent) {
  if (!mobile.value || open.value || e.button !== 0) return
  if ((e.target as Element).closest('[data-mobile-card]') !== root.value) return
  gesture.down(e.clientX, e.clientY, e.pointerId)
  window.addEventListener('pointermove', move, { passive: true })
  window.addEventListener('pointerup', up, { once: true })
  window.addEventListener('pointercancel', cancel, { once: true })
  document.addEventListener('arkham:cancel-card-press', cancel)
}
function move(e: PointerEvent) { gesture.move(e.clientX, e.clientY, e.pointerId) }
function detach() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); document.removeEventListener('arkham:cancel-card-press', cancel) }
function up() { gesture.up(); detach() }
function cancel() { gesture.cancel(); detach() }
function click(e: MouseEvent) {
  if (!mobile.value || open.value) return
  if ((e.target as Element).closest('[data-mobile-card]') !== root.value) return
  if (gesture.consumeClick()) { e.preventDefault(); e.stopImmediatePropagation(); return }
  if (smallControl(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); show() }
}
function previewClick(e: MouseEvent) {
  // Pointer release after the hold must not play the now-enlarged card.
  if (gesture.consumeClick()) { e.preventDefault(); e.stopImmediatePropagation() }
}
function keydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); close(); return }
  if (e.key !== 'Tab') return
  const controls = [...(previewRoot.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length)
  const first = controls[0], last = controls.at(-1)
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
}
watch(mobile, enabled => { if (!enabled) close() })
onBeforeUnmount(() => { detach(); gesture.dispose(); if (board?.preview.value?.id === id) board.preview.value = null })
</script>

<template>
  <!-- Desktop gets its exact original DOM. No extra measuring/hover wrapper. -->
  <slot v-if="!mobile" />
  <div v-else ref="root" class="mobile-card" data-mobile-card
    :class="{ 'mobile-card--open': open }"
    @pointerdown.capture="down" @pointermove="gesture.move($event.clientX, $event.clientY, $event.pointerId)"
    @pointerup="gesture.up()" @pointercancel="gesture.cancel()" @click.capture="click"
    @contextmenu.prevent @dragstart.prevent>
    <Teleport to="body" :disabled="!open">
      <div :class="open ? 'mobile-preview-backdrop' : 'mobile-card-inline'" :style="open ? board?.viewport.value : undefined" @click.self="open && close()">
        <div ref="previewRoot" :class="open ? 'mobile-card-preview' : 'mobile-card-content'"
          :role="open ? 'dialog' : undefined" :aria-modal="open || undefined" :aria-label="open ? '卡牌预览与操作' : undefined"
          @contextmenu.prevent @dragstart.prevent
          @keydown="open && keydown($event)" @pointerdown.capture="open && gesture.consumeClick()" @click.capture="open && previewClick($event)">
          <header v-if="open" class="mobile-preview-heading"><span>卡牌详情 <small>可在下方发动能力</small></span><button ref="closeButton" type="button" @click.stop="close">关闭 ✕</button></header>
          <div v-if="open && narration" class="mobile-preview-narration"><button type="button" @click.stop="readNarration(narration)">朗读此卡</button><button type="button" @click.stop="stopNarration">停止朗读</button></div>
          <div :class="open ? 'mobile-preview-content' : 'mobile-card-slot'"><slot /></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
