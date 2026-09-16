// Visual-only positions. Never sent as game messages or stored in undo history.
export type LocationOffsets = Record<string, { x: number; y: number }>
export function parseLocationOffsets(raw: string | null): LocationOffsets {
  const result: LocationOffsets = {}
  try {
    const parsed = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result
    for (const [id, value] of Object.entries(parsed)) {
      const p = value as { x?: unknown; y?: unknown } | null
      if (p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        result[id] = { x: Math.max(-100000, Math.min(100000, p.x)), y: Math.max(-100000, Math.min(100000, p.y)) }
      }
    }
  } catch { /* A damaged preference must not prevent entering the game. */ }
  return result
}
