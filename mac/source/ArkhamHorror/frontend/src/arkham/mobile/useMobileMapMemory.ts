import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'
import { parseMapCameraMemory, type MapCameraMemory } from './mapCameraMemory'

export function useMobileMapMemory(options: {
  key: Ref<string | null>
  scroller: Ref<HTMLElement | null>
  grid: () => HTMLElement | null
  zoom: Ref<number>
  snapshot: () => MapCameraMemory | null
  restore: (state: MapCameraMemory) => Promise<void>
}) {
  let cleanup: (() => void) | undefined
  watch([options.key, options.scroller], async ([key, element]) => {
    cleanup?.()
    if (!key || !element) return
    let stopped = false, restoring = true, ready = false
    let saveTimer: ReturnType<typeof setTimeout> | undefined
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    let remembered: MapCameraMemory | null = null
    try { remembered = parseMapCameraMemory(localStorage.getItem(key)) } catch { /* private/blocked storage */ }
    const save = () => {
      clearTimeout(saveTimer)
      if (!ready || restoring || stopped) return
      const view = options.snapshot()
      if (!view) return
      remembered = view
      try { localStorage.setItem(key, JSON.stringify(view)) } catch { /* gameplay stays available */ }
    }
    const scheduleSave = () => {
      if (restoring) return
      clearTimeout(saveTimer)
      saveTimer = setTimeout(save, 120)
    }
    const apply = async (view: MapCameraMemory) => {
      restoring = true
      await options.restore(view)
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      if (!stopped) restoring = false
    }
    const resize = () => {
      if (!ready || stopped || restoring || !remembered) return
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(async () => {
        if (!stopped && remembered) await apply(remembered)
      }, 40)
    }
    const visibility = () => { if (document.visibilityState === 'hidden') save() }
    const manualViewChange = () => {
      if (restoring || !ready) return
      // Do not let a resize caused by removing camera gutters restore the
      // old view over an explicit reset/zoom. Save the new view after layout.
      remembered = null
      clearTimeout(resizeTimer)
      scheduleSave()
    }
    const observer = new ResizeObserver(resize)
    const stopZoomWatch = watch(options.zoom, manualViewChange, { flush: 'post' })
    element.addEventListener('scroll', scheduleSave, { passive: true })
    element.addEventListener('arkham-map-view-reset', manualViewChange)
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', visibility)
    cleanup = () => {
      save()
      stopped = true
      clearTimeout(saveTimer); clearTimeout(resizeTimer)
      observer.disconnect(); stopZoomWatch()
      element.removeEventListener('scroll', scheduleSave)
      element.removeEventListener('arkham-map-view-reset', manualViewChange)
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', visibility)
    }
    await nextTick()
    if (stopped) return
    if (remembered) await apply(remembered)
    else { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); restoring = false }
    if (stopped) return
    ready = true
    remembered ??= options.snapshot()
    observer.observe(element)
    const grid = options.grid()
    if (grid) observer.observe(grid)
  }, { flush: 'post', immediate: true })
  onBeforeUnmount(() => cleanup?.())
}
