import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'
import { clampMapZoom, createMapTouchGesture, interpolateMapZoom, MAP_WHEEL_DURATION, mapAnchorCorrection, mapPointAt, wheelMapZoom, type MapPoint } from '@/arkham/mapViewport'
import type { MapCameraMemory } from '@/arkham/mobile/mapCameraMemory'

export function useMapViewport(options: {
  scroller: Ref<HTMLElement | null>
  grid: () => HTMLElement | null
  zoom: Ref<number>
  updateMargins: () => Promise<void>
  manualZoom: () => void
  cancelLocationDrag: () => void
  canPan: () => boolean
}) {
  let cleanup: (() => void) | undefined
  let disposed = false, frame: number | undefined
  let blockClickUntil = 0
  let pending: { anchor: MapPoint; client: MapPoint; zoom: number } | null = null
  let wheelMotion: { from: number; target: number; start: number; anchor: MapPoint; client: MapPoint } | null = null
  let applying = false, writingZoom = false
  let renderedZoom: number | null = null
  const currentZoom = () => renderedZoom ?? options.zoom.value
  let revision = 0
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  function cancelZoom(commit = false) {
    if (commit && renderedZoom !== null) {
      writingZoom = true
      options.zoom.value = renderedZoom
      writingZoom = false
    }
    renderedZoom = null
    revision++; pending = null; wheelMotion = null
    if (frame !== undefined) { cancelAnimationFrame(frame); frame = undefined }
  }
  function scheduleZoom() {
    if (!disposed && !applying && frame === undefined && (pending || wheelMotion)) {
      frame = requestAnimationFrame(time => { void applyZoom(time) })
    }
  }
  // Buttons/slider/reset take priority over any remaining wheel interpolation.
  watch(options.zoom, () => { if (!writingZoom) cancelZoom() }, { flush: 'sync' })
  const rectPoint = (element: HTMLElement) => { const r = element.getBoundingClientRect(); return { x: r.left, y: r.top } }
  const cancelPress = () => {
    document.dispatchEvent(new Event('arkham:cancel-card-press'))
    options.cancelLocationDrag()
    blockClickUntil = Date.now() + 700
  }
  async function applyZoom(time: number) {
    frame = undefined
    const motion = wheelMotion
    if (motion) pending = { anchor: motion.anchor, client: motion.client,
      zoom: interpolateMapZoom(motion.from, motion.target, time - motion.start) }
    const work = pending, scroller = options.scroller.value, grid = options.grid()
    if (!work || !scroller || !grid || disposed) { cancelZoom(); return }
    const currentRevision = revision
    // One viewport of scrollable gutter on each side permits focal zoom even
    // when the map is smaller than the viewport. Activate only on interaction.
    applying = true
    try {
      scroller.classList.add('map-camera-active')
      scroller.style.setProperty('--map-gutter-x', `${scroller.clientWidth}px`)
      scroller.style.setProperty('--map-gutter-y', `${scroller.clientHeight}px`)
      options.manualZoom()
      // Intermediate wheel frames update only the map DOM. Publishing every
      // frame to Vue would rerender card trees and write view storage at 60Hz.
      grid.style.transform = `scale(${work.zoom})`
      grid.style.transformOrigin = work.zoom >= 1 ? '0 0' : 'center center'
      grid.style.marginRight = work.zoom >= 1 ? `${grid.offsetWidth * (work.zoom - 1)}px` : ''
      grid.style.marginBottom = work.zoom >= 1 ? `${grid.offsetHeight * (work.zoom - 1)}px` : ''
      const finalWheelFrame = !motion || time - motion.start >= MAP_WHEEL_DURATION
      if (finalWheelFrame) {
        writingZoom = true
        options.zoom.value = work.zoom
        writingZoom = false
        renderedZoom = null
        await options.updateMargins()
      } else renderedZoom = work.zoom
      if (disposed || options.scroller.value !== scroller || currentRevision !== revision) return
      const delta = mapAnchorCorrection(work.anchor, work.client, rectPoint(grid), work.zoom)
      scroller.scrollLeft += delta.x
      scroller.scrollTop += delta.y
      pending = null
      if (motion && wheelMotion === motion && time - motion.start >= MAP_WHEEL_DURATION) wheelMotion = null
      if (finalWheelFrame) window.dispatchEvent(new Event('arkham-location-layout-change'))
    } catch (error) {
      cancelZoom()
      console.warn('Map camera update failed', error)
    } finally {
      writingZoom = false
      applying = false
      scheduleZoom()
    }
  }
  function zoomAt(zoom: number, from: MapPoint, to = from) {
    const grid = options.grid()
    if (!grid) return
    const nextZoom = clampMapZoom(zoom)
    // Several wheel/pointer events can arrive before a frame. Retain their
    // original natural anchor instead of measuring half-updated transforms.
    const anchor = pending
      ? mapPointAt(from, { x: pending.client.x - pending.anchor.x * pending.zoom, y: pending.client.y - pending.anchor.y * pending.zoom }, pending.zoom)
      : mapPointAt(from, rectPoint(grid), currentZoom())
    pending = { anchor, client: to, zoom: nextZoom }
    wheelMotion = null
    revision++
    scheduleZoom()
  }
  const touch = createMapTouchGesture({
    canPan: options.canPan,
    cancelCardPress: cancelPress,
    pan: delta => { const el = options.scroller.value; if (el) { el.scrollLeft -= delta.x; el.scrollTop -= delta.y } },
    pinch: (factor, from, to) => zoomAt((pending?.zoom ?? currentZoom()) * factor, from, to),
  })
  watch(options.scroller, element => {
    cleanup?.()
    if (!element) return
    const point = (e: PointerEvent): MapPoint => ({ x: e.clientX, y: e.clientY })
    const pointers = new Set<number>()
    const capture = (e: PointerEvent) => {
      if (e.isTrusted) for (const id of pointers) if (!element.hasPointerCapture(id)) element.setPointerCapture(id)
    }
    const stop = (e: Event) => { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation() }
    const down = (e: PointerEvent) => {
      cancelZoom(true)
      // A new deliberate press is not the synthetic release click of a pinch.
      if (!touch.active) blockClickUntil = 0
      if (e.pointerType !== 'touch') return
      pointers.add(e.pointerId)
      if (touch.down(e.pointerId, point(e))) { capture(e); stop(e) }
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if (touch.move(e.pointerId, point(e))) { capture(e); blockClickUntil = Date.now() + 700; stop(e) }
    }
    const up = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      pointers.delete(e.pointerId)
      if (touch.up(e.pointerId)) { blockClickUntil = Date.now() + 700; stop(e) }
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId)
    }
    const click = (e: MouseEvent) => {
      // Suppress a gesture's synthetic card click, not explicit toolbar or
      // keyboard reset/zoom commands immediately following the wheel.
      if ((e.target as Element).closest('.zoom-control')) return
      if (Date.now() < blockClickUntil) stop(e)
    }
    const wheel = (e: WheelEvent) => {
      // The listener is local to the map, not the whole page. Ctrl+wheel from
      // a precision trackpad uses the same focal zoom without page magnifying.
      if ((e.target as Element).closest('input, select, textarea, [contenteditable="true"]')) return
      if (!Number.isFinite(e.deltaY) || e.deltaY === 0 || document.hidden) return
      stop(e)
      cancelPress()
      const client = { x: e.clientX, y: e.clientY }
      const target = wheelMapZoom(wheelMotion?.target ?? pending?.zoom ?? currentZoom(), e.deltaY, e.deltaMode, element.clientHeight)
      if (reducedMotion.matches) { zoomAt(target, client); return }
      const grid = options.grid()
      if (!grid || (!wheelMotion && target === options.zoom.value)) return
      const anchor = pending
        ? mapPointAt(client, { x: pending.client.x - pending.anchor.x * pending.zoom, y: pending.client.y - pending.anchor.y * pending.zoom }, pending.zoom)
        : mapPointAt(client, rectPoint(grid), currentZoom())
      wheelMotion = { from: currentZoom(), target, start: performance.now(), anchor, client }
      pending = null
      revision++
      scheduleZoom()
    }
    const blur = () => { touch.cancel(); pointers.clear(); cancelZoom(true) }
    const visibility = () => { if (document.hidden) blur() }
    element.addEventListener('pointerdown', down, true)
    element.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    element.addEventListener('click', click, true)
    element.addEventListener('dblclick', click, true)
    element.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    cleanup = () => {
      blur()
      element.removeEventListener('pointerdown', down, true)
      element.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      element.removeEventListener('click', click, true)
      element.removeEventListener('dblclick', click, true)
      element.removeEventListener('wheel', wheel)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, { flush: 'post' })
  async function resetView() {
    cancelZoom()
    options.manualZoom()
    options.zoom.value = 1
    const grid = options.grid()
    if (grid) { grid.style.transform = 'scale(1)'; grid.style.transformOrigin = '0 0' }
    const element = options.scroller.value
    element?.dispatchEvent(new Event('arkham-map-view-reset'))
    element?.classList.remove('map-camera-active')
    await options.updateMargins()
    await nextTick()
    if (!element || disposed) return
    element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2)
    element.scrollTop = Math.max(0, (element.scrollHeight - element.clientHeight) / 2)
    window.dispatchEvent(new Event('arkham-location-layout-change'))
  }
  function snapshot(): MapCameraMemory | null {
    const element = options.scroller.value, grid = options.grid()
    if (!element || !grid || !element.clientWidth || !element.clientHeight) return null
    const rect = element.getBoundingClientRect()
    const center = { x: rect.left + element.clientLeft + element.clientWidth / 2, y: rect.top + element.clientTop + element.clientHeight / 2 }
    const point = mapPointAt(center, rectPoint(grid), currentZoom())
    return { version: 1, zoom: clampMapZoom(currentZoom()), x: point.x, y: point.y }
  }
  async function restore(view: MapCameraMemory) {
    const element = options.scroller.value, grid = options.grid()
    if (!element || !grid || disposed) return
    cancelZoom()
    element.classList.add('map-camera-active')
    element.style.setProperty('--map-gutter-x', `${element.clientWidth}px`)
    element.style.setProperty('--map-gutter-y', `${element.clientHeight}px`)
    options.manualZoom()
    options.zoom.value = clampMapZoom(view.zoom)
    grid.style.transform = `scale(${options.zoom.value})`
    grid.style.transformOrigin = options.zoom.value >= 1 ? '0 0' : 'center center'
    await options.updateMargins()
    if (disposed || options.scroller.value !== element) return
    const rect = element.getBoundingClientRect()
    const center = { x: rect.left + element.clientLeft + element.clientWidth / 2, y: rect.top + element.clientTop + element.clientHeight / 2 }
    const delta = mapAnchorCorrection(view, center, rectPoint(grid), options.zoom.value)
    element.scrollLeft += delta.x
    element.scrollTop += delta.y
    window.dispatchEvent(new Event('arkham-location-layout-change'))
  }
  onBeforeUnmount(() => { disposed = true; cleanup?.(); if (frame !== undefined) cancelAnimationFrame(frame) })
  return { resetView, snapshot, restore }
}
