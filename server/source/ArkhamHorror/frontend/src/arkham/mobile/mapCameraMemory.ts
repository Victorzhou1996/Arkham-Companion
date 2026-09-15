export interface MapCameraMemory { version: 1; zoom: number; x: number; y: number }
export function parseMapCameraMemory(raw: string | null): MapCameraMemory | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (v?.version !== 1 || ![v.zoom, v.x, v.y].every(n => typeof n === 'number' && Number.isFinite(n))) return null
    if (v.zoom < .25 || v.zoom > 6 || Math.abs(v.x) > 1e7 || Math.abs(v.y) > 1e7) return null
    return { version: 1, zoom: v.zoom, x: v.x, y: v.y }
  } catch { return null }
}
export function mobileMapMemoryKey(gameId: string, scenarioId: string) {
  return `game:${gameId}:mobile:mapCamera:${scenarioId}`
}
