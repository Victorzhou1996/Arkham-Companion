import { type Deck, isDeck } from "@arkham-build/shared";

const BUNDLE_FORMAT = "arkham-build-decks";

type DeckBundle = {
  format: typeof BUNDLE_FORMAT;
  version: 1;
  exportedAt: string;
  decks: Deck[];
};

export function parseDeckTransferData(value: unknown): Deck[] {
  if (isDeck(value)) return [value];
  if (Array.isArray(value)) return value.filter(isDeck);

  if (
    value &&
    typeof value === "object" &&
    "decks" in value &&
    Array.isArray(value.decks)
  ) {
    return value.decks.filter(isDeck);
  }

  return [];
}

export function serializeDeckTransfer(decks: Deck[]): string {
  if (decks.length === 1) return JSON.stringify(decks[0], null, 2);

  const bundle: DeckBundle = {
    format: BUNDLE_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    decks,
  };
  return JSON.stringify(bundle, null, 2);
}

export function splitDeckImportInputs(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,，;；]+/)
        .map((value) => value.trim().replace(/^[<({[]+|[>)}\]]+$/g, ""))
        .filter(Boolean),
    ),
  );
}
