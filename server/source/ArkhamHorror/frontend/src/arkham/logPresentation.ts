// Classify only information actually present in a saved log entry. A card
// reference is not proof that the card was drawn/played, nor a resource delta.
export type LogCategory = 'all' | 'cards' | 'locations' | 'tokens' | 'other'
export function logCategory(message: string): Exclude<LogCategory, 'all'> {
  if (/\{location:/.test(message)) return 'locations'
  if (/\{(?:card|enemy):/.test(message)) return 'cards'
  if (/\{token:/.test(message)) return 'tokens'
  return 'other'
}
export function appendedLogCount(previous: readonly string[], next: readonly string[]): number {
  if (next.length < previous.length || previous.some((entry, index) => next[index] !== entry)) return 0
  return next.length - previous.length
}
