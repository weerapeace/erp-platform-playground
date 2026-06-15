import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFFER_TEMPLATE_KEY,
  getOfferTemplate,
  normalizeOfferTemplateKey,
} from "@/lib/offer-templates";

describe("offer templates", () => {
  it("falls back to the default template when the saved key is unknown", () => {
    expect(normalizeOfferTemplateKey("missing-template")).toBe(DEFAULT_OFFER_TEMPLATE_KEY);
  });

  it("provides a product-grid template with a grid public view", () => {
    expect(getOfferTemplate("catalog_grid").publicView).toBe("grid");
  });
});
