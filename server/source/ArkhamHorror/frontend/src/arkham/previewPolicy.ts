// Card art follows hover immediately. Only sceneDrawer owns a leave grace.
// Explicit touch/keyboard previews still close via outside click / Escape.
export const PREVIEW_OPEN_DELAY = 0
export const PREVIEW_LEAVE_DELAY = 0
export function containsPoint(element: HTMLElement | null, point: { clientX: number; clientY: number }): boolean {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && point.clientX >= rect.left && point.clientX <= rect.right && point.clientY >= rect.top && point.clientY <= rect.bottom
}
