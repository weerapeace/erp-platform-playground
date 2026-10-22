import { describe, it, expect } from "vitest";
import { buildReportHtml } from "@/lib/template";
import {
  DS_COMMENT_FOCUS_BODY, buildCommentCardsHtml, buildMainThumbsHtml, commentImageKey, selectCommentsForPrint,
} from "@/lib/design-sheet-print";

const COMMENTS = [
  { id: "c1", body: "ขอเปลี่ยนสาย", images: ["/api/r2-image?key=a", "/api/r2-image?key=b"] },
  { id: "c2", body: "เพิ่มซิป", images: ["/api/r2-image?key=c"] },
  { id: "c3", body: "ไม่มีรูป", images: [] },
];

describe("design-sheet-print (โหมดเน้น Comment ลูกค้า)", () => {
  it("default = every comment and every image, keeping original numbers", () => {
    const picked = selectCommentsForPrint(COMMENTS, new Set(), new Set());
    expect(picked.map((p) => p.idx)).toEqual([1, 2, 3]);
    expect(picked[0].images).toHaveLength(2);
  });

  it("skips comments and single images; numbers stay as in the sheet", () => {
    const picked = selectCommentsForPrint(COMMENTS, new Set(["c1"]), new Set([commentImageKey("c2", "/api/r2-image?key=c")]));
    expect(picked.map((p) => p.idx)).toEqual([2, 3]);
    expect(picked[0].images).toEqual([]);
  });

  it("cards escape user text (incl. {{tokens}}) and size images by chosen columns", () => {
    const html = buildCommentCardsHtml([
      { idx: 2, date_th: "21 ต.ค. 2569", body: "<b>x</b> {{code}}", images: ["https://x/1.png", "https://x/2.png", "https://x/3.png"] },
    ], "3");
    expect(html).toContain("#2");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt; &#123;&#123;code&#125;&#125;");
    expect(html).toContain("repeat(3,minmax(0,1fr))");
    expect(html).toContain("max-height:60mm");
    expect(html).toContain("รูปแนบ 3 รูป");
  });

  it("one image never leaves empty grid columns", () => {
    const html = buildCommentCardsHtml([{ idx: 1, date_th: "", body: "", images: ["https://x/1.png"] }], "2");
    expect(html).toContain("repeat(1,minmax(0,1fr))");
    expect(html).toContain("max-height:85mm");
  });

  it("renders the focus body with small main images and a no-comment fallback", () => {
    const tpl = { paper_size: "A4" as const, orientation: "portrait" as const, header_html: "", body_html: DS_COMMENT_FOCUS_BODY, footer_html: "", custom_css: "" };
    const thumbs = buildMainThumbsHtml([{ src: "https://x/main.png" }]);
    expect(thumbs).toContain("width:26mm");
    const withCards = buildReportHtml(tpl, { name: "กระเป๋า", main_thumbs_html: thumbs, comment_cards_html: buildCommentCardsHtml([{ idx: 1, date_th: "", body: "hi", images: [] }], "2") });
    expect(withCards).toContain("https://x/main.png");
    expect(withCards).toContain("hi");
    expect(withCards).not.toContain("ไม่มี comment ที่เลือกพิมพ์");
    const empty = buildReportHtml(tpl, { name: "กระเป๋า", main_thumbs_html: "", comment_cards_html: "" });
    expect(empty).toContain("ไม่มี comment ที่เลือกพิมพ์");
    expect(empty).not.toContain("รูปงานออกแบบ");
  });
});
