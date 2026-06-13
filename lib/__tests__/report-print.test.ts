import { describe, expect, it } from "vitest";

import { buildReportHtml } from "@/lib/template";

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
});
