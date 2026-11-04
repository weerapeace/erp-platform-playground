import { describe, expect, it } from "vitest";
import { shapePlatformSales, salesPeriod, PLATFORM_SALES_SOURCE } from "@/lib/email-report/source-platform-sales";
import { normalizeReportOptions, normalizeReportInput, normalizeReportLine, sourceChannels } from "@/lib/email-report/shared";
import { renderReportEmail, sizedImage, tableText } from "@/lib/email-report/render";
import { reportExcel } from "@/lib/email-report/excel";
import { composeLineReport } from "@/lib/email-report/line";
import { isDue } from "@/lib/email-report/send";
import { shortProductName, type PlatformSales, type SalesLine } from "@/lib/platform-sales/server";
import * as XLSX from "xlsx";

// ยอดขายแพลตฟอร์ม → รายงานแบบตาราง (อีเมล / LINE / Discord) — ตัวเลขชุดเดียวกับหน้า /master/platform-sales
const line = (p: Partial<SalesLine> & { title: string; qty: number; amt: number }): SalesLine =>
  ({ shop: "Shopee LYP", code: null, color: null, match: "sku", image: null, sku_id: null, parent: null, platform: "Shopee", ...p });
const LYP14 = { code: "LYP14", name: "Louis Montini (Lyon) กระเป๋าเป้ LYP14" };

const SALES: PlatformSales = {
  platforms: [], brands: [],
  summary: { orders: 12, cancelled: 2, qty: 15, amount: 10000, no_price_orders: 1, pending_items: 1, returns: 0, from_email: 12 },
  by_shop: [
    { shop: "Shopee LYP", orders: 8, qty: 10, amount: 7000 },
    { shop: "Shopee MGN", orders: 4, qty: 5, amount: 3000 },
  ],
  lines: [
    line({ title: "กระเป๋าเป้ LYP14", code: "LYP14-01", color: "ดำ (01)", qty: 2, amt: 5000, image: "/api/r2-image?key=skus%2Flyp14.jpg", sku_id: "s1", parent: LYP14 }),
    line({ title: "กระเป๋าสะพาย MGN237", code: "MGN237-02", color: "น้ำตาลเข้ม (02)", shop: "Shopee MGN", platform: "Lazada", qty: 5, amt: 3000, sku_id: "s2", parent: { code: "MGN237", name: null } }),
    line({ title: "เป้ TTM061", code: "TTM061", match: "model", qty: 6, amt: 1500, parent: { code: "TTM061", name: null } }),
    line({ title: "PK09 กระเป๋าใบเล็ก", match: "none", color: "ชมพู", qty: 2, amt: 500 }),
  ],
  daily: [],
};
const PREV = { orders: 10, cancelled: 0, qty: 12, amount: 8000, no_price_orders: 0, pending_items: 0, returns: 0, from_email: 10 };
const PREV_SALES: PlatformSales = { ...SALES, summary: PREV, by_shop: [], lines: [line({ title: "กระเป๋าเป้ LYP14", code: "LYP14-01", color: "ดำ (01)", qty: 1, amt: 2500 })] };
const INFO = salesPeriod("yesterday", new Date("2026-11-04T05:00:00Z"));   // 12:00 น. ไทย วันที่ 4 → ยอดวันที่ 3
const opts = (o: Record<string, unknown> = {}) => normalizeReportOptions(PLATFORM_SALES_SOURCE, o);
type Extra = { prev?: PlatformSales | null; sales?: PlatformSales; stock?: Map<string, number> | null; mtd?: { amount: number } | null };
const build = (o: Record<string, unknown> = {}, x: Extra = {}) =>
  shapePlatformSales({ info: INFO, sales: x.sales ?? SALES, prev: x.prev === undefined ? PREV_SALES : x.prev, mtd: x.mtd === undefined ? { amount: 50000 } : x.mtd, stock: x.stock ?? null }, opts(o));
type Built = ReturnType<typeof build>;
const codes = (b: Built) => b.table!.sections.flatMap((s) => s.rows.map((r) => r.cells.code));

