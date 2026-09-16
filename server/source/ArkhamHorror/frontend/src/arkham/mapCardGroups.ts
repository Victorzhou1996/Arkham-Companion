export type Point = { x: number; y: number }
export type Box = { left: number; top: number; width: number; height: number }

// The groups are map overlays, not zoomed/rotated location-grid children.
export function clampGroupOffset(offset: Point, base: Box, area: Box): Point {
  const minX = area.left - base.left
  const minY = area.top - base.top
  return {
    x: Math.max(minX, Math.min(minX + Math.max(0, area.width - base.width), offset.x)),
    y: Math.max(minY, Math.min(minY + Math.max(0, area.height - base.height), offset.y)),
  }
}

export function compactPhaseLabel(label: string): string {
  return label.replace(/\s*阶段\s*$/, '').replace(/\s+phase\s*$/i, '')
}
