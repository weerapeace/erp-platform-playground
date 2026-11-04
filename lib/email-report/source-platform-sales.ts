/**
 * 📈 แหล่งข้อมูลรายงานอัตโนมัติ "ยอดขายแพลตฟอร์มรายวัน" (Shopee / Lazada) — ฝั่งเซิร์ฟเวอร์
 * หน้าตาแบบตาราง (layout "table" · ReportTable กลาง) → อีเมล / รูป Discord / กล่อง LINE วาดจากตัวเดียวกัน
 * ตัวนับ = ของกลาง lib/platform-sales/server (ตัวเดียวกับหน้า /master/platform-sales) → ตัวเลขตรงกันเสมอ
 * ลงทะเบียนใน SOURCES (lib/email-report/sources) + ประกาศตัวเลือกใน EMAIL_REPORT_SOURCES (lib/email-report/shared)
 * ทดสอบ shapeDailySales ที่ lib/__tests__/email-report-platform-sales.test.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { absoluteUrl } from "@/lib/app-url";
import { dayBoundsTh, loadPlatformSales, thaiDate, type PlatformSales, type SalesLine } from "@/lib/platform-sales/server";
import { sourceDef, type EmailReportFilters, type ResolvedReportOptions } from "@/lib/email-report/shared";
import type { BuiltReport, ReportExport, ReportSpotlight, ReportStat, ReportTable, ReportTableColumn } from "@/lib/email-report/render";

type Admin = ReturnType<typeof supabaseAdmin>;
export const PLATFORM_SALES_SOURCE = "platform_sales_daily";

const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const baht = (n: number) => `฿${num(n)}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const RIGHT = new Set(["qty", "amt", "pct"]);
const dateLong = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateShort = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
const change = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

/** จัดข้อมูลยอดขายของวัน → รายงาน (pure) */
export function shapeDailySales(input: { date: string; day: "yesterday" | "today"; sales: PlatformSales; prev: PlatformSales["summary"] | null }, opts: ResolvedReportOptions): BuiltReport {
  const { date, sales, prev } = input;
  const s = sales.summary;
  const src = sourceDef(PLATFORM_SALES_SOURCE);
  const fields = opts.row_fields.length ? opts.row_fields : ["name", "qty", "amt"];
  const columns: ReportTableColumn[] = fields.map((k) => ({ key: k, label: src.rowFields.find((f) => f.key === k)?.label ?? k, align: RIGHT.has(k) ? "right" : "left" }));

  // เรียง + จัดกลุ่ม (กลุ่มร้านเรียงตามยอดร้าน) · โชว์ไม่เกิน max_rows ข้ามกลุ่ม
  const byAmt = (a: SalesLine, b: SalesLine) => b.amt - a.amt || b.qty - a.qty;
  const byQty = (a: SalesLine, b: SalesLine) => b.qty - a.qty || b.amt - a.amt;
  const lines = [...sales.lines].sort(opts.sort_by === "qty" ? byQty : byAmt);
  const groups: { key: string; label: string; lines: SalesLine[] }[] = [];
  if (opts.group_by === "shop") {
    for (const shop of sales.by_shop.map((b) => b.shop)) groups.push({ key: shop, label: shop, lines: lines.filter((l) => l.shop === shop) });
  } else groups.push({ key: "all", label: "", lines });

  const cells = (l: SalesLine): Record<string, string> => ({
    code: l.code ?? "—",
    name: clip(`${l.title}${l.match === "none" ? " (ยังไม่จับคู่ SKU)" : l.match === "model" ? " (ไม่แยกสี)" : ""}`, 70),
    color: l.color ?? "",
    shop: l.shop,
    qty: num(l.qty),
    amt: l.amt > 0 ? baht(l.amt) : "—",
    pct: s.amount > 0 && l.amt > 0 ? `${Math.round((l.amt / s.amount) * 100)}%` : "—",
  });
  let shown = 0;
  const sections: ReportTable["sections"] = [];
  for (const g of groups) {
    if (shown >= opts.max_rows) break;
    const rows = [];
    for (const l of g.lines) {
      if (shown >= opts.max_rows) break;
      rows.push({ id: `${g.key}|${l.code ?? l.title}|${l.color ?? ""}`, imageUrl: l.image ? absoluteUrl(l.image) : null, link: null, cells: cells(l) });
      shown++;
    }
    if (rows.length) sections.push({ key: g.key, label: g.label, rows });
  }
  const table: ReportTable = {
    columns, sections, totalLabel: "รวมทั้งวัน",
    total: opts.show_total ? { qty: num(s.qty), amt: baht(s.amount), pct: s.amount > 0 ? "100%" : "—" } : null,
  };

  // ตัวเลขสรุป (เรียงตามที่แหล่งข้อมูลประกาศ · เลือกเปิด/ปิดได้)
  const amtChange = prev ? change(s.amount, prev.amount) : null;
  const STAT: Record<string, ReportStat> = {
    orders: { label: "ออเดอร์", value: s.orders, ...(prev ? { hint: `วันก่อน ${num(prev.orders)}` } : {}) },
    qty: { label: "ชิ้น", value: s.qty, ...(prev ? { hint: `วันก่อน ${num(prev.qty)}` } : {}) },
    amount: { label: "ยอดขาย", value: s.amount, display: baht(s.amount), tone: "good", ...(amtChange !== null ? { hint: `${amtChange >= 0 ? "+" : ""}${amtChange}% จากวันก่อน` } : {}) },
    cancelled: { label: "ยกเลิก", value: s.cancelled, hint: "ไม่นับในยอด", ...(s.cancelled ? { tone: "muted" as const } : {}) },
    lazada: { label: "ไม่มีราคา (Lazada)", value: s.no_price_orders, hint: "เมลไม่บอกราคา" },
    pending: { label: "รอยืนยัน SKU", value: s.pending_items, ...(s.pending_items ? { tone: "warn" as const } : {}) },
  };
  const stats = opts.stats.map((k) => STAT[k]).filter(Boolean);

  // 🖼 ขายดี (ตามที่ตั้งเรียง · ข้ามร้าน) ≤9 ชิ้น — อีเมลแถบรูป · LINE การ์ดปัดดู · Discord กริดรูป
  const spotlight: ReportSpotlight[] = lines.slice(0, 9).map((l, i) => ({
    rank: i + 1,
    title: l.code ?? clip(l.title, 28),
    sub: [l.match === "none" ? "ยังไม่จับคู่ SKU" : l.match === "model" ? "ไม่แยกสี" : l.color, l.code ? clip(l.title, 40) : null].filter(Boolean).join(" · "),
    value: `${num(l.qty)} ชิ้น${l.amt > 0 ? ` · ${baht(l.amt)}` : ""}`,
    imageUrl: l.image ? absoluteUrl(l.image) : null,
    link: null,
  }));
  // 📎 Excel: ทุกรายการ (ไม่ตัดตาม max_rows) เรียงตามที่ตั้ง · ตัวเลขเป็น number
  const exportData: ReportExport = {
    filename: `ยอดขายแพลตฟอร์ม-${date}.xlsx`, sheet: date,
    columns: [
      { key: "shop", header: "ร้าน" }, { key: "code", header: "รหัส" }, { key: "name", header: "สินค้า" }, { key: "color", header: "สี" },
      { key: "match", header: "จับคู่" }, { key: "qty", header: "จำนวน (ชิ้น)" }, { key: "amt", header: "ยอด (บาท)" },
    ],
    rows: lines.map((l) => ({
      shop: l.shop, code: l.code, name: l.title, color: l.color,
      match: l.match === "sku" ? "SKU" : l.match === "model" ? "รุ่น (ไม่แยกสี)" : "ยังไม่จับคู่",
      qty: l.qty, amt: Math.round(l.amt * 100) / 100,
    })),
  };

  const dayWord = input.day === "today" ? "วันนี้" : "เมื่อวาน";
  const fill = (k: string) => sales.lines.filter((l) => (k === "img" ? !!l.image : k === "code" ? !!l.code : k === "color" ? !!l.color : true)).length;
  return {
    heading: `ยอดขายแพลตฟอร์ม · ${dateLong(date)}`,
    subjectCore: `ยอดขายแพลตฟอร์ม ${dateShort(date)} · ${baht(s.amount)}`,
    total: sales.lines.length,
    shown,
    stats,
    showImages: fields.includes("img"),
    sections: [],
    table,
    spotlight,
    export: exportData,
    unit: "รายการ",
    viewAllLink: absoluteUrl(`/master/platform-sales?date=${date}`),
    viewAllLabel: "ดูรายงานเต็มใน ERP",
    emptyText: `${dayWord} (${dateShort(date)}) ยังไม่มีออเดอร์จากแพลตฟอร์ม`,
    tokens: { "วันของยอด": dateShort(date), "ยอด": num(s.amount), "ออเดอร์": s.orders, "ชิ้น": s.qty, "จำนวน": sales.lines.length },
    fieldFill: Object.fromEntries(src.rowFields.map((f) => [f.key, fill(f.key)])),
    overdue: 0,
  };
}

/** ดึงยอดของวัน (เมื่อวาน/วันนี้ ตามเวลาไทย) + วันก่อนหน้าไว้เทียบ */
export async function platformSalesDaily(admin: Admin, filters: EmailReportFilters, opts: ResolvedReportOptions): Promise<BuiltReport> {
  const day = filters.day === "today" ? "today" : "yesterday";
  const date = thaiDate(new Date(), day === "today" ? 0 : -1);
  const prevDate = thaiDate(`${date}T12:00:00+07:00`, -1);
  const [sales, prev] = await Promise.all([
    loadPlatformSales(admin, { range: dayBoundsTh(date) }),
    loadPlatformSales(admin, { range: dayBoundsTh(prevDate) }),
  ]);
  return shapeDailySales({ date, day, sales, prev: prev.summary }, opts);
}
