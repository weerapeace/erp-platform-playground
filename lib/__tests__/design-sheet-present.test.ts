import { describe, it, expect } from "vitest";
import { buildReportHtml } from "@/lib/template";
import { buildPresentData, DEFAULT_DS_PRESENT_TEMPLATE, DS_PRESENT_SAMPLE_DATA, sanitizePresentation } from "@/lib/design-sheet-present";
describe("design-sheet-present", () => {
  it("renders 2 pages with sample data and no cost fields", () => {
    const html = buildReportHtml({ paper_size: "A4", orientation: "portrait", ...DEFAULT_DS_PRESENT_TEMPLATE }, DS_PRESENT_SAMPLE_DATA);
    expect((html.match(/<section class="page/g) ?? []).length).toBe(2);
    expect(html).toContain("ราคาเสนอ");
    expect(html).not.toMatch(/ต้นทุน|cost|standard_price/);
    expect(html).toContain("<li>ผ้าแคนวาสหนา 12 oz</li>");
  });
  it("sanitize drops outside urls, caps pages/images", () => {
    const p = sanitizePresentation({ pages: [
      { layout: "grid4", images: [{ key: "a", url: "/api/r2-image?key=a" }, { key: "x", url: "https://evil/x.png" }], bullets: ["1", "", "2"] },
      { layout: "nope", images: [] }, { layout: "hero", images: [] },
    ] });
    expect(p.pages.length).toBe(2);
    expect(p.pages[0].images.map((i) => i.key)).toEqual(["a"]);
    expect(p.pages[0].bullets).toEqual(["1", "2"]);
    expect(p.pages[1].layout).toBe("hero");
    const d = buildPresentData(p, { code: "DS-1", name: "n", brand_name: "b", brand_logo_url: null, order_date_th: "", deadline_th: "", offered_price: null, colors: [], sizes: [], origin: "https://x" });
    expect((d.pages as unknown[]).length).toBe(2);
    expect(String((d.pages as { images_html: string }[])[0].images_html)).toContain("https://x/api/r2-image?key=a&amp;w=800");
  });
});
