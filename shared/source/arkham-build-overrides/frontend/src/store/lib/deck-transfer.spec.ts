import { describe, expect, it } from "vitest";
import { makeTestDeck } from "@/test/factories";
import {
  parseDeckTransferData,
  serializeDeckTransfer,
  splitDeckImportInputs,
} from "./deck-transfer";

describe("splitDeckImportInputs", () => {
  it("splits pasted links on whitespace and Chinese punctuation", () => {
    expect(
      splitDeckImportInputs(
        "https://arkham.build/deck/view/one\nhttps://arkham.build/deck/view/two，12345",
      ),
    ).toEqual([
      "https://arkham.build/deck/view/one",
      "https://arkham.build/deck/view/two",
      "12345",
    ]);
  });

  it("removes duplicates", () => {
    expect(splitDeckImportInputs("123 123\n456")).toEqual(["123", "456"]);
  });
});

describe("deck transfer JSON", () => {
  const deck = makeTestDeck({ id: "deck-1", name: "Test deck" });

  it("round-trips a single deck", () => {
    expect(
      parseDeckTransferData(JSON.parse(serializeDeckTransfer([deck]))),
    ).toEqual([deck]);
  });

  it("round-trips a multi-deck bundle", () => {
    const second = { ...deck, id: "deck-2" };
    expect(
      parseDeckTransferData(JSON.parse(serializeDeckTransfer([deck, second]))),
    ).toEqual([deck, second]);
  });
});
