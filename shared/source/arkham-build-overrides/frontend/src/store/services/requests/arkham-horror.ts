import type { Deck } from "@arkham-build/shared";
import { arkhamHorrorBasePath } from "@/utils/app-path";
import { isArkhamHorrorMode } from "@/utils/arkham-horror-mode";

type ArkhamHorrorDeckList = {
  id?: string | number | null;
  investigator_code: string;
  investigator_name?: string | null;
  meta?: string | null;
  name?: string | null;
  sideSlots?: Record<string, number> | null;
  slots: Record<string, number>;
  taboo_id?: number | null;
  url?: string | null;
};

type ArkhamHorrorDeck = {
  id: string | number;
  investigatorName?: string | null;
  name: string;
  url: string | null;
  list: ArkhamHorrorDeckList;
};

type ArkhamHorrorDeckPost = {
  deckId: string;
  deckName: string;
  deckUrl: string | null;
  deckList: ArkhamHorrorDeckList & {
    id: string;
    name: string;
    url: string | null;
  };
};

const DESCRIPTION_META_KEY = "arkham_horror_description_md";

export type ArkhamHorrorUser = {
  admin: boolean;
  beta: boolean;
  email: string;
  username: string;
};

export { isArkhamHorrorMode };

export function isArkhamHorrorDeck(deck: Pick<Deck, "version"> | undefined) {
  return String(deck?.version ?? "").startsWith("arkham-horror:");
}

export async function fetchArkhamHorrorDecks(): Promise<Deck[]> {
  if (!arkhamHorrorToken()) return [];

  const decks = await request<ArkhamHorrorDeck[]>("/arkham/decks");
  return decks.map(toBuildDeck);
}

export async function fetchArkhamHorrorUser(): Promise<ArkhamHorrorUser | null> {
  if (!arkhamHorrorToken()) return null;
  return request<ArkhamHorrorUser>("/whoami");
}