describe("ช่วงเวลา", () => {
  it("เมื่อวาน / 7 วัน / เดือนที่แล้ว — ขอบเวลาไทย + ช่วงก่อนหน้า + ลิงก์", () => {
    const now = new Date("2026-11-04T05:00:00Z");
    expect(INFO).toMatchObject({ start: "2026-11-03", end: "2026-11-03", prevWord: "วันก่อน", link: "/master/platform-sales?date=2026-11-03" });
    expect(INFO.range).toEqual({ from: "2026-11-02T17:00:00.000Z", to: "2026-11-03T17:00:00.000Z" });
    expect(INFO.mtdRange).toEqual({ from: "2026-10-31T17:00:00.000Z", to: "2026-11-03T17:00:00.000Z" });
    const w = salesPeriod("last7", now);
    expect(w).toMatchObject({ start: "2026-10-28", end: "2026-11-03", prevWord: "7 วันก่อน", totalLabel: "รวม 7 วัน" });
    expect(w.range.from).toBe("2026-10-27T17:00:00.000Z");
    expect(w.prevRange).toEqual({ from: "2026-10-20T17:00:00.000Z", to: "2026-10-27T17:00:00.000Z" });
    const m = salesPeriod("last_month", now);
    expect(m).toMatchObject({ start: "2026-10-01", end: "2026-10-31", mtdRange: null, link: "/master/platform-sales?month=2026-10" });
    expect(m.prevRange.from).toBe("2026-08-31T17:00:00.000Z");
  });

  it("รายงานเดือนที่แล้ว ส่งเฉพาะวันที่ 1 (ไม่ดูวันในสัปดาห์)", () => {
    const r = { is_enabled: true, days: [3], send_time: "09:00", last_sent_on: null, filters: { day: "last_month" } };
    expect(isDue(r, new Date("2026-12-01T02:30:00Z"))).toBe(true);    // 1 ธ.ค. 09:30 น. (วันอังคาร)
    expect(isDue(r, new Date("2026-11-04T02:30:00Z"))).toBe(false);   // วันพุธแต่ไม่ใช่วันที่ 1
    expect(isDue({ ...r, filters: null }, new Date("2026-11-04T02:30:00Z"))).toBe(true);
  });
});

