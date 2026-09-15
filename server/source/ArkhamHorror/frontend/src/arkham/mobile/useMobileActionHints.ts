import { onBeforeUnmount, watch, type Ref } from 'vue'
import type { MobileBoard } from './context'
import { emptyActionHints, enabledGameActions, inspectMobileActions, inspectMobileScenarioActions, markMobileActionCards } from './actionHints'

export function useMobileActionHints(root: Ref<HTMLElement | null>, board: MobileBoard) {
  let observer: MutationObserver | undefined
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const inspect = () => {
    // Coalesce DOM bursts, not every display frame. Hidden pages do no scans.
    if (timer !== undefined || frame || document.hidden) return
    timer = setTimeout(() => {
      timer = undefined
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!root.value || !board.enabled.value || document.hidden) return
        // Keep the hint path stable while live card contents are in the preview.
        if (board.preview.value) return
        const actions = enabledGameActions(root.value)
        markMobileActionCards(root.value, actions)
        const next = inspectMobileActions(root.value, actions)
        const scenario = inspectMobileScenarioActions(actions)
        if (JSON.stringify(scenario) !== JSON.stringify(board.scenarioActions.value)) board.scenarioActions.value = scenario
        if (JSON.stringify(next) !== JSON.stringify(board.actions.value)) board.actions.value = next
      })
    }, 50)
  }
  const stop = () => { observer?.disconnect(); cancelAnimationFrame(frame); frame = 0; clearTimeout(timer); timer = undefined }
  const visibility = () => {
    if (root.value) root.value.classList.toggle('mobile-page-hidden', document.hidden)
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; clearTimeout(timer); timer = undefined }
    else inspect()
  }
  document.addEventListener('visibilitychange', visibility)
  // Game loads asynchronously. Observe its resolved root, not a child whose
  // mounted hook may run before the surrounding player/tab tree is connected.
  watch([root, board.enabled], ([element, enabled]) => {
    stop()
    board.actions.value = emptyActionHints()
    if (!element || !enabled) return
    observer = new MutationObserver(inspect)
    observer.observe(element, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['class', 'disabled', 'aria-disabled', 'data-game-actionable', 'data-mobile-ability-available', 'data-player-tab'] })
    visibility()
  }, { flush: 'post', immediate: true })
  watch(board.preview, inspect)
  onBeforeUnmount(() => { stop(); document.removeEventListener('visibilitychange', visibility) })
}
