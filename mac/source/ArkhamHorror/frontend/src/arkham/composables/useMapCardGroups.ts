import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { getGameLocalStorageItem, setGameLocalStorageItem } from '@/arkham/localStorage'
import { parseLocationOffsets, type LocationOffsets } from '@/arkham/locationLayout'
import { clampGroupOffset, type Point, type Box } from '@/arkham/mapCardGroups'

type Group = 'auxiliary' | 'encounter'
const storageKey = 'visual-map-card-groups'

export function useMapCardGroups(gameId: () => string, enabled: Ref<boolean>, unlocked: Ref<boolean>) {
  const auxiliary = ref<HTMLElement | null>(null)
  const encounter = ref<HTMLElement | null>(null)
  const offsets = ref<LocationOffsets>({})
  const dragging = ref<Group | null>(null)
  const editable = computed(() => enabled.value && unlocked.value)
  const moved = computed(() => enabled.value && Object.values(offsets.value).some(p => p.x !== 0 || p.y !== 0))
  const roots = { auxiliary, encounter }
  let active: { id: Group; element: HTMLElement; pointer: number; start: Point; base: Box; area: Box; original: Point; final: Point; moved: boolean } | null = null
  let observer: ResizeObserver | undefined

  function style(id: Group) {
    if (!enabled.value) return undefined
    const p = offsets.value[id] ?? { x: 0, y: 0 }
    return { transform: `translate(${p.x}px, ${p.y}px)` }
  }
  function areaFor(element: HTMLElement): Box | undefined {
    const scenario = element.closest<HTMLElement>('.scenario')
    const map = scenario?.querySelector<HTMLElement>('.location-cards-container')
    if (!map) return
    const r = map.getBoundingClientRect()
    return { left: r.left + 4, top: r.top + 4, width: Math.max(0, r.width - 8), height: Math.max(0, r.height - 8) }
  }
  function save() {
    try { setGameLocalStorageItem(gameId(), storageKey, JSON.stringify(offsets.value)) }
    catch { /* Session-only positioning still works with restricted storage. */ }
  }
  function cancel() {
    if (active) active.element.style.transform = `translate(${active.original.x}px, ${active.original.y}px)`
    active = null
    dragging.value = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('blur', cancel)
    window.removeEventListener('keydown', escape)
  }
  function escape(event: KeyboardEvent) { if (event.key === 'Escape') cancel() }
  function suppress(event: Event) {
    if (!editable.value) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }
  function start(event: PointerEvent, id: Group) {
    if (!editable.value || event.button !== 0 || event.isPrimary === false) return
    const element = roots[id].value
    if (!element) return
    const area = areaFor(element)
    if (!area) return
    cancel()
    suppress(event)
    const original = offsets.value[id] ?? { x: 0, y: 0 }
    const r = element.getBoundingClientRect()
    active = { id, element, pointer: event.pointerId, start: { x: event.clientX, y: event.clientY },
      base: { left: r.left - original.x, top: r.top - original.y, width: r.width, height: r.height },
      area, original, final: original, moved: false }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', escape)
  }
  function move(event: PointerEvent) {
    if (!active || active.pointer !== event.pointerId) return
    const dx = event.clientX - active.start.x, dy = event.clientY - active.start.y
    if (!active.moved && Math.hypot(dx, dy) < 3) return
    event.preventDefault()
    active.moved = true
    dragging.value = active.id
    active.final = clampGroupOffset({ x: active.original.x + dx, y: active.original.y + dy }, active.base, active.area)
    active.element.style.transform = `translate(${active.final.x}px, ${active.final.y}px)`
  }
  function end(event: PointerEvent) {
    if (!active || active.pointer !== event.pointerId) return
    const drop = active
    cancel()
    if (!drop.moved) return
    offsets.value = { ...offsets.value, [drop.id]: drop.final }
    drop.element.style.transform = `translate(${drop.final.x}px, ${drop.final.y}px)`
    save()
  }
  function contain() {
    if (!enabled.value || active) return
    const next = { ...offsets.value }
    let changed = false
    for (const id of ['auxiliary', 'encounter'] as const) {
      const element = roots[id].value, p = next[id]
      if (!element || !p) continue
      const area = areaFor(element), r = element.getBoundingClientRect()
      if (!area || !r.width || !r.height) continue
      const fit = clampGroupOffset(p, { left: r.left - p.x, top: r.top - p.y, width: r.width, height: r.height }, area)
      if (fit.x !== p.x || fit.y !== p.y) { next[id] = fit; changed = true }
    }
    if (changed) offsets.value = next
  }
  function observe() {
    observer?.disconnect()
    if (!enabled.value) return
    observer = new ResizeObserver(contain)
    for (const root of Object.values(roots)) if (root.value) observer.observe(root.value)
    const map = auxiliary.value?.closest('.scenario')?.querySelector('.location-cards-container')
    if (map) observer.observe(map)
    contain()
  }
  watch([gameId, enabled], () => {
    cancel()
    try { offsets.value = enabled.value ? parseLocationOffsets(getGameLocalStorageItem(gameId(), storageKey)) : {} }
    catch { offsets.value = {} }
    void nextTick(observe)
  }, { immediate: true })
  watch([auxiliary, encounter], () => void nextTick(observe), { flush: 'post' })
  watch(editable, () => { if (!editable.value) cancel() })
  onBeforeUnmount(() => { cancel(); observer?.disconnect() })
  function reset() {
    if (!enabled.value) return
    cancel()
    offsets.value = {}
    save()
  }
  return { auxiliary, encounter, editable, dragging, moved, style, start, suppress, reset }
}
