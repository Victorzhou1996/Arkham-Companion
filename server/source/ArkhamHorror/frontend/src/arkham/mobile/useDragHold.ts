import { onBeforeUnmount, ref } from 'vue'
import { createPressGesture, PRESS_SLOP_PX } from './pressGesture'

// Arm a touch handle only after a stationary hold. Mouse dragging is unchanged.
export function useDragHold() {
  const waiting = ref(false)
  let activate: (() => void) | undefined
  let pointer: number | undefined
  let origin = { x: 0, y: 0 }
  const gesture = createPressGesture(() => { waiting.value = false; activate?.() })
  function move(event: PointerEvent) {
    if (waiting.value && event.pointerId === pointer) {
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > PRESS_SLOP_PX) cancel()
      else gesture.move(event.clientX, event.clientY, event.pointerId)
    }
  }
  function release(event: PointerEvent) { if (event.pointerId === pointer) cancel() }
  function cancel() {
    gesture.cancel(); waiting.value = false; activate = undefined; pointer = undefined
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', release)
  }
  function start(event: PointerEvent, callback: () => void) {
    if (pointer !== undefined) { cancel(); return }
    activate = callback; pointer = event.pointerId; waiting.value = true
    origin = { x: event.clientX, y: event.clientY }
    gesture.down(event.clientX, event.clientY, event.pointerId)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
  }
  onBeforeUnmount(cancel)
  return { waiting, start, cancel }
}
