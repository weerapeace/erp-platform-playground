/**
 * 🖨 ใบพิมพ์ "สรุปสั่งซื้อ / สรุปของรอรับ" (เจ้าของอนุมัติ 2026-11-02 จาก widget รุ่น 4) — หน้าสั่งซื้อ /purchasing/orders ทั้ง 2 โหมด
 *   order = ของรอสั่ง (/api/purchasing/orderable) · recv = ของรอรับ (/api/purchasing/receivable)
 *   ทุกใบมี รูป · รหัส · ชื่อสินค้า เสมอ (คอลัมน์ล็อก) · ช่องใบสั่งผลิตเลือกได้ว่าโชว์อะไร (ปุ่ม 7 อย่าง)
 *   รวมของชิ้นเดียวกันเป็นบรรทัดเดียว · จัดกลุ่ม ร้าน / ร้าน→ใบสั่งซื้อ / ใบสั่งผลิต / อายุค้าง · กล่องสรุป + ตารางต่อร้าน
 *   หมายเหตุ "พิมพ์เอง" = ช่องกลาง (lib/print-notes · ทั้งทีมเห็น) ที่อยู่ = rowKey (ร้าน/ใบสั่งซื้อ + รหัส) ไม่เปลี่ยนตามการจัดกลุ่ม
 *   ตั้งค่าหน้าพิมพ์ = ของกลาง lib/list-print (ค่าเฉพาะใบอยู่ใน settings.opts) · หน้าพิมพ์ app/print/purchasing-orders · pure ไม่มี React
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import {
  LIST_GROUP_ROW, LIST_ROW_KEY, LIST_SUBGROUP_ROW, LIST_TOTAL_ROW, defaultListPrintSettings, escapeHtml as esc, fitListColumns, listNoteKey, listPrintCss, listSummaryHtml,
  renderListTable, resolveListColumns, signatureHtml,
  type ListPrintColumn, type ListPrintPreset, type ListPrintSettings,
} from "@/lib/list-print";

export type PoPrintMode = "order" | "recv";
/** ชื่อรายงานของช่องพิมพ์เอง (lib/print-notes) */
export const PO_PRINT_NOTES = "purchasing-orders" as const;
/** หน้าสั่งซื้อเขียนก่อนเปิดหน้าพิมพ์ = id ที่ติ๊กเลือกหลายชิ้นอยู่ { ids, at } */
export const PO_PRINT_PICK_KEY = "erp.poPrint.pick.order";

/** ข้อมูลย่อใบสั่งผลิต (/api/mo/brief) */
export type MoBrief = { mo_no: string; product_sku: string | null; product_name: string | null; qty: number; due_date: string | null; image_url: string | null };

