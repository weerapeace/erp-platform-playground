import { describe, expect, it } from "vitest";

import { buildReportHtml, buildReportImageGridHtml } from "@/lib/template";

describe("report print template", () => {
  it("does not reserve a full blank page height when printing", () => {
    const html = buildReportHtml(
      {
        paper_size: "A4",
        orientation: "portrait",
        header_html: "<h1>{{title}}</h1>",
        body_html: "<p>{{body}}</p>",
        footer_html: "",
        custom_css: "",
      },
      { title: "Quote", body: "One-page content" },
    );

    expect(html).toContain("@media print");
    expect(html).toContain("min-height: 0");
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("page-break-after: auto");
    expect(html).toContain(".doc::after");
  });

  it("renders report images as a reusable two-column grid", () => {
    const html = buildReportImageGridHtml([
      { src: "/a.png", alt: "A" },
      { src: "/b.png", alt: "B" },
    ]);

    expect(html).toContain("report-image-grid");
    expect(html).toContain("--report-image-grid-cols:2");
    expect(html).toContain("--report-image-grid-max-height:58mm");
  });
});
