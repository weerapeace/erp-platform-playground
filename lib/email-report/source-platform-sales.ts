/**
 * 📈 แหล่งข้อมูลรายงานอัตโนมัติ "ยอดขายแพลตฟอร์ม" (Shopee / Lazada) — ฝั่งเซิร์ฟเวอร์
 * หน้าตาแบบตาราง (layout "table" · ReportTable กลาง) → อีเมล / รูป Discord / LINE วาดจากตัวเดียวกัน
 * ตัวนับ = ของกลาง lib/platform-sales/server (ตัวเดียวกับหน้า /master/platform-sales) → ตัวเลขตรงกันเสมอ
 * ลงทะเบียนใน SOURCES (lib/email-report/sources) + ประกาศตัวเลือกใน EMAIL_REPORT_SOURCES (lib/email-report/shared)
 *
 * ช่วง (filters.day): เมื่อวาน / วันนี้ / 7 วันล่าสุด / เดือนที่แล้ว — เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน
 * จัดกลุ่ม: รวม · ตาม Parent SKU (หัวกลุ่ม = รุ่น + ยอดรวม · แถว = SKU ในรุ่น) · รวมทุกสีเป็นรุ่น · แพลตฟอร์ม · ร้าน
 * คอลัมน์เพิ่ม: เทียบช่วงก่อน (▲▼ ชิ้น) · สต๊อกเหลือ (lib/sku-stock) · ตัวเลข: ยอดสะสมเดือนนี้ + % ของเป้า · เฉลี่ยต่อออเดอร์
 * เตือน: ของขายดีที่สต๊อกเหลือ ≤ low_stock ชิ้น (ต้องมีข้อมูลสต๊อกใน ERP)
 * ทดสอบที่ lib/__tests__/email-report-platform-sales.test.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { absoluteUrl } from "@/lib/app-url";
import { loadSkuStock } from "@/lib/sku-stock";
import {
  dayBoundsTh, daysBoundsTh, loadPlatformSales, monthBoundsTh, prevMonthKey, salesLineKey, shiftDateKey, shortProductName, thaiDate,
  type PlatformSales, type SalesLine, type SalesRange,
} from "@/lib/platform-sales/server";
import { IMG_SIZE_PX, sourceDef, type EmailReportFilters, type ReportPeriod, type ResolvedReportOptions } from "@/lib/email-report/shared";
import type { BuiltReport, ReportExport, ReportSpotlight, ReportStat, ReportTable, ReportTableColumn, ReportTableRow, ReportTone } from "@/lib/email-report/render";

type Admin = ReturnType<typeof supabaseAdmin>;
export const PLATFORM_SALES_SOURCE = "platform_sales_daily";

const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const baht = (n: number) => `฿${num(n)}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const RIGHT = new Set(["qty", "amt", "pct", "diff", "stock"]);
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const dateLong = (d: string) => utc(d).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateShort = (d: string) => utc(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
const monthLong = (ym: string) => utc(`${ym}-01`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = (ym: string) => utc(`${ym}-01`).toLocaleDateString("th-TH", { month: "short", year: "2-digit", timeZone: "UTC" });
const change = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const lastDayOf = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

/** ช่วงของรายงาน + ช่วงก่อนหน้าไว้เทียบ + ช่วงสะสมเดือนนี้ (pure · now = เวลาที่ส่ง) */
export type SalesPeriodInfo = {
  period: ReportPeriod; start: string; end: string;
  /** "วันอังคารที่ 3 พ.ย. 2569" / "28 ต.ค. – 3 พ.ย. 2569" / "ตุลาคม 2569" */
  label: string;
  /** สั้นสำหรับหัวเรื่อง: "3 พ.ย." / "28 ต.ค.–3 พ.ย." / "ต.ค. 69" */
  short: string;
  /** คำเทียบ: "วันก่อน" / "7 วันก่อน" / "เดือนก่อน" */
  prevWord: string;
  totalLabel: string;
  range: SalesRange; prevRange: SalesRange;
  /** ยอดสะสมตั้งแต่ต้นเดือนถึงวันสุดท้ายของช่วง (เดือนที่แล้ว = ไม่มี เพราะทั้งช่วงคือทั้งเดือน) */
  mtdRange: SalesRange | null; mtdMonth: string;
  link: string;
};
export function salesPeriod(period: ReportPeriod, now = new Date()): SalesPeriodInfo {
  if (period === "last_month") {
    const ym = prevMonthKey(thaiDate(now));
    const end = lastDayOf(ym);
    return {
      period, start: `${ym}-01`, end, label: monthLong(ym), short: monthShort(ym), prevWord: "เดือนก่อน", totalLabel: "รวมทั้งเดือน",
      range: monthBoundsTh(ym), prevRange: monthBoundsTh(prevMonthKey(ym)), mtdRange: null, mtdMonth: ym, link: `/master/platform-sales?month=${ym}`,
    };
  }
  const end = thaiDate(now, period === "today" ? 0 : -1);
  const ym = end.slice(0, 7);
  const mtdRange = { from: monthBoundsTh(ym).from, to: dayBoundsTh(end).to };
  if (period === "last7") {
    const start = shiftDateKey(end, -6);
    return {
      period, start, end, label: `${dateShort(start)} – ${dateShort(end)} ${end.slice(0, 4) === start.slice(0, 4) ? utc(end).toLocaleDateString("th-TH", { year: "numeric", timeZone: "UTC" }) : ""}`.trim(),
      short: `${dateShort(start)}–${dateShort(end)}`, prevWord: "7 วันก่อน", totalLabel: "รวม 7 วัน",
      range: daysBoundsTh(end, 7), prevRange: daysBoundsTh(shiftDateKey(end, -7), 7), mtdRange, mtdMonth: ym, link: `/master/platform-sales?month=${ym}`,
    };
  }
  return {
    period, start: end, end, label: dateLong(end), short: dateShort(end), prevWord: "วันก่อน", totalLabel: period === "today" ? "รวมวันนี้" : "รวมทั้งวัน",
    range: dayBoundsTh(end), prevRange: dayBoundsTh(shiftDateKey(end, -1)), mtdRange, mtdMonth: ym, link: `/master/platform-sales?date=${end}`,
  };
}

