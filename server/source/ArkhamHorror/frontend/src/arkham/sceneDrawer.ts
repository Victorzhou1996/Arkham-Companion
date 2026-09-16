// Drawer grace is independent of instantaneous card-art previews.
export const SCENE_LEAVE_DELAY = 900
export const SCENE_EXPAND_DELAY = 650
export const SCENE_GROUP_SELECTOR = '.edge-scene-shelf .edge-scene-group'

// A finite, event-driven state machine; moving around inside a preview never
// restarts timers or creates a render loop.
export function createSceneDrawerState(render: (state: { raised: boolean; enlarged: boolean; pinned: boolean }) => void,
  initial = { raised: false, enlarged: false, pinned: false },
  clock = { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (id: ReturnType<typeof setTimeout> | undefined) => clearTimeout(id) }) {
  let state = { ...initial }, inside = false
  let close: ReturnType<typeof setTimeout> | undefined, expand: ReturnType<typeof setTimeout> | undefined
  const clear = () => { clock.clear(close); clock.clear(expand); close = expand = undefined }
  const publish = () => render({ ...state })
  function raise() {
    clock.clear(close); close = undefined
    if (state.raised) return
    state.raised = true; publish()
    expand = clock.set(() => { expand = undefined; state.enlarged = true; publish() }, SCENE_EXPAND_DELAY)
  }
  function dismiss() { clear(); inside = false; state = { raised: false, enlarged: false, pinned: false }; publish() }
  function presence(value: boolean) {
    if (value) { inside = true; raise(); return }
    if (!inside && close !== undefined) return
    inside = false
    if (!state.raised || state.pinned) return
    clock.clear(close)
    close = clock.set(() => { close = undefined; if (!inside && !state.pinned) dismiss() }, SCENE_LEAVE_DELAY)
  }
  function togglePin() {
    if (state.pinned) { dismiss(); return }
    state.pinned = true; raise(); publish()
  }
  return { presence, dismiss, togglePin, dispose: clear, sync: publish, isRaised: () => state.raised }
}

// FloatingVue renders stack/history popovers under body, not beneath the card.
// Follow their real aria links rather than treating every unrelated popup as
// part of this drawer. Also follow popovers opened from an existing popup.
export function scenePreviewSurfaces(card: HTMLElement): HTMLElement[] {
  const surfaces = [card]
  // A trigger may have both a tooltip and a dropdown; their aria-describedby
  // values can replace one another. These owned content markers are stable.
  surfaces.push(...document.querySelectorAll<HTMLElement>('.stack-popover[data-edge-scene-preview="true"], .cards-under-popover[data-edge-scene-preview="true"]'))
  if (card.querySelector('.mobile-card--open')) {
    const preview = document.querySelector<HTMLElement>('.mobile-card-preview')
    if (preview) surfaces.push(preview)
  }
  for (let i = 0; i < surfaces.length; i++) {
    for (const trigger of surfaces[i].querySelectorAll('[aria-describedby],[aria-controls]')) {
      const ids = `${trigger.getAttribute('aria-describedby') ?? ''} ${trigger.getAttribute('aria-controls') ?? ''}`.split(/\s+/)
      for (const id of ids) {
        const popover = id && document.getElementById(id)
        if (popover && !surfaces.includes(popover) && !popover.contains(card) && popover.classList.contains('v-popper__popper')) surfaces.push(popover)
      }
    }
  }
  return surfaces
}

export function isScenePreviewSource(element: HTMLElement | null): boolean {
  if (!element) return false
  return [...document.querySelectorAll<HTMLElement>('#game.edge-tabletop ' + SCENE_GROUP_SELECTOR)]
    .some(card => scenePreviewSurfaces(card).some(surface => surface.contains(element)))
}

export function inSceneRegion(card: HTMLElement, target: EventTarget | null, point?: { x: number; y: number }): boolean {
  const surfaces = scenePreviewSurfaces(card)
  const overlay = document.querySelector<HTMLElement>('.card-overlay[data-edge-scene-preview="true"]')
  if (overlay) surfaces.push(overlay)
  return surfaces.some(surface => {
    const rect = surface.getBoundingClientRect()
    if (!rect.width || !rect.height || getComputedStyle(surface).visibility === 'hidden') return false
    if (target instanceof Node && surface.contains(target)) return true
    return !!point && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  })
}
