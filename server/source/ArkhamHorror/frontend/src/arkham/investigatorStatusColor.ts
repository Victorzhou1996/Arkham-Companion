// Opaque class backgrounds with light labels; never imply action availability.
export const statusClassColors: Record<string, string> = {
  Guardian: '#245e8b', Seeker: '#855018', Rogue: '#276536',
  Mystic: '#684383', Survivor: '#923b3e', Neutral: '#53595b',
}
export function investigatorStatusBackground(investigators: readonly { class?: string; classSymbol?: string }[]): string {
  const colors = [...new Set(investigators.map(i => statusClassColors[i.classSymbol ?? i.class ?? 'Neutral'] ?? statusClassColors.Neutral))]
  if (colors.length < 2) return colors[0] ?? statusClassColors.Neutral
  return `linear-gradient(90deg, ${colors.map((color, i) => `${color} ${i * 100 / colors.length}% ${(i + 1) * 100 / colors.length}%`).join(', ')})`
}
