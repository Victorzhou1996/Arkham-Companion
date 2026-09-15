// UI only: never dispatch a game action here. A short tap retains the original click.
export const PREVIEW_HOLD_MS = 450
export const PRESS_SLOP_PX = 10
export function createPressGesture(open: () => void, schedule = (fn: () => void, ms: number) => setTimeout(fn, ms), cancel = (id: ReturnType<typeof setTimeout>) => clearTimeout(id)) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let origin: { x: number; y: number; id: number } | undefined
  let blocked = false
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined }
  return {
    down(x: number, y: number, id: number) {
      if (origin) { clear(); blocked = true; return }
      blocked = false; origin = { x, y, id }
      timer = schedule(() => { timer = undefined; blocked = true; open() }, PREVIEW_HOLD_MS)
    },
    move(x: number, y: number, id: number) {
      if (!origin || origin.id !== id) return
      if (Math.hypot(x - origin.x, y - origin.y) > PRESS_SLOP_PX) { clear(); blocked = true }
    },
    up() { clear(); origin = undefined },
    cancel() { clear(); origin = undefined; blocked = true },
    consumeClick() { const result = blocked; blocked = false; return result },
    dispose() { clear(); origin = undefined },
  }
}
