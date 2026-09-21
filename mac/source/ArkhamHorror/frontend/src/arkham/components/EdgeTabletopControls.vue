<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import type { Game } from '@/arkham/types/Game'
import { GAME_ACTION_SELECTOR } from '@/arkham/mobile/actionHints'
import { useCardStore } from '@/stores/cards'
import { useDbCardStore } from '@/stores/dbCards'
import { createSceneDrawerState, inSceneRegion } from '@/arkham/sceneDrawer'

const props = defineProps<{ root: HTMLElement | null; game: Game }>()
const cardStore = useCardStore()
const namesStore = useDbCardStore()
defineModel<boolean>('showLog', { default: false })
const bindings = new Map<HTMLElement, { dispose: () => void; sync: () => void }>()
const selector = '.edge-scene-shelf .edge-scene-group'
function refresh() {
  const cards = [...(props.root?.querySelectorAll<HTMLElement>(selector) ?? [])]
  for (const [card, binding] of bindings) if (!cards.includes(card)) { binding.dispose(); bindings.delete(card) }
  for (const card of cards) {
    const pending = [...card.querySelectorAll(GAME_ACTION_SELECTOR)].some(e => !e.matches(':disabled,[aria-disabled="true"]'))
    card.classList.toggle('edge-scene-pending', pending)
    const existing = bindings.get(card)
    if (existing) { existing.sync(); continue }
    // Each card keeps its own visible heading; only the containing group moves.
    const setExpanded = (expanded: boolean) => {
      const names = [...card.querySelectorAll<HTMLButtonElement>('.edge-scene-name')]
      const contents = [...card.querySelectorAll<HTMLElement>('.scenario-decks > :is(.act-container,.agenda-container) > :not(.edge-scene-name)')]
      names.forEach(name => name.setAttribute('aria-expanded', String(expanded)))
      contents.forEach(content => { content.inert = !expanded })
    }
    let wasRaised = false
    const state = createSceneDrawerState(({ raised, enlarged, pinned }) => {
      card.classList.toggle('edge-scene-raised', raised)
      card.classList.toggle('edge-scene-expanded', enlarged)
      card.dataset.scenePinned = String(pinned)
      setExpanded(raised)
      if (wasRaised && !raised) {
        document.dispatchEvent(new Event('arkham:scene-drawer-dismiss'))
        if (document.querySelector('.card-overlay[data-edge-scene-preview="true"]')) document.dispatchEvent(new Event('arkham:clear-card-overlay'))
      }
      wasRaised = raised
    })
    let dismissed = false
    let pointer: { x: number; y: number } | undefined
    const enter = (event: PointerEvent) => { if (event.pointerType === 'mouse') { dismissed = false; state.presence(true) } }
    const move = (event: PointerEvent) => {
      if (!state.isRaised() || event.pointerType !== 'mouse') return
      pointer = { x: event.clientX, y: event.clientY }
      state.presence(inSceneRegion(card, event.target, pointer))
    }
    const leave = (event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY }; state.presence(inSceneRegion(card, event.relatedTarget, pointer)) }
    const previewChanged = () => {
      if (state.isRaised() && pointer) state.presence(inSceneRegion(card, document.elementFromPoint(pointer.x, pointer.y), pointer))
    }
    const focus = () => { if (!dismissed) state.presence(true) }
    const blur = (event: FocusEvent) => state.presence(inSceneRegion(card, event.relatedTarget))
    const click = (event: MouseEvent) => {
      if ((event.target as Element)?.closest('.edge-scene-name')?.closest(selector) === card) {
        dismissed = false; state.togglePin(); return
      }
      if (state.isRaised() && !inSceneRegion(card, event.target)) { dismissed = true; state.dismiss() }
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { dismissed = true; state.dismiss() } }
    const windowLeave = () => state.presence(false)
    state.sync()
    card.addEventListener('pointerenter', enter); card.addEventListener('pointerleave', leave)
    card.addEventListener('focusin', focus); card.addEventListener('focusout', blur)
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('click', click, true)
    document.addEventListener('keydown', escape)
    document.addEventListener('arkham:scene-preview-change', previewChanged)
    document.addEventListener('pointerleave', windowLeave)
    window.addEventListener('blur', windowLeave)
    bindings.set(card, { sync: state.sync, dispose: () => {
      state.dispose()
      card.removeEventListener('pointerenter', enter); card.removeEventListener('pointerleave', leave)
      card.removeEventListener('focusin', focus); card.removeEventListener('focusout', blur)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('click', click, true)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('arkham:scene-preview-change', previewChanged)
      document.removeEventListener('pointerleave', windowLeave)
      window.removeEventListener('blur', windowLeave)
    } })
  }
}
watch(() => [props.root, props.game, cardStore.cards, namesStore.loadedLang], () => nextTick(refresh), { immediate: true, flush: 'post' })
useResizeObserver(() => props.root, () => nextTick(refresh))
onBeforeUnmount(() => { bindings.forEach(binding => binding.dispose()); bindings.clear() })
</script>
<template><span class="edge-dock-controls" aria-hidden="true" /></template>
