import { describe, expect, it } from "vitest";
import { DEFAULT_OFFER_COLS } from "@/lib/offer-columns";
import { resolveOfferLayoutConfig } from "@/lib/offer-layout";

describe("resolveOfferLayoutConfig", () => {
  it("uses the offer-specific layout before the shared fallback", () => {
    const shared = { order: DEFAULT_OFFER_COLS.order, hidden: ["color"], groupBy: "category" };
    const sheet = { order: ["product", "qty", "total"], hidden: ["unit_price"], groupBy: null };

    expect(resolveOfferLayoutConfig(sheet, shared)).toEqual(sheet);
  });

  it("falls back to shared layout when the offer has no layout yet", () => {
    const shared = { order: ["product", "qty", "total"], hidden: ["image"], groupBy: "color" };

    expect(resolveOfferLayoutConfig(null, shared)).toEqual(shared);
  });
});