describe("shapePlatformSales", () => {
  it("เรียงตามยอดเงิน · ตัวเลขเทียบวันก่อน · ยอดสะสมเดือน", () => {
    const b = build();
    expect(codes(b)).toEqual(["LYP14-01", "MGN237-02", "TTM061", "—"]);
    const amount = b.stats.find((s) => s.label === "ยอดขาย")!;
    expect(amount.display).toBe("฿10,000");
    expect(amount.hint).toBe("+25% จากวันก่อน");
    expect(b.stats.find((s) => s.label === "ออเดอร์")!.hint).toBe("วันก่อน 10");
    expect(b.stats.find((s) => s.label.startsWith("ยอดสะสม"))!.display).toBe("฿50,000");
    expect(b.viewAllLink).toMatch(/\/master\/platform-sales\?date=2026-11-03$/);
    expect(b.tokens["ยอด"]).toBe("10,000");
  });

  it("เป้ารายเดือน → % ของเป้า · ไม่ได้ขอยอดสะสม = ไม่มีกล่อง", () => {
    expect(build({ monthly_target: 100000 }).stats.find((s) => s.label.startsWith("ยอดสะสม"))!.hint).toBe("50% ของเป้า ฿100,000");
    expect(build({}, { mtd: null }).stats.some((s) => s.label.startsWith("ยอดสะสม"))).toBe(false);
  });

  it("เรียงตามจำนวน / รหัส", () => {
    expect(codes(build({ sort_by: "qty" }))).toEqual(["TTM061", "MGN237-02", "LYP14-01", "—"]);
    expect(codes(build({ sort_by: "code" }))).toEqual(["LYP14-01", "MGN237-02", "TTM061", "—"]);
  });

  it("ชื่อสั้น (ค่าเริ่ม) ตัดแบรนด์/รหัสท้าย · ชื่อเต็มมีป้ายท้าย", () => {
    expect(shortProductName("Louis Montini (Shiisaa) กระเป๋าสตางค์ผู้ชายหนังวัวแท้ TTM121")).toBe("Shiisaa กระเป๋าสตางค์ผู้ชายหนังวัวแท้");
    expect(shortProductName("Louis Montini (Formal Wallet) กระเป๋าสตางค์ผู้หญิงหนังวัวแท้ กระเป๋าพับยาว WL18", 20)).toBe("Formal Wallet กระเป…");
    const full = build({ short_names: false }).table!.sections[0].rows;
    expect(full[2].cells.name).toBe("เป้ TTM061 (ไม่แยกสี)");
    expect(full[3].cells.name).toBe("PK09 กระเป๋าใบเล็ก (ยังไม่จับคู่ SKU)");
    expect(build().table!.sections[0].rows[0].cells.name).toBe("กระเป๋าเป้");
  });

  it("จัดกลุ่มตาม Parent SKU: หัวกลุ่ม = รุ่น + ยอด · SKU อยู่ในกลุ่ม · ยังไม่จับคู่อยู่ท้าย", () => {
    const two: PlatformSales = { ...SALES, lines: [...SALES.lines, line({ title: "กระเป๋าเป้ LYP14", code: "LYP14-02", color: "กรม (02)", qty: 1, amt: 2600, sku_id: "s3", parent: LYP14 })] };
    const b = build({ group_by: "parent" }, { sales: two });
    expect(b.table!.sections.map((s) => s.label)).toEqual([
      "LYP14 · Lyon กระเป๋าเป้ — 3 ชิ้น · ฿7,600 · 2 SKU", "MGN237 — 5 ชิ้น · ฿3,000", "TTM061 — 6 ชิ้น · ฿1,500", "ยังไม่จับคู่ SKU — 2 ชิ้น · ฿500",
    ]);
    expect(b.table!.sections[0].rows.map((r) => r.cells.code)).toEqual(["LYP14-01", "LYP14-02"]);
  });

  it("รวมทุกสีเป็นรุ่น = แถวเดียวต่อรุ่น", () => {
    const two: PlatformSales = { ...SALES, lines: [...SALES.lines, line({ title: "กระเป๋าเป้ LYP14", code: "LYP14-02", color: "กรม (02)", qty: 1, amt: 2600, sku_id: "s3", parent: LYP14 })] };
    const b = build({ group_by: "model" }, { sales: two });
    const first = b.table!.sections[0].rows[0];
    expect(first.cells).toMatchObject({ code: "LYP14", color: "2 สี", qty: "3", amt: "฿7,600" });
    expect(b.total).toBe(4);
  });

  it("แยกตามร้าน / แพลตฟอร์ม · จำกัดแถวรวมทุกกลุ่ม", () => {
    const shop = build({ group_by: "shop" });
    expect(shop.table!.sections.map((s) => [s.label.split(" — ")[0], s.rows.length])).toEqual([["Shopee LYP", 3], ["Shopee MGN", 1]]);
    expect(build({ group_by: "platform" }).table!.sections.map((s) => s.label.split(" — ")[0])).toEqual(["Shopee", "Lazada"]);
    const many: PlatformSales = { ...SALES, lines: [...SALES.lines, ...[1, 2, 3].map((i) => line({ title: `LYP0${i}`, code: `LYP0${i}-01`, qty: 1, amt: 100 * i }))] };
    const b = build({ group_by: "shop", max_rows: 5 }, { sales: many });
    expect(b.table!.sections.map((s) => s.rows.length)).toEqual([5]);
    expect(b.shown).toBe(5);
  });

  it("เทียบวันก่อนรายสินค้า: ▲ เพิ่ม · ใหม่ · ไม่มีข้อมูลวันก่อน = ว่าง", () => {
    const rows = build().table!.sections[0].rows;
    expect(rows[0].cells.diff).toBe("▲1");
    expect(rows[0].tones?.diff).toBe("good");
    expect(rows[1].cells.diff).toBe("ใหม่");
    expect(build({}, { prev: null }).table!.sections[0].rows[0].cells.diff).toBe("");
  });

  it("สต๊อกคงเหลือ + เตือนของขายดีใกล้หมด (เฉพาะที่มีข้อมูลสต๊อก)", () => {
    const b = build({ row_fields: ["code", "qty", "stock"], low_stock: 3 }, { stock: new Map([["s1", 2], ["s2", 40]]) });
    const rows = b.table!.sections[0].rows;
    expect(rows[0].cells.stock).toBe("2");
    expect(rows[0].tones?.stock).toBe("danger");
    expect(rows[1].cells.stock).toBe("40");
    expect(rows[2].cells.stock).toBe("–");
    expect(b.alerts).toEqual([{ tone: "warn", text: "ของขายดีใกล้หมด (เหลือ ≤ 3 ชิ้น): LYP14-01 เหลือ 2" }]);
    expect(build({ low_stock: 0 }, { stock: new Map([["s1", 2]]) }).alerts).toEqual([]);
    expect(build({}, { stock: new Map() }).alerts).toEqual([]);
  });

  it("ซ่อนรายการยังไม่จับคู่ (ยอดรวมไม่เปลี่ยน) · เปลี่ยนชื่อหัวคอลัมน์", () => {
    const b = build({ hide_unmatched: true, col_labels: { qty: "ชิ้น", amt: "" } });
    expect(codes(b)).not.toContain("—");
    expect(b.table!.total).toMatchObject({ qty: "15", amt: "฿10,000" });
    expect(b.table!.columns.find((c) => c.key === "qty")!.label).toBe("ชิ้น");
    expect(b.table!.columns.find((c) => c.key === "amt")!.label).toBe("ยอด");
  });

  it("แถวรวม + % ของยอด · ปิดแถวรวมได้ · ขนาดรูป", () => {
    const b = build({ row_fields: ["code", "name", "qty", "amt", "pct"], img_size: "l" });
    expect(b.table!.total).toMatchObject({ qty: "15", amt: "฿10,000", pct: "100%", diff: "▲3" });
    expect(b.table!.sections[0].rows[0].cells.pct).toBe("50%");
    expect(b.table!.imgSize).toBe(56);
    expect(build({ show_total: false }).table!.total).toBeNull();
  });

  it("ไม่มีช่วงก่อน = ไม่มีคำเทียบ", () => {
    expect(build({}, { prev: null }).stats.find((s) => s.label === "ยอดขาย")!.hint).toBeUndefined();
  });
});

