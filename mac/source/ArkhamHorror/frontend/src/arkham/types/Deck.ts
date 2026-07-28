import * as JsonDecoder from 'ts.data.json';
import { investigatorClass } from '@/arkham/helpers';
import { v2Optional } from '@/arkham/parser';

export type DeckMeta = string | Record<string, unknown>

interface Meta {
  alternate_front?: string
  card_pool?: string
  [key: string]: unknown
}

export interface ArkhamDbDecklist {
  id: string
  url: string | null
  meta?: DeckMeta
  name: string
  investigator_code: string
  investigator_name: string
  slots: {
    [key: string]: number
  }
  sideSlots?: Record<string, number>
  taboo_id?: number | null
}

export function deckMetaAlternateFront(meta: Meta | string | undefined): string | null {
  if (!meta) return null
  if (typeof meta === 'object') return meta.alternate_front || null
  try {
    const parsed = JSON.parse(meta)
    return typeof parsed?.alternate_front === 'string' && parsed.alternate_front ? parsed.alternate_front : null
  } catch (_err) {
    return null
  }
}

export function deckInvestigator(deck: Deck) {
  const alternate = deckMetaAlternateFront(deck.list.meta)
  if (alternate) return alternate
  return deck.list.investigator_code.replace('c', '')
}

export function deckClass(deck: Deck) {
  const investigator = deckInvestigator(deck)
  if (investigator) {
    return investigatorClass(investigator)
  }

  return {}
}

export type DeckList = {
  investigator_code: string;
  slots: Record<string, number>;
  sideSlots?: Record<string, number>;
  meta?: string
  taboo_id?: number
}

export type Deck = {
  id: string;
  name: string;
  url : string | null;
  investigatorName?: string;
  list: DeckList;
}

export type CampaignDeckStatus = 'active' | 'completed'

export function deckMetaValue(deck: Deck, key: string): string | null {
  const meta = deck.list.meta
  if (!meta) return null

  try {
    const parsed = JSON.parse(meta)
    const value = parsed?.[key]
    return typeof value === 'string' ? value : null
  } catch (_err) {
    return null
  }
}

export function campaignDeckStatus(deck: Deck): CampaignDeckStatus | null {
  const status = deckMetaValue(deck, 'arkham_horror_campaign_status')
  return status === 'active' || status === 'completed' ? status : null
}

export const deckListDecoder = JsonDecoder.object<DeckList>(
  {
    investigator_code: JsonDecoder.string(),
    slots: JsonDecoder.record<number>(JsonDecoder.number(), 'Dict<cardcode, number'),
    sideSlots: v2Optional(JsonDecoder.record<number>(JsonDecoder.number(), 'Dict<cardcode, number')),
    meta: v2Optional(JsonDecoder.string()),
    taboo_id: v2Optional(JsonDecoder.number()),
  },
  'DeckList',
);

export const deckDecoder = JsonDecoder.object<Deck>(
  {
    id: JsonDecoder.string(),
    name: JsonDecoder.string(),
    url: JsonDecoder.nullable(JsonDecoder.string()),
    investigatorName: v2Optional(JsonDecoder.string()),
    list: deckListDecoder,
  },
  'Deck',
);
