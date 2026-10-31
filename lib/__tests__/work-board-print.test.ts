import { describe, expect, it } from "vitest";
import { defaultListPrintSettings, type ListPrintSettings } from "@/lib/list-print";
import { buildWorkBoardPrint, workBoardPrintColumns, type BoardResp, type WorkBoardPrintInput, type WorkBoardPrintType } from "@/lib/work-board-print";

const BOARD: BoardResp = {
  departments: [{ id: "d1", name: "โต๊ะ A" }],
  pending: [
    { id: "1", mo_no: "MO-3", product_sku: "PIX-1", product_name: "กระเป๋า <ใหญ่>", qty: 30, remaining: 30, due_date: null, internal_due_date: "2026-11-20", order_date: "2026-10-03", brand: "PIX", image_url: "/api/r2-image?key=a.jpg", central_rate: 10 },
    { id: "2", mo_no: "MO-1", product_sku: "CTL-1", product_name: "ข", qty: 60, remaining: 60, due_date: "2026-11-05", order_date: "2026-10-01", brand: "Good Goods", image_url: null },
    { id: "3", mo_no: "MO-2", product_sku: "CTL-2", product_name: "ก", qty: 20, remaining: 20, due_date: null, order_date: "2026-10-02", brand: "Good Goods", image_url: null },
  ],
  pending_piece: [{ id: "p", mo_no: "MO-1", job_name: "เย็บสาย", rate: 5, qty: 10, product_sku: "CTL-1", product_name: "ข", image_url: null }],
  workOrders: [{ id: "w", wo_no: "WO-1", mo_no: "MO-9", product_sku: "PIX-9", product_name: "สะพาย", stage: "sew", assignee_name: "สมชาย (ชาย)", department_name: "โต๊ะ A", qty: 4, status: "dispatched", labor_cost: 80, due_date: "2026-11-30" }],
};
const run = (type: WorkBoardPrintType, over: Partial<ListPrintSettings> = {}) =>
  buildWorkBoardPrint({
    type, group: "__all__", board: BOARD, moGroups: [{ name: "ล็อตตุลา", mo_nos: ["MO-1"] }], plan: null,
    assignees: { craftsmen: [{ id: "e1", name: "สมชาย", nickname: "ชาย", department_id: "d1" }], dept_wages: { d1: 9000 } },
    settings: { ...defaultListPrintSettings(workBoardPrintColumns(type)), sortBy: "opened", ...over },
    origin: "https://erp.test", company: null, printedAt: "31/10/2569",
  } satisfies WorkBoardPrintInput);
const order = (html: string, ...needles: string[]) => needles.map((n) => html.indexOf(n));

describe("work board print", () => {
  it("shows the internal due date when the customer due date is empty", () => {
    const { html } = run("pending");
    expect(html).toContain("20 พ.ย. 69");
    expect(html).toContain("5 พ.ย. 69");
  });

  it("sorting now applies to the pending sheet", () => {
    const [a, b, c] = order(run("pending", { sortBy: "opened" }).html, "MO-1", "MO-2", "MO-3");
    expect(a).toBeLessThan(b); expect(b).toBeLessThan(c);
    const [d, e] = order(run("pending", { sortBy: "qty" }).html, "CTL-1", "PIX-1");
    expect(d).toBeLessThan(e);
  });

  it("the all-in-one sheet builds with in-production rows (was crashing before)", () => {
    const r = run("all");
    expect(r.html).toContain("1) รายการรอจ่าย");
    expect(r.html).toContain("สะพาย");
    expect(r.html).toContain("พนักงาน 1 คน: ชาย");
  });

  it("escapes product names and uses full image URLs", () => {
    const { html } = run("pending");
    expect(html).toContain("กระเป๋า &lt;ใหญ่&gt;");
    expect(html).toContain('src="https://erp.test/api/r2-image?key=a.jpg&amp;w=120"');
  });

  it("follows column order, renamed labels and write-in columns", () => {
    const { html } = run("pending", { columns: [{ key: "name", on: true, label: "สินค้า" }, { key: "sku", on: true }, { key: "x_check", on: true }] });
    expect(html).toContain("<th>สินค้า</th><th class=\"mono\">SKU</th><th class=\"c xb\">ตรวจแล้ว</th>");
    expect(html).not.toContain("รหัส MO");
  });

  it("groups by brand with a subtotal, page breaks and signature", () => {
    const r = run("pending", { groupBy: "brand", pageBreakPerGroup: true, signature: true });
    expect(r.html).toContain("Good Goods");
    expect(r.html).toContain("รวมรอจ่ายทั้งหมด");
    expect(r.html.match(/grp-break/g)?.length).toBeGreaterThanOrEqual(1);
    expect(r.html).toContain("ผู้รับงาน");
    expect(r.groupCounts).toEqual([2, 1, 1]);
  });

  it("uses a custom title and company header", () => {
    const html = buildWorkBoardPrint({
      type: "piece", group: "__all__", board: BOARD, moGroups: [], plan: null, assignees: { craftsmen: [], dept_wages: {} },
      settings: { ...defaultListPrintSettings(workBoardPrintColumns("piece")), title: "ใบเหมาโต๊ะ B" },
      origin: "https://erp.test", company: { id: "c", name: "บริษัท ตัวอย่าง", logo_key: "logo.png" }, printedAt: "31/10/2569",
    }).html;
    expect(html).toContain("ใบเหมาโต๊ะ B");
    expect(html).toContain("บริษัท ตัวอย่าง");
    expect(html).toContain("<title>ใบเหมาโต๊ะ B - 31-10-2569</title>");
  });
});