/** แถวที่จะโชว์ (หลังรวมเป็นรุ่น/ซ่อน) */
type ViewRow = {
  key: string; code: string | null; title: string; color: string | null; shop: string; platform: string; match: SalesLine["match"];
  qty: number; amt: number; prevQty: number | null; stock: number | null; image: string | null;
  group: { key: string; label: string };
  /** รวมเป็นรุ่น: กี่ SKU */
  kids?: number;
};

/** จัดข้อมูลยอดขาย → รายงาน (pure) */
export function shapePlatformSales(input: {
  info: SalesPeriodInfo; sales: PlatformSales; prev: PlatformSales | null;
  /** ยอดสะสมเดือนนี้ (null = ไม่ได้ขอ / เดือนที่แล้ว) */
  mtd: { amount: number } | null;
  /** สต๊อกคงเหลือต่อ sku_id (null = ไม่ได้ขอ · ไม่มีในแผนที่ = ไม่มีข้อมูลสต๊อก) */
  stock: Map<string, number> | null;
}, opts: ResolvedReportOptions): BuiltReport {
  const { info, sales, prev, mtd, stock } = input;
  const s = sales.summary;
  const ps = prev?.summary ?? null;
  const src = sourceDef(PLATFORM_SALES_SOURCE);
  const fields = opts.row_fields.length ? opts.row_fields : ["name", "qty", "amt"];
  // หัวคอลัมน์: ชื่อที่ตั้งเอง > ชื่อสั้นของตาราง (คอลัมน์แคบ) > ชื่อในตัวเลือก
  const SHORT_HEAD: Record<string, string> = { diff: "เทียบ", stock: "เหลือ", pct: "%" };
  const colLabel = (k: string) => opts.col_labels[k] || SHORT_HEAD[k] || src.rowFields.find((f) => f.key === k)?.label || k;
  const columns: ReportTableColumn[] = fields.map((k) => ({ key: k, label: colLabel(k), align: RIGHT.has(k) ? "right" : "left" }));
  const low = opts.low_stock > 0 ? opts.low_stock : 3;

  // ── แถว: ทุกบรรทัดขาย (+ เทียบช่วงก่อน + สต๊อก) ──
  const prevQty = new Map<string, number>();
  for (const l of prev?.lines ?? []) prevQty.set(salesLineKey(l), (prevQty.get(salesLineKey(l)) ?? 0) + l.qty);
  const parentGroup = (l: SalesLine) => {
    const code = l.parent?.code ?? (l.match === "model" ? l.code : null);
    if (code) return { key: `p:${code}`, label: code, name: l.parent?.name ?? null };
    return l.match === "none" ? { key: "p:-none", label: "ยังไม่จับคู่ SKU", name: null } : { key: "p:-noparent", label: "ไม่มี Parent SKU", name: null };
  };
  let rows: ViewRow[] = sales.lines.map((l) => ({
    key: salesLineKey(l), code: l.code, title: l.title, color: l.color, shop: l.shop, platform: l.platform, match: l.match,
    qty: l.qty, amt: l.amt, prevQty: prev ? prevQty.get(salesLineKey(l)) ?? null : null,
    stock: stock && l.sku_id && stock.has(l.sku_id) ? stock.get(l.sku_id)! : null, image: l.image,
    group: opts.group_by === "shop" ? { key: `s:${l.shop}`, label: l.shop }
      : opts.group_by === "platform" ? { key: `f:${l.platform}`, label: l.platform }
      : opts.group_by === "parent" ? (() => { const g = parentGroup(l); return { key: g.key, label: g.name ? `${g.label} · ${shortProductName(g.name, 40)}` : g.label }; })()
      : { key: "all", label: "" },
  }));
  if (opts.hide_unmatched) rows = rows.filter((r) => r.match !== "none");
  // รวมทุกสีเป็นรุ่น (แถวเดียวต่อ Parent SKU) — ที่ไม่มีรุ่นคงเป็นแถวเดิม
  if (opts.group_by === "model") {
    const by = new Map<string, ViewRow>();
    const parentOfKey = new Map(sales.lines.map((l) => [salesLineKey(l), parentGroup(l)]));
    for (const r of rows) {
      const g = parentOfKey.get(r.key)!;
      const k = g.key.startsWith("p:-") ? r.key : g.key;
      const cur = by.get(k);
      if (!cur) { by.set(k, g.key.startsWith("p:-") ? { ...r, group: { key: "all", label: "" } } : { ...r, key: k, code: g.label, title: g.name ?? r.title, color: null, kids: 1, group: { key: "all", label: "" } }); continue; }
      cur.qty += r.qty; cur.amt += r.amt; cur.kids = (cur.kids ?? 1) + 1;
      cur.prevQty = cur.prevQty == null && r.prevQty == null ? null : (cur.prevQty ?? 0) + (r.prevQty ?? 0);
      cur.stock = cur.stock == null && r.stock == null ? null : (cur.stock ?? 0) + (r.stock ?? 0);
      if (!cur.image && r.image) cur.image = r.image;
    }
    rows = [...by.values()];
  }

  // ── เรียง + จัดกลุ่ม (กลุ่มเรียงตามยอด/จำนวนรวม · รหัส = ก→ฮ) · โชว์ไม่เกิน max_rows ข้ามกลุ่ม ──
  const cmp = (a: { amt: number; qty: number; code?: string | null; title?: string }, b: typeof a) =>
    opts.sort_by === "qty" ? b.qty - a.qty || b.amt - a.amt
      : opts.sort_by === "code" ? (!a.code !== !b.code ? (a.code ? -1 : 1) : (a.code ?? a.title ?? "").localeCompare(b.code ?? b.title ?? "", "th"))
      : b.amt - a.amt || b.qty - a.qty;
  rows.sort(cmp);
  const groupMap = new Map<string, { key: string; label: string; rows: ViewRow[]; qty: number; amt: number; code: string }>();
  for (const r of rows) {
    const g = groupMap.get(r.group.key) ?? { key: r.group.key, label: r.group.label, rows: [], qty: 0, amt: 0, code: r.group.key.startsWith("p:-") ? "~" : r.group.label };
    g.rows.push(r); g.qty += r.qty; g.amt += r.amt;
    groupMap.set(r.group.key, g);
  }
  const groups = [...groupMap.values()].sort((a, b) => {
    const tail = Number(a.key.startsWith("p:-")) - Number(b.key.startsWith("p:-"));   // ยังไม่จับคู่/ไม่มีรุ่น อยู่ท้าย
    return tail || cmp(a, b);
  });
  const withSum = opts.group_by === "parent" || opts.group_by === "platform" || opts.group_by === "shop";

  const diffCell = (r: { qty: number; prevQty: number | null }): { text: string; tone?: ReportTone } => {
    if (!prev) return { text: "" };
    if (r.prevQty == null) return r.qty > 0 ? { text: "ใหม่", tone: "good" } : { text: "–" };
    const d = r.qty - r.prevQty;
    return d > 0 ? { text: `▲${num(d)}`, tone: "good" } : d < 0 ? { text: `▼${num(-d)}`, tone: "danger" } : { text: "–", tone: "muted" };
  };
  const nameOf = (r: ViewRow) => {
    const base = opts.short_names ? shortProductName(r.title, 24) : clip(r.title, 70);
    return `${base}${r.match === "none" ? " (ยังไม่จับคู่ SKU)" : r.match === "model" && !r.kids ? " (ไม่แยกสี)" : ""}`;
  };
  const toRow = (r: ViewRow): ReportTableRow => {
    const d = diffCell(r);
    const tones: Record<string, ReportTone> = {};
    if (d.tone) tones.diff = d.tone;
    if (r.stock != null && r.stock <= low) tones.stock = "danger";
    return {
      id: `${r.group.key}|${r.key}`, imageUrl: r.image ? absoluteUrl(r.image) : null, link: null, tones,
      cells: {
        code: r.code ?? "—", name: nameOf(r), color: r.kids ? `${num(r.kids)} สี` : r.color ?? "", shop: r.shop,
        qty: num(r.qty), amt: r.amt > 0 ? baht(r.amt) : "—",
        pct: s.amount > 0 && r.amt > 0 ? `${Math.round((r.amt / s.amount) * 100)}%` : "—",
        diff: d.text, stock: r.stock == null ? "–" : num(r.stock),
      },
    };
  };
  let shown = 0;
  const sections: ReportTable["sections"] = [];
  for (const g of groups) {
    if (shown >= opts.max_rows) break;
    const out: ReportTableRow[] = [];
    for (const r of g.rows) {
      if (shown >= opts.max_rows) break;
      out.push(toRow(r)); shown++;
    }
    const label = g.label && withSum ? `${g.label} — ${num(g.qty)} ชิ้น · ${baht(g.amt)}${g.rows.length > 1 && opts.group_by === "parent" ? ` · ${num(g.rows.length)} SKU` : ""}` : g.label;
    if (out.length) sections.push({ key: g.key, label, rows: out });
  }
  const totalDiff = ps ? diffCell({ qty: s.qty, prevQty: ps.qty }).text : "";
  const table: ReportTable = {
    columns, sections, totalLabel: info.totalLabel, imgSize: IMG_SIZE_PX[opts.img_size],
    total: opts.show_total ? { qty: num(s.qty), amt: baht(s.amount), pct: s.amount > 0 ? "100%" : "—", diff: totalDiff, stock: "" } : null,
  };

  // ── ตัวเลขสรุป (เรียงตามที่แหล่งข้อมูลประกาศ · เลือกเปิด/ปิดได้) ──
  const target = opts.monthly_target > 0 ? opts.monthly_target : 0;
  const pctOf = (v: number) => (target ? `${Math.round((v / target) * 100)}% ของเป้า ${baht(target)}` : null);
  const amtChange = ps ? change(s.amount, ps.amount) : null;
  const aov = (x: { orders: number; amount: number } | null) => (x && x.orders > 0 ? x.amount / x.orders : 0);
  const STAT: Record<string, ReportStat | null> = {
    orders: { label: "ออเดอร์", value: s.orders, ...(ps ? { hint: `${info.prevWord} ${num(ps.orders)}` } : {}) },
    qty: { label: "ชิ้น", value: s.qty, ...(ps ? { hint: `${info.prevWord} ${num(ps.qty)}` } : {}) },
    amount: {
      label: "ยอดขาย", value: s.amount, display: baht(s.amount), tone: "good",
      hint: [amtChange !== null ? `${amtChange >= 0 ? "+" : ""}${amtChange}% จาก${info.prevWord}` : null, info.period === "last_month" ? pctOf(s.amount) : null].filter(Boolean).join(" · ") || undefined,
    },
    mtd: mtd ? { label: `ยอดสะสม ${monthShort(info.mtdMonth)}`, value: mtd.amount, display: baht(mtd.amount), tone: "good", hint: pctOf(mtd.amount) ?? "ตั้งเป้ารายเดือนได้ในหน้าตา" } : null,
    aov: { label: "เฉลี่ย/ออเดอร์", value: aov(s), display: s.orders ? baht(aov(s)) : "—", ...(ps && aov(ps) ? { hint: `${info.prevWord} ${baht(aov(ps))}` } : {}) },
    cancelled: { label: "ยกเลิก", value: s.cancelled, hint: "ไม่นับในยอด", ...(s.cancelled ? { tone: "muted" as const } : {}) },
    lazada: { label: "ไม่มีราคา (Lazada)", value: s.no_price_orders, hint: "เมลไม่บอกราคา" },
    pending: { label: "รอยืนยัน SKU", value: s.pending_items, ...(s.pending_items ? { tone: "warn" as const } : {}) },
  };
  const stats = opts.stats.map((k) => STAT[k]).filter((x): x is ReportStat => !!x);

  // ── ⚠️ ของขายดีใกล้หมด (เฉพาะ SKU ที่มีข้อมูลสต๊อก) ──
  const alerts: BuiltReport["alerts"] = [];
  if (stock && opts.low_stock > 0) {
    const lowRows = sales.lines.filter((l) => l.sku_id && stock.has(l.sku_id) && stock.get(l.sku_id)! <= opts.low_stock)
      .sort((a, b) => b.qty - a.qty).slice(0, 8);
    if (lowRows.length) alerts.push({ tone: "warn", text: `ของขายดีใกล้หมด (เหลือ ≤ ${num(opts.low_stock)} ชิ้น): ${lowRows.map((l) => `${l.code} เหลือ ${num(stock.get(l.sku_id!)!)}`).join(" · ")}` });
  }

  // ── 🖼 ขายดี (ตามที่ตั้งเรียง · ข้ามกลุ่ม) ≤9 — อีเมลแถบรูป · LINE การ์ดปัดดู · Discord กริดรูป ──
  const spotlight: ReportSpotlight[] = rows.slice(0, 9).map((r, i) => ({
    rank: i + 1,
    title: r.code ?? clip(shortProductName(r.title), 28),
    sub: [r.match === "none" ? "ยังไม่จับคู่ SKU" : r.kids ? `${num(r.kids)} สี` : r.match === "model" ? "ไม่แยกสี" : r.color, r.code ? shortProductName(r.title, 40) : null].filter(Boolean).join(" · "),
    value: `${num(r.qty)} ชิ้น${r.amt > 0 ? ` · ${baht(r.amt)}` : ""}`,
    imageUrl: r.image ? absoluteUrl(r.image) : null,
    link: null,
  }));

  // ── 📎 Excel: ทุกรายการ (ไม่ตัด/ไม่ซ่อน/ไม่รวม) เรียงตามที่ตั้ง · ตัวเลขเป็น number ──
  const fileTag = info.period === "last_month" ? info.mtdMonth : info.start === info.end ? info.end : `${info.start}_${info.end}`;
  const exportData: ReportExport = {
    filename: `ยอดขายแพลตฟอร์ม-${fileTag}.xlsx`, sheet: fileTag,
    columns: [
      { key: "platform", header: "แพลตฟอร์ม" }, { key: "shop", header: "ร้าน" }, { key: "parent", header: "Parent SKU" }, { key: "code", header: "รหัส" },
      { key: "name", header: "สินค้า" }, { key: "color", header: "สี" }, { key: "match", header: "จับคู่" },
      { key: "qty", header: "จำนวน (ชิ้น)" }, { key: "amt", header: "ยอด (บาท)" }, { key: "prev", header: `จำนวน${info.prevWord}` }, { key: "stock", header: "สต๊อกเหลือ" },
    ],
    rows: [...sales.lines].sort(cmp).map((l) => ({
      platform: l.platform, shop: l.shop, parent: l.parent?.code ?? (l.match === "model" ? l.code : null), code: l.code, name: l.title, color: l.color,
      match: l.match === "sku" ? "SKU" : l.match === "model" ? "รุ่น (ไม่แยกสี)" : "ยังไม่จับคู่",
      qty: l.qty, amt: Math.round(l.amt * 100) / 100,
      prev: prev ? prevQty.get(salesLineKey(l)) ?? 0 : null,
      stock: stock && l.sku_id && stock.has(l.sku_id) ? stock.get(l.sku_id)! : null,
    })),
  };

  const fill = (k: string) => sales.lines.filter((l) => (k === "img" ? !!l.image : k === "code" ? !!l.code : k === "color" ? !!l.color
    : k === "stock" ? !!(stock && l.sku_id && stock.has(l.sku_id)) : true)).length;
  return {
    heading: `ยอดขายแพลตฟอร์ม · ${info.label}`,
    subjectCore: `ยอดขายแพลตฟอร์ม ${info.short} · ${baht(s.amount)}`,
    total: rows.length,
    shown,
    stats,
    showImages: fields.includes("img"),
    sections: [],
    table,
    spotlight,
    export: exportData,
    alerts,
    unit: "รายการ",
    viewAllLink: absoluteUrl(info.link),
    viewAllLabel: "ดูรายงานเต็มใน ERP",
    emptyText: `${info.label} ยังไม่มีออเดอร์จากแพลตฟอร์ม`,
    tokens: { "วันของยอด": info.short, "ยอด": num(s.amount), "ออเดอร์": s.orders, "ชิ้น": s.qty, "จำนวน": rows.length },
    fieldFill: Object.fromEntries(src.rowFields.map((f) => [f.key, fill(f.key)])),
    overdue: 0,
  };
}

