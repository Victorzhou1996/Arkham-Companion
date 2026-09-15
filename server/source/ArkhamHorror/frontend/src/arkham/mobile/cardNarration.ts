import { useDbCardStore } from '@/stores/dbCards'
import { cardNarrationFromCsv } from '@/arkham/narrationCsv'
import { cardNarrationCategory } from '@/arkham/narrationCategory'
import type { NarrationItem, NarrationSegment } from '@/arkham/narration'

export async function mobileCardNarration(element: HTMLImageElement): Promise<NarrationItem | null> {
  // Derive only from the visible face. Card backs must not disclose hidden cards.
  const imageCode = element.src.match(/\/cards\/([^/?]+)\.(?:avif|webp|png|jpe?g)(?:[?#].*)?$/)?.[1]?.replace(/_.*$/, '')
  if (!imageCode) return null
  const code = (element.dataset.cardCode ?? element.dataset.imageId)?.replace(/^c/, '') ?? imageCode
  const store = useDbCardStore()
  try { await store.initDbCards() } catch { /* CSV remains usable offline. */ }
  const card = store.getDbCard(code) ?? store.getDbCard(imageCode)
  const category = cardNarrationCategory(card, element)
  const csv = await cardNarrationFromCsv(code, imageCode, category)
  if (csv) return csv
  if (!card) return null
  const back = imageCode === `${card.code}b`
  const segments: NarrationSegment[] = [
    { category: 'cardName', text: back ? card.back_name || card.name : card.name },
    { category: 'cardSubname', text: back ? '' : card.subname ?? '' },
    { category: 'cardTraits', text: back ? card.back_traits || card.traits || '' : card.traits || '' },
    { category: 'cardText', text: back ? card.back_text || '' : card.text || '' },
    { category: 'cardFlavor', text: back ? card.back_flavor || '' : card.flavor || '' },
  ]
  return { id: `mobile-card:${imageCode}:${store.lang}:${JSON.stringify(segments)}`, category, segments }
}
