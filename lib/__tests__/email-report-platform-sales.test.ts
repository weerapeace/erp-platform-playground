import { describe, expect, it } from "vitest";
import { shapeDailySales, PLATFORM_SALES_SOURCE } from "@/lib/email-report/source-platform-sales";
import { normalizeReportOptions, normalizeReportInput, normalizeReportLine, sourceChannels } from "@/lib/email-report/shared";
import { renderReportEmail, tableText } from "@/lib/email-report/render";
import { composeLineReport } from "@/lib/email-report/line";
import type { PlatformSales, SalesLine } from "@/lib/platform-sales/server";

// ยอดขายแพลตฟอร์มรายวัน → รายงานแบบตาราง (อีเมล / LINE) — ตัวเลขชุดเดียวกับหน้า /master/platform-sales
const line = (p: Partial<SalesLine> & { title: string; qty: number; amt: number }): SalesLine =>
  ({ shop: "Shopee LYP", code: null, color: null, match: "sku", image: null, ...p });

const SALES: PlatformSales = {
  platforms: [], brands: [],
  summary: { orders: 12, cancelled: 2, qty: 15, amount: 10000, no_price_orders: 1, pending_items: 1, returns: 0, from_email: 12 },
  by_shop: [
    { shop: "Shopee LYP", orders: 8, qty: 10, amount: 7000 },
    { shop: "Shopee MGN", orders: 4, qty: 5, amount: 3000 },
  ],
  lines: [
    line({ title: "กระเป๋าเป้ LYP14", code: "LYP14-01", color: "ดำ (01)", qty: 2, amt: 5000 }),
    line({ title: "กระเป๋าสะพาย MGN237", code: "MGN237-02", color: "น้ำตาลเข้ม (02)", shop: "Shopee MGN", qty: 5, amt: 3000 }),
    line({ title: "เป้ TTM061", code: "TTM061", match: "model", qty: 6, amt: 1500 }),
    line({ title: "PK09 กระเป๋าใบเล็ก", match: "none", color: "ชมพู", qty: 2, amt: 500 }),
  ],
  daily: [],
};
const PREV = { orders: 10, cancelled: 0, qty: 12, amount: 8000, no_price_orders: 0, pending_items: 0, returns: 0, from_email: 10 };
const opts = (o: Record<string, unknown> = {}) => normalizeReportOptions(PLATFORM_SALES_SOURCE, o);
const build = (o: Record<string, unknown> = {}, prev: typeof PREV | null = PREV) =>
  shapeDailySales({ date: "2026-11-03", day: "yesterday", sales: SALES, prev }, opts(o));
const names = (b: ReturnType<typeof build>) => b.table!.sections.flatMap((s) => s.rows.map((r) => r.cells.code));

describe("shapeDailySales", () => {
  it("เรียงตามยอดเงินเป็นค่าเริ่มต้น · ตัวเลขสรุปเทียบวันก่อน", () => {
    const b = build();
    expect(names(b)).toEqual(["LYP14-01", "MGN237-02", "TTM061", "—"]);
    expect(b.table!.sections).toHaveLength(1);
    const amount = b.stats.find((s) => s.label === "ยอดขาย")!;
    expect(amount.display).toBe("฿10,000");
    expect(amount.hint).toBe("+25% จากวันก่อน");
    expect(b.stats.find((s) => s.label === "ออเดอร์")!.hint).toBe("วันก่อน 10");
    expect(b.viewAllLink).toMatch(/\/master\/platform-sales\?date=2026-11-03$/);
    expect(b.tokens["ยอด"]).toBe("10,000");
  });

  it("เรียงตามจำนวนชิ้นได้", () => {
    expect(names(build({ sort_by: "qty" }))).toEqual(["TTM061", "MGN237-02", "LYP14-01", "—"]);
  });

  it("ป้ายท้ายชื่อ: ไม่แยกสี / ยังไม่จับคู่ SKU", () => {
    const rows = build().table!.sections[0].rows;
    expect(rows[2].cells.name).toBe("เป้ TTM061 (ไม่แยกสี)");
    expect(rows[3].cells.name).toBe("PK09 กระเป๋าใบเล็ก (ยังไม่จับคู่ SKU)");
  });

  it("แยกตามร้าน = กลุ่มเรียงตามยอดร้าน · จำกัดจำนวนแถวรวมทุกกลุ่ม", () => {
    const many: PlatformSales = { ...SALES, lines: [...SALES.lines, ...[1, 2, 3].map((i) => line({ title: `LYP0${i}`, code: `LYP0${i}-01`, qty: 1, amt: 100 * i }))] };
    const b = shapeDailySales({ date: "2026-11-03", day: "yesterday", sales: many, prev: null }, opts({ group_by: "shop", max_rows: 5 }));
    expect(b.table!.sections.map((s) => [s.label, s.rows.length])).toEqual([["Shopee LYP", 5]]);
    expect(b.shown).toBe(5);
    expect(b.total).toBe(7);
    const all = build({ group_by: "shop" });
    expect(all.table!.sections.map((s) => [s.label, s.rows.length])).toEqual([["Shopee LYP", 3], ["Shopee MGN", 1]]);
  });

  it("แถวรวม + % ของยอด · ปิดแถวรวมได้", () => {
    const b = build({ row_fields: ["code", "name", "qty", "amt", "pct"] });
    expect(b.table!.total).toEqual({ qty: "15", amt: "฿10,000", pct: "100%" });
    expect(b.table!.sections[0].rows[0].cells.pct).toBe("50%");
    expect(build({ show_total: false }).table!.total).toBeNull();
  });

  it("ไม่มีวันก่อน = ไม่มีคำเทียบ", () => {
    const b = build({}, null);
    expect(b.stats.find((s) => s.label === "ยอดขาย")!.hint).toBeUndefined();
  });
});