export async function importArkhamDbDeck(input: string): Promise<Deck> {
  let deckList: ArkhamHorrorDeckList | undefined;
  let sourceUrl = "";
  let lastError: unknown;

  for (const url of arkhamDbImportUrls(input)) {
    try {
      deckList = await request<ArkhamHorrorDeckList>("/arkham/decks/fetch", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      sourceUrl = url;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!deckList) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Could not import ArkhamDB deck.");
  }

  const id = String(deckList.id || crypto.randomUUID());
  const name = deckList.name || deckList.investigator_name || id;
  const created = await request<ArkhamHorrorDeck>("/arkham/decks", {
    method: "POST",
    body: JSON.stringify({
      deckId: id,
      deckName: name,
      deckUrl: sourceUrl,
      deckList: { ...deckList, id, name, url: sourceUrl },
    } satisfies ArkhamHorrorDeckPost),
  });

  return toBuildDeck(created);
}

export function arkhamDbImportUrls(input: string): string[] {
  const value = input.trim();
  if (/^\d+$/.test(value)) {
    return [
      `https://arkhamdb.com/api/public/deck/${value}`,
      `https://arkhamdb.com/api/public/decklist/${value}`,
    ];
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a public ArkhamDB id or an ArkhamDB/arkham.build deck URL.");
  }

  if (/(^|\.)arkham\.build$/i.test(parsed.hostname)) {
    const match = parsed.pathname.match(
      /^\/(decklist|deck|share)(?:\/view)?\/([^/]+)\/?$/i,
    );
    if (!match) throw new Error("Enter a public arkham.build deck or decklist URL.");

    const [, type, id] = match;
    return [`https://arkham.build/${type.toLowerCase()}/view/${id}`];
  }

  if (!/(^|\.)arkhamdb\.com$/i.test(parsed.hostname)) {
    throw new Error("Only ArkhamDB and arkham.build deck URLs can be imported.");
  }

  const match = parsed.pathname.match(
    /^\/(?:api\/public\/)?(decklist|deck)(?:\/view)?\/([^/]+)\/?$/i,
  );
  if (!match) throw new Error("Enter a public ArkhamDB deck or decklist URL.");

  const [, type, id] = match;
  return [`https://arkhamdb.com/api/public/${type.toLowerCase()}/${id}`];
}

export function clearArkhamHorrorToken() {
  localStorage.removeItem("arkham-token");
}

export async function createArkhamHorrorDeck(deck: Deck): Promise<Deck> {
  const created = await request<ArkhamHorrorDeck>("/arkham/decks", {
    method: "POST",
    body: JSON.stringify(toArkhamHorrorPost(deck)),
  });
  return toBuildDeck(created);
}

export async function updateArkhamHorrorDeck(deck: Deck): Promise<Deck> {
  const updated = await request<ArkhamHorrorDeck>(`/arkham/decks/${deck.id}`, {
    method: "PUT",
    body: JSON.stringify(toArkhamHorrorPost(deck)),
  });
  return toBuildDeck(updated);
}

export async function deleteArkhamHorrorDeck(deck: Deck): Promise<void> {
  await request(`/arkham/decks/${deck.id}`, { method: "DELETE" });
}

async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  const token =
    arkhamHorrorToken();
  if (token) headers.set("Authorization", `Token ${token}`);

  const res = await fetch(`${arkhamHorrorApiBase()}/api/v1${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    throw new Error((await res.text()) || `ArkhamHorror request failed: ${res.status}`);
  }

  const text = await res.text();
  return (text.trim() ? JSON.parse(text) : undefined) as T;
}

function arkhamHorrorApiBase() {
  return (import.meta.env.VITE_ARKHAM_HORROR_API_URL || arkhamHorrorBasePath()).replace(/\/$/, "");
}

function arkhamHorrorToken() {
  return (
    localStorage.getItem("arkham-token") ||
    import.meta.env.VITE_ARKHAM_HORROR_TOKEN
  );
}

function toBuildDeck(deck: ArkhamHorrorDeck): Deck {
  const now = new Date().toISOString();
  const list = deck.list;
  const id = String(deck.id);

  return {
    date_creation: now,
    date_update: now,
    description_md: deckDescription(list.meta),
    exile_string: null,
    id,
    ignoreDeckLimitSlots: {},
    investigator_code: fromArkhamCode(list.investigator_code),
    investigator_name:
      list.investigator_name ??
      unquote(deck.investigatorName) ??
      fromArkhamCode(list.investigator_code),
    meta: list.meta || "{}",
    name: deck.name,
    next_deck: null,
    previous_deck: null,
    problem: null,
    sideSlots: fromArkhamSlots(list.sideSlots),
    slots: fromArkhamSlots(list.slots),
    source: "local",
    taboo_id: list.taboo_id ?? null,
    tags: campaignDeckTag(list.meta),
    user_id: null,
    version: `arkham-horror:${id}`,
    xp: null,
    xp_adjustment: null,
    xp_spent: null,
  };
}

function campaignDeckTag(meta?: string | null) {
  try {
    const status = JSON.parse(meta || "{}").arkham_horror_campaign_status;
    if (status === "active") return "正在剧本进行中的卡组";
    if (status === "completed") return "完成剧本的卡组";
  } catch {
    // Ignore malformed meta from imported decklists.
  }

  return "";
}

function deckDescription(meta?: string | null) {
  try {
    const description = JSON.parse(meta || "{}")[DESCRIPTION_META_KEY];
    return typeof description === "string" ? description : "";
  } catch {
    return "";
  }
}

function withDeckDescription(meta: string | null | undefined, description: string) {
  let values: Record<string, unknown> = {};
  try {
    values = JSON.parse(meta || "{}");
  } catch {
    // Replace malformed metadata while retaining the editable deck.
  }

  if (description) values[DESCRIPTION_META_KEY] = description;
  else delete values[DESCRIPTION_META_KEY];
  return JSON.stringify(values);
}

function toArkhamHorrorPost(deck: Deck): ArkhamHorrorDeckPost {
  const id = String(deck.id);

  return {
    deckId: id,
    deckName: deck.name,
    deckUrl: null,
    deckList: {
      id,
      investigator_code: fromArkhamCode(deck.investigator_code),
      investigator_name: deck.investigator_name ?? deck.investigator_code,
      meta: withDeckDescription(deck.meta, deck.description_md),
      name: deck.name,
      sideSlots: fromArkhamSlots(deck.sideSlots),
      slots: fromArkhamSlots(deck.slots),
      taboo_id: deck.taboo_id ?? null,
      url: null,
    },
  };
}

function fromArkhamSlots(slots: Record<string, number> | null | undefined = {}) {
  return Object.fromEntries(
    Object.entries(slots ?? {}).map(([code, quantity]) => [
      fromArkhamCode(code),
      quantity,
    ]),
  );
}

function fromArkhamCode(code: string) {
  return /^c\d/.test(code) ? code.slice(1) : code;
}

function unquote(value?: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}
