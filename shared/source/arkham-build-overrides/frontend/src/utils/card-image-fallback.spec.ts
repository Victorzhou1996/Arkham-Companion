import { describe, expect, it } from "vitest";
import { cardImageFallbackUrls } from "./card-utils";

describe("card image fallbacks in embedded Arkham Horror mode", () => {
  it("keeps historical taboo scans exact instead of substituting the base card", () => {
    expect(cardImageFallbackUrls("01033-10", "optimized")).toEqual([
      "https://assets.arkham.build/optimized/01033-10.avif",
    ]);
  });

  it("uses the exact remote scan when no local base alias is objective", () => {
    expect(cardImageFallbackUrls("12106", "optimized")).toEqual([
      "https://assets.arkham.build/optimized/12106.avif",
    ]);
  });

  it("prefers a card-provided remote URL before the shared image bucket", () => {
    expect(
      cardImageFallbackUrls(
        "custom-card",
        "thumbnails",
        "https://example.test/custom.avif",
      ),
    ).toEqual([
      "https://example.test/custom.avif",
      "https://assets.arkham.build/thumbnails/custom-card.avif",
    ]);
  });
});