/** 1 บรรทัดที่จะพิมพ์ */
export type PoPrintItem = {
  id: string; shop: string; cn: boolean; code: string; name: string; image_url: string | null; uom: string;
  qty: number; got: number; price: number; currency: string; date: string | null; requester: string; po_no: string; mo_no: string | null;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const stripCode = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;
export const isCnyCurrency = (c: string) => c === "RMB" || c === "YUAN" || c === "CNY";
const isCnShop = (shop: string, cur: string) => isCnyCurrency(cur) || /taobao|tao bao|1688|tmall|จีน/i.test(shop);
const shopName = (v: unknown) => { const s = str(v); return !s || s === "—" ? "ไม่ระบุร้าน" : s; };

/** แถวจาก /api/purchasing/orderable */
export const poItemsFromOrderable = (rows: Record<string, unknown>[]): PoPrintItem[] => rows.map((r) => {
  const shop = shopName(r.seller_name), currency = str(r.currency) || "THB";
  return {
    id: str(r.id), shop, cn: isCnShop(shop, currency), code: str(r.code), name: stripCode(str(r.item_name)), image_url: (r.image_url as string | null) ?? null,
    uom: str(r.uom), qty: num(r.qty), got: 0, price: num(r.price_est), currency, date: str(r.order_date) || null, requester: str(r.requester),
    po_no: "", mo_no: str(r.source_mo_no) || null,
  };
});
/** แถวจาก /api/purchasing/receivable */
export const poItemsFromReceivable = (rows: Record<string, unknown>[]): PoPrintItem[] => rows.map((r) => {
  const shop = shopName(r.seller_name), currency = str(r.currency) || "THB";
  return {
    id: str(r.id), shop, cn: isCnShop(shop, currency), code: str(r.code), name: stripCode(str(r.item_name)), image_url: (r.image_url as string | null) ?? null,
    uom: str(r.uom), qty: num(r.qty), got: num(r.qty_received), price: 0, currency, date: str(r.order_date) || null, requester: "",
    po_no: str(r.po_no), mo_no: str(r.source_mo_no) || null,
  };
});

// ---------- ค่าเฉพาะใบ (settings.opts) ----------
export type PoMoField = "no" | "img" | "sku" | "name" | "qty" | "use" | "due";
export const PO_MO_FIELDS: { key: PoMoField; label: string; icon: string }[] = [
  { key: "no", label: "เลขใบ", icon: "i:hash" },
  { key: "img", label: "รูปสินค้า", icon: "i:photo" },
  { key: "sku", label: "รหัสสินค้า", icon: "i:barcode" },
  { key: "name", label: "ชื่อสินค้า", icon: "i:tag" },
  { key: "qty", label: "จำนวนผลิต", icon: "i:stack-2" },
  { key: "use", label: "ใช้ของนี้กี่ชิ้น", icon: "i:arrow-down-right" },
  { key: "due", label: "กำหนดส่ง", icon: "i:calendar" },
];
export type PoMoShow = Record<PoMoField, boolean>;
export const PO_MO_DEFAULT: PoMoShow = { no: true, img: true, sku: false, name: true, qty: true, use: true, due: false };
/** ปุ่มลัดช่องใบสั่งผลิต */
export const PO_MO_QUICK: { id: string; label: string; show: PoMoShow }[] = [
  { id: "all", label: "ครบทุกอย่าง", show: { no: true, img: true, sku: true, name: true, qty: true, use: true, due: true } },
  { id: "pic", label: "รูป + จำนวน", show: { no: false, img: true, sku: false, name: false, qty: true, use: false, due: false } },
  { id: "min", label: "แค่เลขใบ", show: { no: true, img: false, sku: false, name: false, qty: false, use: false, due: false } },
];
export type PoPrintOpts = {
  /** รวมของชิ้นเดียวกัน (ร้าน/ใบสั่งซื้อ + รหัส) เป็นบรรทัดเดียว */
  merge: boolean;
  /** กล่องตัวเลขสรุปหัวใบ */
  sumCards: boolean;
  /** ตารางสรุปต่อร้าน */
  shopTable: boolean;
  /** แถวรวมท้ายกลุ่ม */
  gTotal: boolean;
  /** รหัสอยู่บรรทัดบนชื่อ (ไม่มีคอลัมน์รหัสแยก) */
  stack: boolean;
  mo: PoMoShow;
  /** ขนาดรูปสินค้าที่ผลิต */
  moImg: "s" | "l";
};
type PoBoolOpt = "merge" | "sumCards" | "shopTable" | "gTotal" | "stack";
const OPT_DEFAULTS: Record<PoPrintMode, Record<PoBoolOpt, boolean>> = {
  order: { merge: true, sumCards: true, shopTable: false, gTotal: true, stack: true },
  recv: { merge: true, sumCards: false, shopTable: false, gTotal: false, stack: true },
};
export function poPrintOpts(s: ListPrintSettings, mode: PoPrintMode): PoPrintOpts {
  const o = (s.opts ?? {}) as Record<string, unknown>;
  const d = OPT_DEFAULTS[mode];
  const b = (k: PoBoolOpt) => (typeof o[k] === "boolean" ? (o[k] as boolean) : d[k]);
  const raw = (o.mo && typeof o.mo === "object" ? o.mo : {}) as Record<string, unknown>;
  const mo = Object.fromEntries(PO_MO_FIELDS.map((f) => [f.key, typeof raw[f.key] === "boolean" ? raw[f.key] : PO_MO_DEFAULT[f.key]])) as PoMoShow;
  return { merge: b("merge"), sumCards: b("sumCards"), shopTable: b("shopTable"), gTotal: b("gTotal"), stack: b("stack"), mo, moImg: o.moImg === "l" ? "l" : "s" };
}

// ---------- คอลัมน์ / กลุ่ม / เรียง / แบบสำเร็จรูป ----------
export function poPrintColumns(mode: PoPrintMode): ListPrintColumn[] {
  const head: ListPrintColumn[] = [
    { key: "img", label: "รูป", locked: true },
    { key: "code", label: "รหัส", mono: true, locked: true, widthMm: 26 },
    { key: "name", label: "สินค้า", locked: true },
  ];
  if (mode === "order") return [...head,
    { key: "qty", label: "จำนวน", align: "right", widthMm: 16 },
    { key: "uom", label: "หน่วย", widthMm: 13 },
    { key: "price", label: "ราคา/หน่วย", align: "right", widthMm: 18 },
    { key: "total", label: "รวม", align: "right", widthMm: 20 },
    { key: "req", label: "ผู้ขอ", widthMm: 20 },
    { key: "mo", label: "ใบสั่งผลิต", widthMm: 40 },
    { key: "date", label: "วันขอ", widthMm: 16 },
    { key: "chk", label: "ซื้อแล้ว", blank: "box", widthMm: 13 },
    { key: "note", label: "หมายเหตุ", blank: "text", widthMm: 28 },
  ];
  return [...head,
    { key: "po", label: "ใบสั่งซื้อ", mono: true, widthMm: 28 },
    { key: "date", label: "วันสั่ง", widthMm: 16 },
    { key: "age", label: "ค้าง", align: "right", widthMm: 13 },
    { key: "qty", label: "สั่ง", align: "right", widthMm: 15 },
    { key: "got", label: "รับแล้ว", align: "right", widthMm: 15 },
    { key: "left", label: "ค้างรับ", align: "right", widthMm: 16 },
    { key: "uom", label: "หน่วย", widthMm: 13 },
    { key: "mo", label: "ใบสั่งผลิต", widthMm: 40 },
    { key: "real", label: "รับจริง", blank: "line", widthMm: 16 },
    { key: "ok", label: "ครบ", blank: "box", widthMm: 11 },
    { key: "bad", label: "เสีย", blank: "line", widthMm: 14 },
    { key: "note", label: "หมายเหตุ", blank: "text", widthMm: 28 },
  ];
}
export const PO_PRINT_TITLE: Record<PoPrintMode, string> = { order: "สรุปรายการสั่งซื้อ", recv: "สรุปของรอรับ" };
export const PO_PRINT_GROUPS: Record<PoPrintMode, { value: string; label: string }[]> = {
  order: [{ value: "shop", label: "ตามร้าน" }, { value: "mo", label: "ตามใบสั่งผลิต" }, { value: "", label: "ไม่จัดกลุ่ม" }],
  recv: [{ value: "shoppo", label: "ตามร้าน แล้วแยกใบสั่งซื้อ" }, { value: "shop", label: "ตามร้าน" }, { value: "mo", label: "ตามใบสั่งผลิต" }, { value: "age", label: "ตามอายุที่ค้าง" }, { value: "", label: "ไม่จัดกลุ่ม" }],
};
export const PO_PRINT_SORTS: Record<PoPrintMode, { value: string; label: string }[]> = {
  order: [{ value: "name", label: "ชื่อสินค้า ก-ฮ" }, { value: "code", label: "รหัสสินค้า A-Z" }, { value: "qty", label: "จำนวนมากก่อน" }, { value: "total", label: "ยอดเงินมากก่อน" }, { value: "date", label: "ขอก่อน-หลัง" }],
  recv: [{ value: "age", label: "ค้างนานสุดก่อน" }, { value: "name", label: "ชื่อสินค้า ก-ฮ" }, { value: "code", label: "รหัสสินค้า A-Z" }, { value: "left", label: "ค้างรับมากก่อน" }],
};
export const PO_PRINT_SIGN: Record<PoPrintMode, string[]> = { order: ["ผู้จัดทำ", "ผู้อนุมัติ"], recv: ["ผู้ส่งของ", "ผู้รับของ", "ผู้ตรวจ"] };

const presetCols = (mode: PoPrintMode, on: string[]) => poPrintColumns(mode).map((c) => ({ key: c.key, on: !!c.locked || on.includes(c.key) }));
type PresetDef = { id: string; name: string; groupBy: string; sortBy: string; image: ListPrintSettings["image"]; signature: boolean; on: string[]; opts: Record<PoBoolOpt, boolean> };
const PRESET_DEFS: Record<PoPrintMode, PresetDef[]> = {
  order: [
    { id: "po-buy", name: "ใบไปซื้อของ (ตามร้าน)", groupBy: "shop", sortBy: "name", image: "m", signature: false, on: ["qty", "uom", "total", "mo", "chk", "note"], opts: { merge: true, sumCards: true, shopTable: false, gTotal: true, stack: true } },
    { id: "po-appr", name: "ใบขออนุมัติสั่งซื้อ", groupBy: "shop", sortBy: "total", image: "s", signature: true, on: ["qty", "uom", "price", "total", "req", "mo", "note"], opts: { merge: false, sumCards: true, shopTable: true, gTotal: true, stack: true } },
    { id: "po-mo", name: "แยกตามใบสั่งผลิต", groupBy: "mo", sortBy: "name", image: "m", signature: false, on: ["qty", "uom", "chk", "note"], opts: { merge: false, sumCards: false, shopTable: false, gTotal: false, stack: false } },
  ],
  recv: [
    { id: "rc-check", name: "ใบเช็กของเข้า (คนรับของ)", groupBy: "shoppo", sortBy: "name", image: "l", signature: true, on: ["left", "uom", "mo", "real", "ok", "note"], opts: { merge: true, sumCards: false, shopTable: false, gTotal: false, stack: true } },
    { id: "rc-chase", name: "ใบตามของค้าง (ผู้จัดซื้อ)", groupBy: "shop", sortBy: "age", image: "s", signature: false, on: ["po", "age", "left", "uom", "mo", "note"], opts: { merge: true, sumCards: true, shopTable: true, gTotal: false, stack: true } },
    { id: "rc-mo", name: "ของรอรับ แยกตามใบสั่งผลิต", groupBy: "mo", sortBy: "age", image: "m", signature: false, on: ["po", "left", "uom", "age", "note"], opts: { merge: false, sumCards: false, shopTable: false, gTotal: false, stack: false } },
  ],
};
/** แบบสำเร็จรูป — ไม่แตะปุ่มช่องใบสั่งผลิต (ใช้ค่าที่ผู้ใช้เลือกไว้) */
export const poPrintPresets = (mode: PoPrintMode): ListPrintPreset[] => PRESET_DEFS[mode].map((p) => ({
  id: p.id, name: p.name,
  settings: { groupBy: p.groupBy, sortBy: p.sortBy, image: p.image, signature: p.signature, columns: presetCols(mode, p.on), opts: { ...p.opts } },
}));
export const poPrintDefaults = (mode: PoPrintMode): ListPrintSettings => {
  const p = PRESET_DEFS[mode][0];
  return defaultListPrintSettings(poPrintColumns(mode), {
    groupBy: p.groupBy, sortBy: p.sortBy, image: p.image, signature: p.signature, columns: presetCols(mode, p.on),
    opts: { ...p.opts, mo: { ...PO_MO_DEFAULT }, moImg: "s" },
  });
};

// ---------- สร้างใบ ----------
export type PoPrintScope = {
  /** ร้านเดียว (ว่าง = ทุกร้าน) */
  shop: string;
  /** ค้างเกินกี่วัน (0 = ทุกอายุ · ไม่มีวันสั่ง = ไม่นับ) */
  ageMin: number;
  /** เฉพาะที่ติ๊กไว้บนหน้าจอ (id บรรทัด) · null = ทั้งหมด */
  picks: Set<string> | null;
};
type PRow = PoPrintItem & { key: string; age: number | null; left: number; total: number; mos: { no: string; q: number }[] };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const curSym = (c: string) => (c === "THB" ? "฿" : isCnyCurrency(c) ? "¥" : "");
export const poMoney = (v: number, c: string) => { const s = curSym(c); return s ? `${s}${fmt(v)}` : `${fmt(v)} ${c}`; };
const sumMoney = (rows: PRow[]) => {
  const t = new Map<string, number>();
  for (const r of rows) t.set(r.currency, (t.get(r.currency) ?? 0) + r.total);
  return [...t.entries()].filter(([, v]) => v > 0).map(([c, v]) => poMoney(v, c)).join(" + ") || "-";
};
const ymdUtc = (ymd: string) => { const [y, m, d] = ymd.slice(0, 10).split("-").map(Number); return y && m && d ? Date.UTC(y, m - 1, d) : NaN; };
/** อายุ (วัน) นับตามวันปฏิทิน (ไม่เพี้ยน timezone) */
export const poAgeDays = (date: string | null, today: string): number | null => {
  if (!date) return null;
  const a = ymdUtc(date), b = ymdUtc(today);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
};
const thDate = (ymd: string | null) => {
  if (!ymd) return "—";
  const t = ymdUtc(ymd);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }) : esc(ymd);
};
/** ที่อยู่ข้อความหมายเหตุ — ร้าน/ใบสั่งซื้อ + รหัส (ไม่มีรหัส = ชื่อ) · คงที่ไม่ว่าจัดกลุ่ม/รวมแถวแบบไหน */
export const poRowKey = (mode: PoPrintMode, it: Pick<PoPrintItem, "shop" | "po_no" | "code" | "name">) =>
  `${mode === "order" ? "o" : "r"}:${mode === "order" ? it.shop : it.po_no}|${it.code || it.name}`.slice(0, 300);