describe("ตารางกลางในอีเมล", () => {
  it("อีเมลวาดตาราง + แถวรวม + ข้อความล้วน", () => {
    const b = build({ row_fields: ["code", "name", "qty", "amt"] });
    const mail = renderReportEmail(b, { reportName: "ยอดขายแพลตฟอร์ม", scheduleLabel: "ทุกวัน · 09:00 น.", manageUrl: null, now: new Date("2026-11-04T02:00:00Z") });
    expect(mail.html).toContain("LYP14-01");
    expect(mail.html).toContain("รวมทั้งวัน");
    expect(mail.html).toContain("฿10,000");
    expect(mail.text).toContain("LYP14-01");
    const txt = tableText(b.table!).join("\n");
    expect(txt).toContain("รวมทั้งวัน");
  });
});

describe("LINE", () => {
  it("1 ข้อความ: หัว + สรุป + N อันดับ + ที่เหลือ + ปุ่มดูทั้งหมด", () => {
    const b = build({ row_fields: ["img", "code", "name", "color", "qty", "amt"] });
    const m = composeLineReport(b, { max_rows: 3 }, { subject: "ยอดขาย" });
    expect(m.rows).toHaveLength(3);
    expect(m.rows[0]).toEqual({ left: "LYP14-01 กระเป๋าเป้ LYP14 ดำ (01)", right: "2 · ฿5,000" });
    expect(m.more).toBe(1);
    expect(m.text).toContain("…และอีก 1 รายการ");
    expect(m.sub[0]).toContain("ยอดขาย ฿10,000 (+25% จากวันก่อน)");
    const flex = m.flex as { type: string; footer?: unknown };
    expect(flex.type).toBe("bubble");
    expect(m.link ? !!flex.footer : true).toBe(true);
  });

  it("ส่งทดสอบมีคำนำหน้า · วันที่ไม่มีออเดอร์โชว์ข้อความว่าง", () => {
    const empty = shapeDailySales({ date: "2026-11-03", day: "yesterday", sales: { ...SALES, lines: [], by_shop: [], summary: { ...SALES.summary, orders: 0, qty: 0, amount: 0 } }, prev: null }, opts());
    const m = composeLineReport(empty, { max_rows: 5 }, { subject: "x", test: true });
    expect(m.header.startsWith("🧪 ทดสอบ · ")).toBe(true);
    expect(m.rows).toHaveLength(0);
    expect(m.text).toContain("ยังไม่มีออเดอร์จากแพลตฟอร์ม");
  });

  it("ตั้งค่า LINE: กลุ่มต้องเป็นรหัสกลุ่มจริง · จำนวนอันดับไม่เกิน 10", () => {
    const gid = `C${"a".repeat(32)}`;
    expect(normalizeReportLine({ enabled: true, group_id: gid, max_rows: 50 })).toMatchObject({ enabled: true, group_id: gid, max_rows: 10 });
    expect(normalizeReportLine({ enabled: true, group_id: "U123" }).group_id).toBeNull();
    expect(normalizeReportLine(null).max_rows).toBe(5);
  });

  it("รายงานยอดแพลตฟอร์มส่งได้ 3 ช่อง (ไม่มีกล่องเด้งใน ERP)", () => {
    expect(sourceChannels(PLATFORM_SALES_SOURCE).map((c) => c.key)).toEqual(["email", "line", "discord"]);
  });

  it("เปิด LINE แต่ไม่เลือกกลุ่ม = บันทึกไม่ได้", () => {
    const r = normalizeReportInput({
      name: "ยอดขายรายวัน", source_key: PLATFORM_SALES_SOURCE, days: [1, 2, 3], send_time: "09:00",
      email_enabled: false, recipients: [], line: { enabled: true, group_id: null },
    });
    expect("error" in r && r.error).toContain("เลือกกลุ่ม LINE");
  });
});
