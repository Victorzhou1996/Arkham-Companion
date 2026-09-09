import { afterEach, describe, expect, it, vi } from "vitest";
import {
  arkhamDbImportUrls,
  createArkhamHorrorDeck,
  deleteArkhamHorrorDeck,
  fetchArkhamHorrorDecks,
  importArkhamDbDeck,
} from "./arkham-horror";

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  };
}

describe("fetchArkhamHorrorDecks", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("maps campaign deck metadata to build tags", async () => {
    localStorage.setItem("arkham-token", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            id: "active",
            investigatorName: "Roland",
            name: "Roland active",
            url: null,
            list: {
              investigator_code: "c01001",
              meta: JSON.stringify({
                arkham_horror_campaign_status: "active",
                arkham_horror_description_md: "Starter notes",
              }),
              slots: {},
            },
          },
          {
            id: "completed",
            investigatorName: "Daisy",
            name: "Daisy completed",
            url: null,
            list: {
              investigator_code: "c01002",
              meta: JSON.stringify({
                arkham_horror_campaign_status: "completed",
              }),
              slots: {},
            },
          },
        ]),
      ),
    );

    const decks = await fetchArkhamHorrorDecks();

    expect(decks.map((deck) => [deck.id, deck.tags])).toEqual([
      ["active", "正在剧本进行中的卡组"],
      ["completed", "完成剧本的卡组"],
    ]);
    expect(decks.map((deck) => deck.investigator_code)).toEqual([
      "01001",
      "01002",
    ]);
    expect(decks[0].description_md).toBe("Starter notes");
  });

  it("saves Build notes in Arkham Horror deck metadata", async () => {
    localStorage.setItem("arkham-token", "token");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        id: "saved-id",
        investigatorName: "Roland Banks",
        name: "Starter Roland",
        url: null,
        list: { investigator_code: "01001", slots: {} },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createArkhamHorrorDeck({
      id: "starter",
      description_md: "Upgrade guide",
      investigator_code: "01001",
      investigator_name: "Roland Banks",
      meta: '{"existing":"value"}',
      name: "Starter Roland",
      sideSlots: {},
      slots: {},
      taboo_id: null,
    } as never);

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(JSON.parse(body.deckList.meta)).toEqual({
      existing: "value",
      arkham_horror_description_md: "Upgrade guide",
    });
  });
});

describe("ArkhamDB import bridge", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("normalizes ids and public deck URLs", () => {
    expect(arkhamDbImportUrls("12345")).toEqual([
      "https://arkhamdb.com/api/public/deck/12345",
      "https://arkhamdb.com/api/public/decklist/12345",
    ]);
    expect(
      arkhamDbImportUrls("https://zh.arkhamdb.com/decklist/view/67890"),
    ).toEqual(["https://arkhamdb.com/api/public/decklist/67890"]);
    expect(
      arkhamDbImportUrls("https://arkham.build/deck/view/5872647"),
    ).toEqual(["https://arkham.build/deck/view/5872647"]);
    expect(
      arkhamDbImportUrls("https://arkham.build/decklist/abc123"),
    ).toEqual(["https://arkham.build/decklist/view/abc123"]);
  });

  it("fetches through Arkham Horror and saves to the current account", async () => {
    localStorage.setItem("arkham-token", "token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 12345,
          investigator_code: "01001",
          investigator_name: "Roland Banks",
          name: "Imported Roland",
          slots: { "01016": 2 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "saved-id",
          investigatorName: "Roland Banks",
          name: "Imported Roland",
          url: "https://arkhamdb.com/api/public/deck/12345",
          list: {
            investigator_code: "01001",
            investigator_name: "Roland Banks",
            slots: { "01016": 2 },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const deck = await importArkhamDbDeck("12345");

    expect(deck.id).toBe("saved-id");
    expect(deck.name).toBe("Imported Roland");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/arkham/decks/fetch",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/arkham/decks",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("accepts empty successful delete responses", async () => {
    localStorage.setItem("arkham-token", "token");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deleteArkhamHorrorDeck({
        id: "local-deck",
        version: "arkham-horror:local-deck",
      } as never),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/arkham/decks/local-deck",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
