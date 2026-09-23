// Map camera math only; never changes game state or location offsets.
export interface MapPoint { x: number; y: number }
export const MIN_MAP_ZOOM = 0.25
export const MAX_MAP_ZOOM = 6
export function clampMapZoom(value: number) {
  return Number.isFinite(value) ? Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, value)) : 1
}
export function wheelMapZoom(current: number, delta: number, mode: number, pageHeight: number) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? Math.max(1, pageHeight) : 1)
  return clampMapZoom(current * Math.exp(-Math.max(-600, Math.min(600, pixels)) * 0.002))
}
export const MAP_WHEEL_DURATION = 160
export function interpolateMapZoom(from: number, target: number, elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / MAP_WHEEL_DURATION))
  // Interpolate in log space so both directions feel equally responsive.
  const start = clampMapZoom(from), end = clampMapZoom(target)
  return t === 1 ? end : start * Math.exp(Math.log(end / start) * (1 - (1 - t) ** 3))
}
export function mapPointAt(client: MapPoint, grid: MapPoint, zoom: number): MapPoint {
  return { x: (client.x - grid.x) / zoom, y: (client.y - grid.y) / zoom }
}
export function mapAnchorCorrection(anchor: MapPoint, client: MapPoint, grid: MapPoint, zoom: number): MapPoint {
  return { x: grid.x + anchor.x * zoom - client.x, y: grid.y + anchor.y * zoom - client.y }
}
export function pinchGeometry(a: MapPoint, b: MapPoint) {
  return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }
}

// Independent of browser event types so real multi-pointer sequences can be
// replayed deterministically (including cancellation and a third finger).
export function createMapTouchGesture(callbacks: {
  pan: (delta: MapPoint) => void
  pinch: (factor: number, from: MapPoint, to: MapPoint) => void
  cancelCardPress: () => void
  canPan: () => boolean
}) {
  const points = new Map<number, MapPoint>()
  let previous: MapPoint | null = null
  let origin: MapPoint | null = null
  let pinched = false, panning = false
  const cancelPress = () => callbacks.cancelCardPress()
  return {
    get active() { return points.size > 0 },
    get manipulated() { return pinched || panning },
    down(id: number, point: MapPoint) {
      if (!points.size) { pinched = false; panning = false; origin = point; previous = point }
      points.set(id, point)
      if (points.size > 1) { pinched = true; cancelPress(); return true }
      return false
    },
    move(id: number, point: MapPoint) {
      if (!points.has(id)) return false
      const before = [...points.values()]
      points.set(id, point)
      if (points.size === 2) {
        const a = pinchGeometry(before[0], before[1]), after = [...points.values()]
        const b = pinchGeometry(after[0], after[1])
        callbacks.pinch(b.distance / a.distance, a.center, b.center)
        return true
      }
      // Do not jump from pinch to one-finger drag before all fingers lift.
      if (pinched) return true
      if (!callbacks.canPan() || !origin || !previous) return false
      if (!panning && Math.hypot(point.x - origin.x, point.y - origin.y) > 10) { panning = true; cancelPress() }
      if (!panning) return false
      callbacks.pan({ x: point.x - previous.x, y: point.y - previous.y })
      previous = point
      return true
    },
    up(id: number) {
      const block = (pinched || panning) && points.has(id)
      points.delete(id)
      return block
    },
    cancel() { points.clear(); origin = previous = null; pinched = panning = false },
  }
}