const AGE_BUCKETS = ["ค้างเกิน 30 วัน", "ค้าง 15–30 วัน", "ค้างไม่เกิน 14 วัน", "ไม่ทราบวันสั่ง"];
const ageBucket = (a: number | null) => (a == null ? AGE_BUCKETS[3] : a > 30 ? AGE_BUCKETS[0] : a > 14 ? AGE_BUCKETS[1] : AGE_BUCKETS[2]);
const NO_MO = "ไม่ได้มาจากใบสั่งผลิต";

export function buildPoPrint(input: {
  mode: PoPrintMode; items: PoPrintItem[]; mos: Map<string, MoBrief>; settings: ListPrintSettings; scope: PoPrintScope;
  /** ข้อความช่องพิมพ์เอง (key = data-note) */
  noteOf: (key: string) => string;
  /** วันนี้ YYYY-MM-DD (เวลาเครื่อง) */
  today: string; printedAt: string; origin: string; company?: { name: string; logo_key: string | null } | null;
}): { html: string; title: string; groupCounts: number[]; count: number } {
  const { mode, settings: s, scope, origin } = input;
  const o = poPrintOpts(s, mode);
  const title = s.title.trim() || PO_PRINT_TITLE[mode];
  const img = (u: string | null, w: number, cls = "thumb") => (u ? `<img class="${cls}" src="${esc(`${u.startsWith("/") ? origin : ""}${u}${u.includes("?") ? "&" : "?"}w=${w}`)}" alt="" />` : `<span class="${cls} ph"></span>`);

  // 1) ขอบเขต + คำนวณ
  let rows: PRow[] = input.items
    .filter((it) => (!scope.shop || it.shop === scope.shop) && (!scope.picks || scope.picks.has(it.id)))
    .map((it) => {
      const age = poAgeDays(it.date, input.today);
      return { ...it, key: poRowKey(mode, it), age, left: Math.max(0, it.qty - it.got), total: it.qty * it.price, mos: it.mo_no ? [{ no: it.mo_no, q: it.qty }] : [] };
    })
    .filter((r) => !scope.ageMin || (r.age != null && r.age > scope.ageMin));
  // 2) รวมของชิ้นเดียวกัน (แยกตามใบสั่งผลิต = ไม่รวม)
  if (o.merge && s.groupBy !== "mo") {
    const m = new Map<string, PRow>();
    for (const r of rows) {
      const k = `${r.key}|${r.currency}`;
      const g = m.get(k);
      if (!g) { m.set(k, { ...r, mos: [...r.mos] }); continue; }
      g.qty += r.qty; g.got += r.got; g.left += r.left; g.total += r.total; g.mos.push(...r.mos);
      if (r.age != null && (g.age == null || r.age > g.age)) { g.age = r.age; g.date = r.date; }
      if (!g.image_url && r.image_url) g.image_url = r.image_url;
    }
    rows = [...m.values()];
  }
  // 3) เรียง
  const byName = (a: PRow, b: PRow) => a.name.localeCompare(b.name, "th") || a.code.localeCompare(b.code);
  const cmp: Record<string, (a: PRow, b: PRow) => number> = {
    name: byName, code: (a, b) => a.code.localeCompare(b.code) || byName(a, b), qty: (a, b) => b.qty - a.qty || byName(a, b),
    total: (a, b) => b.total - a.total || byName(a, b), date: (a, b) => (a.date ?? "").localeCompare(b.date ?? "") || byName(a, b),
    age: (a, b) => (b.age ?? -1) - (a.age ?? -1) || byName(a, b), left: (a, b) => b.left - a.left || byName(a, b),
  };
  rows.sort(cmp[s.sortBy] ?? byName);

  // 4) คอลัมน์ (รหัสบนชื่อ = ไม่มีคอลัมน์รหัสแยก) · ย่อให้พอดีกระดาษ (แนวตั้ง/A5 ไม่หลุดขอบ)
  const avail = poPrintColumns(mode);
  const cols = fitListColumns(resolveListColumns(s, avail).filter((c) => !(o.stack && c.key === "code")), s);
  const nameCol = cols.find((c) => c.key === "name");
  if (nameCol && o.stack && nameCol.label === "สินค้า") nameCol.label = "รหัส / สินค้า";
  const textCols = cols.filter((c) => c.blank === "text");
  const moSize = o.moImg === "l" ? 10 : 6;

  const moCell = (m: { no: string; q: number }) => {
    const b = input.mos.get(m.no), f = o.mo;
    // 2 บรรทัดต่อใบ: เลขใบ · ผลิต · ส่ง · ใช้ (ไม่ตัดกลางคำ) / รหัส + ชื่อสินค้า — ของที่รวมหลายใบจะได้ไม่ยาวเกิน
    const l1: string[] = [], l2: string[] = [];
    if (f.no || !(f.img || f.sku || f.name || f.qty || f.use || f.due) || !b) l1.push(`<span class="mono">${esc(m.no)}</span>`);
    if (b && f.qty) l1.push(`ผลิต ${fmt(b.qty)} ชิ้น`);
    if (b && f.due && b.due_date) l1.push(`ส่ง ${thDate(b.due_date)}`);
    if (f.use) l1.push(`<span class="sub">ใช้ ${fmt(m.q)}</span>`);
    if (b && f.sku && b.product_sku) l2.push(`<span class="mono">${esc(b.product_sku)}</span>`);
    if (b && f.name && b.product_name) l2.push(esc(b.product_name));
    const lines = [l1.map((x) => `<span class="nw">${x}</span>`).join(" · "), l2.join(" ")];
    return `<div class="mo-i">${f.img && b ? img(b.image_url, 120, "mo-img") : ""}<div>${lines.filter(Boolean).join("<br/>")}</div></div>`;
  };
  const moHead = (no: string) => {
    if (no === NO_MO) return esc(no);
    const b = input.mos.get(no), f = o.mo;
    const sub = [b && f.qty ? `ผลิต ${fmt(b.qty)} ชิ้น` : "", b && f.due && b.due_date ? `ส่ง ${thDate(b.due_date)}` : "", b && f.sku && b.product_sku ? esc(b.product_sku) : ""].filter(Boolean).join(" · ");
    return `<div class="mo-h">${f.img && b ? img(b.image_url, 160, "mo-img big") : ""}<div><span class="mono">${esc(no)}</span>${b?.product_name && f.name ? ` · ${esc(b.product_name)}` : ""}${sub ? `<div class="sub">${sub}</div>` : ""}</div></div>`;
  };
  const cellsOf = (r: PRow): Record<string, string> => {
    const out: Record<string, string> = {
      [LIST_ROW_KEY]: r.key,
      img: img(r.image_url, 200),
      code: `<span class="mono">${esc(r.code || "—")}</span>`,
      name: `${o.stack ? `<div class="mono code-top">${esc(r.code || "—")}</div>` : ""}${esc(r.name)}`,
      qty: fmt(r.qty), uom: esc(r.uom), price: r.price ? poMoney(r.price, r.currency) : "—", total: r.total ? poMoney(r.total, r.currency) : "—",
      req: esc(r.requester), date: thDate(r.date), po: esc(r.po_no),
      age: r.age == null ? "—" : `<span class="age${r.age > 30 ? " bad" : r.age > 14 ? " warn" : ""}">${fmt(r.age)} วัน</span>`,
      got: r.got ? fmt(r.got) : "-", left: `<b>${fmt(r.left)}</b>`,
      mo: r.mos.length ? r.mos.map(moCell).join("") : `<span class="sub">-</span>`,
    };
    for (const c of textCols) out[c.key] = esc(input.noteOf(listNoteKey(r.key, c.key)));
    return out;
  };

  // 5) จัดกลุ่ม
  const grouped = !!s.groupBy && PO_PRINT_GROUPS[mode].some((g) => g.value === s.groupBy && g.value);
  const keyOf = (r: PRow) => (s.groupBy === "shop" || s.groupBy === "shoppo" ? r.shop : s.groupBy === "mo" ? r.mos[0]?.no ?? NO_MO : s.groupBy === "age" ? ageBucket(r.age) : "");
  const groups = new Map<string, PRow[]>();
  for (const r of rows) { const k = grouped ? keyOf(r) : ""; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  const order = [...groups.keys()].sort((a, b) => (s.groupBy === "age" ? AGE_BUCKETS.indexOf(a) - AGE_BUCKETS.indexOf(b)
    : a === NO_MO || a === "ไม่ระบุร้าน" ? 1 : b === NO_MO || b === "ไม่ระบุร้าน" ? -1 : a.localeCompare(b, "th")));
  const sumText = (list: PRow[]) => `${fmt(list.length)} รายการ${mode === "order" ? ` · ${sumMoney(list)}` : ""}`;
  const blocks: Record<string, string>[][] = [];
  const counts: number[] = [];
  for (const k of order) {
    const list = groups.get(k)!;
    const out: Record<string, string>[] = [];
    if (grouped) {
      const label = s.groupBy === "mo" ? moHead(k) : `${esc(k)}${(s.groupBy === "shop" || s.groupBy === "shoppo") && list.every((r) => r.cn) ? ` <span class="sub">(ร้านจีน)</span>` : ""}`;
      out.push({ [LIST_GROUP_ROW]: `<span class="g-sum">${sumText(list)}</span>${label}` });
    }
    if (grouped && s.groupBy === "shoppo") {
      const pos = new Map<string, PRow[]>();
      for (const r of list) (pos.get(r.po_no) ?? pos.set(r.po_no, []).get(r.po_no)!).push(r);
      for (const [po, pl] of [...pos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const ages = pl.map((r) => r.age).filter((a): a is number => a != null);
        out.push({ [LIST_SUBGROUP_ROW]: `<span class="g-sum">${ages.length ? `ค้าง ${fmt(Math.max(...ages))} วัน` : ""}</span><span class="mono">${esc(po || "—")}</span> · สั่ง ${thDate(pl[0].date)} · ${fmt(pl.length)} รายการ` });
        for (const r of pl) out.push(cellsOf(r));
      }
    } else for (const r of list) out.push(cellsOf(r));
    if (grouped && o.gTotal) out.push({ [LIST_TOTAL_ROW]: `รวม ${sumText(list)}` });
    blocks.push(out);
    counts.push(out.length);
  }

  // 6) หัวใบ + สรุป
  const scopeText = [scope.shop || "ทุกร้าน", scope.ageMin ? `ค้างเกิน ${scope.ageMin} วัน` : "", scope.picks ? "เฉพาะที่ติ๊กไว้" : "", `${fmt(rows.length)} รายการ`].filter(Boolean).join(" · ");
  const co = input.company;
  const coHtml = co ? `<div class="wb-co">${co.logo_key ? `<img class="wb-logo" src="${esc(`${origin}/api/r2-image?key=${encodeURIComponent(co.logo_key)}&w=300`)}" alt="" />` : ""}<div class="wb-co-name">${esc(co.name)}</div></div>` : "";
  const header = `<div class="wb-head"><div>${coHtml}<div class="wb-title">${esc(title)}</div><div class="wb-sub">${esc(scopeText)}</div></div>`
    + `<div class="wb-no">${mode === "order" ? "สั่งซื้อ" : "รอรับ"}<br/>พิมพ์ ${esc(input.printedAt)}</div></div>`;
  let top = "";
  const moCount = new Set(rows.flatMap((r) => r.mos.map((m) => m.no))).size;
  if (o.sumCards && rows.length) {
    const shops = new Set(rows.map((r) => r.shop)).size;
    const old = rows.filter((r) => (r.age ?? 0) > 30).length;
    top += listSummaryHtml(mode === "order"
      ? [{ label: "รายการ", value: fmt(rows.length) }, { label: "ร้าน", value: fmt(shops) }, { label: "ยอดประมาณ", value: sumMoney(rows) }, { label: "ใบสั่งผลิตที่รอ", value: fmt(moCount) }]
      : [{ label: "รายการรอรับ", value: fmt(rows.length) }, { label: "ใบสั่งซื้อ", value: fmt(new Set(rows.map((r) => r.po_no)).size) }, { label: "ใบสั่งผลิตที่รอ", value: fmt(moCount) }, { label: "ค้างเกิน 30 วัน", value: fmt(old), tone: old ? "danger" : undefined }]);
  }
  if (o.shopTable && rows.length) {
    const byShop = new Map<string, PRow[]>();
    for (const r of rows) (byShop.get(r.shop) ?? byShop.set(r.shop, []).get(r.shop)!).push(r);
    const trs = [...byShop.entries()].sort((a, b) => b[1].length - a[1].length).map(([shop, l]) => {
      const ages = l.map((r) => r.age).filter((a): a is number => a != null);
      return `<tr><td>${esc(shop)}${l.every((r) => r.cn) ? ` <span class="sub">(จีน)</span>` : ""}</td><td class="r">${fmt(l.length)}</td><td class="r">${mode === "order" ? sumMoney(l) : fmt(new Set(l.map((r) => r.po_no)).size)}</td>${mode === "recv" ? `<td class="r">${ages.length ? `${fmt(Math.max(...ages))} วัน` : "—"}</td>` : ""}</tr>`;
    }).join("");
    top += `<table class="wb-s"><thead><tr><th>ร้าน</th><th class="r">รายการ</th><th class="r">${mode === "order" ? "ยอดประมาณ" : "ใบสั่งซื้อ"}</th>${mode === "recv" ? `<th class="r">ค้างนานสุด</th>` : ""}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  // 7) ตาราง (ขึ้นหน้าใหม่ทุกกลุ่ม = ตารางแยกต่อกลุ่ม)
  let body = top;
  if (!rows.length) body += `<div class="wb-empty">ไม่มีรายการตามที่เลือก</div>`;
  else if (grouped && s.pageBreakPerGroup) body += blocks.map((b, i) => `<div class="${i ? "grp-break" : ""}">${renderListTable(cols, b)}</div>`).join("");
  else body += renderListTable(cols, blocks.flat());
  if (s.signature) body += signatureHtml(PO_PRINT_SIGN[mode]);

  const tpl: ReportTemplate = {
    paper_size: s.paper, orientation: s.orientation,
    header_html: "{{{header}}}", body_html: "{{{body}}}", footer_html: "",
    custom_css: PO_PRINT_CSS + listPrintCss(s) + `\n.mo-img { width: ${moSize}mm; height: ${moSize}mm; }\n.mo-img.big { width: ${moSize + 3}mm; height: ${moSize + 3}mm; }`,
  };
  return { html: buildReportHtml(tpl, { header, body }, `${title} ${input.printedAt.replace(/\//g, "-")}`), title, groupCounts: counts.length ? counts : [0], count: rows.length };
}

const PO_PRINT_CSS = `
.doc { color: #111827; }
.wb-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.wb-title { font-weight: 800; }
.wb-sub { font-size: 10px; color: #6b7280; margin-top: 1mm; }
.wb-no { text-align: right; font-size: 10px; color: #6b7280; white-space: nowrap; }
.wb-t, .wb-s { width: 100%; border-collapse: collapse; }
.wb-t th, .wb-t td, .wb-s th, .wb-s td { border: 1px solid #cbd5e1; vertical-align: middle; }
.wb-t th, .wb-s th { background: #f1f5f9; font-weight: 700; text-align: left; }
.wb-s { margin-bottom: 3mm; break-inside: avoid; }
.wb-s th, .wb-s td { padding: 0.8mm 2mm; }
.wb-t td.r, .wb-t th.r, .wb-s td.r, .wb-s th.r { text-align: right; white-space: nowrap; }
.mono { font-family: ui-monospace, monospace; }
.wb-t td.mono, .code-top { color: #334155; }
.code-top { font-size: 0.85em; }
.sub { font-size: 0.85em; color: #64748b; font-weight: 400; }
td.img, th.img { text-align: center; }
.thumb { object-fit: cover; border: 1px solid #e2e8f0; border-radius: 0.6mm; display: block; margin: 0 auto; }
.thumb.ph, .mo-img.ph { display: inline-block; border: 1px dashed #94a3b8; box-sizing: border-box; background: transparent; }
.mo-i { display: flex; gap: 1.2mm; align-items: flex-start; margin: 0.5mm 0; line-height: 1.25; font-size: 0.92em; }
.mo-i + .mo-i { border-top: 1px dotted #e2e8f0; padding-top: 0.5mm; }
.nw { white-space: nowrap; }
.mo-h { display: inline-flex; gap: 2mm; align-items: center; vertical-align: middle; }
.mo-img { flex: none; object-fit: cover; border: 1px solid #e2e8f0; border-radius: 0.6mm; display: block; }
.g-sum { float: right; font-weight: 400; color: #475569; margin-left: 3mm; }
.age.warn { color: #b45309; }
.age.bad { color: #b91c1c; font-weight: 700; }
.wb-empty { padding: 10mm 0; text-align: center; color: #94a3b8; }
`;
