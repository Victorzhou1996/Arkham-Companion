export interface UndoKeyEvent {
  key: string
  code?: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  repeat?: boolean
  isComposing?: boolean
}
// Caps Lock and non-Latin keyboard layouts must not silently arm a chord.
// Only an intentional Shift+U does that; holding U never sends repeated undos.
export function undoShortcut(event: UndoKeyEvent): 'undo' | 'chord' | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return null
  if (event.code !== 'KeyU' && event.key.toLowerCase() !== 'u') return null
  return event.shiftKey ? 'chord' : 'undo'
}
export const allowsUndoInput = (type: string) => ['range', 'checkbox', 'radio'].includes(type)