describe("ตารางกลางในอีเมล", () => {
  it("อีเมลวาดตาราง + แถวรวม + ข้อความล้วน + กล่องเตือน", () => {
    const b = build({ row_fields: ["code", "name", "qty", "amt", "diff"] }, { stock: new Map([["s1", 1]]) });
    const mail = renderReportEmail(b, { reportName: "ยอดขายแพลตฟอร์ม", scheduleLabel: "ทุกวัน · 09:00 น.", manageUrl: null, now: new Date("2026-11-04T02:00:00Z") });
    expect(mail.html).toContain("LYP14-01");
    expect(mail.html).toContain("รวมทั้งวัน");
    expect(mail.html).toContain("฿10,000");
    expect(mail.html).toContain("color:#059669;");   // ▲ สีเขียว
    expect(mail.html).toContain("ของขายดีใกล้หมด");
    expect(mail.text).toContain("LYP14-01");
    expect(tableText(b.table!).join("\n")).toContain("รวมทั้งวัน");
  });
});

describe("LINE", () => {
  it("แบบรายการ: หัว + สรุป + N อันดับ + ที่เหลือ + ปุ่มดูทั้งหมด", () => {
    const b = build({ row_fields: ["img", "code", "name", "color", "qty", "amt"] });
    const m = composeLineReport(b, { max_rows: 3, style: "list" }, { subject: "ยอดขาย" });
    expect(m.rows).toHaveLength(3);
    expect(m.rows[0]).toEqual({ left: "LYP14-01 กระเป๋าเป้ ดำ (01)", right: "2 · ฿5,000" });
    expect(m.more).toBe(1);
    expect(m.text).toContain("…และอีก 1 รายการ");
    expect(m.sub[0]).toContain("ยอดขาย ฿10,000 (+25% จากวันก่อน)");
    expect((m.flex as { type: string }).type).toBe("bubble");
    expect(m.style).toBe("list");
  });

  it("ส่งทดสอบมีคำนำหน้า · วันที่ไม่มีออเดอร์โชว์ข้อความว่าง", () => {
    const empty = build({}, { sales: { ...SALES, lines: [], by_shop: [], summary: { ...SALES.summary, orders: 0, qty: 0, amount: 0 } }, prev: null, mtd: null });
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

  it("เปิด LINE แต่ไม่เลือกกลุ่ม = บันทึกไม่ได้ · ช่วงเวลาเก็บได้", () => {
    const base = { name: "ยอดขาย", source_key: PLATFORM_SALES_SOURCE, days: [1, 2, 3], send_time: "09:00", email_enabled: false, recipients: [] };
    const r = normalizeReportInput({ ...base, line: { enabled: true, group_id: null } });
    expect("error" in r && r.error).toContain("เลือกกลุ่ม LINE");
    const ok = normalizeReportInput({ ...base, filters: { day: "last_month" } });
    expect("value" in ok && ok.value.filters.day).toBe("last_month");
    const bad = normalizeReportInput({ ...base, filters: { day: "bogus" } });
    expect("value" in bad && bad.value.filters.day).toBeUndefined();
  });
});

describe("รูป + แยกหน้าตาแต่ละช่อง", () => {
  it("ค่าเริ่มต้นแบบตาราง · แหล่งแบบรายการงานไม่เปลี่ยน", () => {
    expect(opts()).toMatchObject({ max_rows: 500, top_photos: 3, attach_excel: true, short_names: true, img_size: "m", hide_unmatched: false, monthly_target: 0, low_stock: 3 });
    expect(normalizeReportOptions("design_sheets_pending", {})).toMatchObject({ max_rows: 50, top_photos: 0, attach_excel: false, short_names: false });
    expect(normalizeReportLine({}).style).toBe("cards");
    expect(normalizeReportLine({ style: "list" }).style).toBe("list");
  });

  it("ขายดี (spotlight) + Excel ทุกรายการ (มี Parent SKU / เทียบช่วงก่อน / สต๊อก)", () => {
    const b = build({}, { stock: new Map([["s1", 7]]) });
    expect(b.spotlight!.map((x) => x.title)).toEqual(["LYP14-01", "MGN237-02", "TTM061", "PK09 กระเป๋าใบเล็ก"]);
    expect(b.spotlight![0]).toMatchObject({ rank: 1, value: "2 ชิ้น · ฿5,000" });
    expect(b.spotlight![0].imageUrl).toMatch(/^https:\/\/.+\/api\/r2-image\?key=/);
    expect(b.spotlight![3].sub).toContain("ยังไม่จับคู่ SKU");
    expect(b.export!.rows).toHaveLength(4);
    expect(b.export!.rows[0]).toMatchObject({ parent: "LYP14", code: "LYP14-01", prev: 1, stock: 7 });
    expect(b.export!.filename).toBe("ยอดขายแพลตฟอร์ม-2026-11-03.xlsx");
  });

  it("ย่อรูปเป็น JPEG สี่เหลี่ยม (LINE/Outlook ไม่รับ webp) · ลิงก์อื่นไม่แตะ", () => {
    expect(sizedImage("https://x.app/api/r2-image?key=a.jpg", 300)).toBe("https://x.app/api/r2-image?key=a.jpg&w=300&sq=1");
    expect(sizedImage("https://x.app/api/r2-image?key=a.jpg&w=80", 300)).toBe("https://x.app/api/r2-image?key=a.jpg&w=80");
    expect(sizedImage("https://cdn.example.com/a.png", 300)).toBe("https://cdn.example.com/a.png");
    expect(sizedImage(null, 300)).toBeNull();
  });

  it("อีเมล: แถบขายดีรูปใหญ่เหนือตาราง (ปิดได้)", () => {
    const b = build({ row_fields: ["img", "code", "name", "qty", "amt"] });
    const on = renderReportEmail(b, { reportName: "ยอดขาย", scheduleLabel: "ทุกวัน", manageUrl: null, topPhotos: 3 });
    expect(on.html).toContain("#1 LYP14-01");
    expect(on.html).toContain("&amp;w=300&amp;sq=1");
    expect(on.html).toContain("ไม่มีรูป");
    expect(renderReportEmail(b, { reportName: "ยอดขาย", scheduleLabel: "ทุกวัน", manageUrl: null, topPhotos: 0 }).html).not.toContain("#1 LYP14-01");
  });

  it("LINE แบบการ์ด: การ์ดสรุป + การ์ดสินค้ารูปใหญ่ (ยัง 1 ข้อความ)", () => {
    const m = composeLineReport(build(), { max_rows: 3, style: "cards" }, { subject: "ยอดขาย" });
    const flex = m.flex as { type: string; contents: { hero?: { type: string; url?: string } }[] };
    expect(m.style).toBe("cards");
    expect(flex.type).toBe("carousel");
    expect(flex.contents).toHaveLength(4);
    expect(flex.contents[1].hero).toMatchObject({ type: "image" });
    expect(flex.contents[1].hero!.url).toMatch(/&w=600&sq=1$/);
    expect(flex.contents[2].hero!.type).toBe("box");
    expect(m.cards.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it("Excel: หัวคอลัมน์ + ทุกแถว · ตัวเลขเป็นตัวเลข", async () => {
    const buf = await reportExcel(build().export!);
    const wb = XLSX.read(buf, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ "รหัส": "LYP14-01", "Parent SKU": "LYP14", "จำนวน (ชิ้น)": 2, "ยอด (บาท)": 5000 });
  });
});
