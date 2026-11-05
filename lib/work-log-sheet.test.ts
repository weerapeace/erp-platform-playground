import { describe, expect, it } from "vitest";
import { planWorkLogPages, renderWorkLogHtml, normalizeWorkLogOptions, workLogQrText, stepCode } from "./work-log-sheet";

const mo = { id: "11111111-2222-3333-4444-555555555555", mo_no: "MO-1182", product_sku: "BAG-MINI", product_name: "กระเป๋า Mini", qty: 1200, due_date: "2026-11-20" };
const mkSteps = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `abcdef${String(i).padStart(2, "0")}-0000-0000-0000-000000000000`, sequence: i + 1, step_name: `ขั้น ${i + 1}` }));

describe("work-log-sheet", () => {
  it("normalizes options into safe ranges", () => {
    expect(normalizeWorkLogOptions({ linesPerStep: 99, extraRows: -3 })).toEqual({ linesPerStep: 6, extraRows: 0 });
    expect(normalizeWorkLogOptions(null)).toEqual({ linesPerStep: 3, extraRows: 4 });
  });

  it("fits a short product on one page with extra-step rows", () => {
    const pages = planWorkLogPages(mo, mkSteps(4), { linesPerStep: 3, extraRows: 4 });
    expect(pages).toHaveLength(1);
    expect(pages[0].items.filter((i) => i.kind === "extra")).toHaveLength(4);
    expect(pages[0].qrText).toBe(workLogQrText(mo.id, 1, 1, 3, mkSteps(4).map((s) => s.id)));
    expect(pages[0].qrText.startsWith("WL1|11111111-2222-3333-4444-555555555555|1/1|3|abcdef00.")).toBe(true);
  });

  it("never splits a step across pages and numbers pages", () => {
    const pages = planWorkLogPages(mo, mkSteps(12), { linesPerStep: 3, extraRows: 4 });
    expect(pages.length).toBeGreaterThan(1);
    const stepCount = pages.reduce((a, p) => a + p.items.filter((i) => i.kind === "step").length, 0);
    expect(stepCount).toBe(12);
    pages.forEach((p, i) => { expect(p.index).toBe(i + 1); expect(p.total).toBe(pages.length); });
  });

  it("prints a fully blank sheet when the product has no steps", () => {
    const pages = planWorkLogPages(mo, [], { linesPerStep: 3, extraRows: 0 });
    expect(pages[0].items.filter((i) => i.kind === "extra").length).toBeGreaterThan(10);
  });

  it("renders digit boxes (4 for done, 3 for waste) and escapes text", () => {
    const pages = planWorkLogPages(mo, [{ id: "x", sequence: 1, step_name: "<เย็บ>" }], { linesPerStep: 1, extraRows: 0 });
    const html = renderWorkLogHtml(mo, pages, ["<svg></svg>"]);
    expect(html).toContain("&lt;เย็บ&gt;");
    expect(html).toContain(`<span class="dg">${"<i></i>".repeat(4)}</span>`);
    expect(html).toContain(`<span class="dg">${"<i></i>".repeat(3)}</span>`);
    expect(html).toContain(stepCode(1));
  });
});