/** ดึงยอดของช่วงที่ตั้ง + ช่วงก่อนหน้า (+ ยอดสะสมเดือนนี้ + สต๊อก ถ้าเลือกใช้) */
export async function platformSalesDaily(admin: Admin, filters: EmailReportFilters, opts: ResolvedReportOptions): Promise<BuiltReport> {
  const info = salesPeriod(filters.day ?? "yesterday");
  const wantMtd = opts.stats.includes("mtd") && !!info.mtdRange;
  const [sales, prev, mtd] = await Promise.all([
    loadPlatformSales(admin, { range: info.range }),
    loadPlatformSales(admin, { range: info.prevRange }),
    wantMtd ? loadPlatformSales(admin, { range: info.mtdRange! }) : Promise.resolve(null),
  ]);
  let stock: Map<string, number> | null = null;
  if (opts.row_fields.includes("stock") || opts.low_stock > 0) {
    const ids = [...new Set(sales.lines.map((l) => l.sku_id).filter((x): x is string => !!x))];
    try { stock = new Map([...(await loadSkuStock(admin, ids))].map(([id, st]) => [id, st.onHand])); }
    catch (e) { console.error("[platform-sales report] stock", e); stock = null; }
  }
  return shapePlatformSales({ info, sales, prev, mtd: mtd ? { amount: mtd.summary.amount } : null, stock }, opts);
}
