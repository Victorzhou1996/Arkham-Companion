import {
  type CardErrataResponse,
  CardErrataResponseSchema,
  type CardFaqResponse,
  CardFaqResponseSchema,
  type GrimoireResponse,
  GrimoireResponseSchema,
} from "@arkham-build/shared";
import type { HttpClient } from "../http-client";
import { isArkhamHorrorMode } from "./arkham-horror";

export async function queryGrimoire(
  client: HttpClient,
): Promise<GrimoireResponse> {
  const res = await client.request("/v2/public/grimoire");
  const data = await res.json();
  return GrimoireResponseSchema.parse(data);
}

export async function queryCardFaq(
  client: HttpClient,
  cardCode: string,
): Promise<CardFaqResponse> {
  if (isArkhamHorrorMode()) {
    return CardFaqResponseSchema.parse([]);
  }

  const res = await client.request(`/v2/public/faq/card/${cardCode}`);
  const data = await res.json();
  return CardFaqResponseSchema.parse(data);
}

export async function queryCardErrata(
  client: HttpClient,
  cardCode: string,
): Promise<CardErrataResponse> {
  if (isArkhamHorrorMode()) {
    return CardErrataResponseSchema.parse([]);
  }

  const res = await client.request(`/v2/public/errata/card/${cardCode}`);
  const data = await res.json();
  return CardErrataResponseSchema.parse(data);
}
