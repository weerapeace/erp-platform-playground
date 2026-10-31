/**
 * ของกลาง — "ใบสั่งผลิตรวมทั้งรุ่น" (Parent SKU): รวมของที่ต้องซื้อ + บล็อกตัด ของทุกสีในรุ่นเดียวในแผ่นเดียว
 *
 * รูปแบบ = ตาราง "ของ × สี" (เจ้าของเลือก 2026-10-31):
 *   คอลัมน์ = SKU ลูก (สี) — หลายใบสั่งผลิตของสีเดียวกันรวมเป็นคอลัมน์เดียว
 *   แถวซื้อ  = ของชนิดเดียวกันแต่ต่างสี → แถวเดียว (ช่องบอกรหัสสีของ SKU นั้น) · ของที่ใช้ทุกสี → แถวละรหัส
 *   แถวตัด   = บล็อกขนาดเดียวกันทุกสี → แถวเดียว ช่างตัดรวดเดียว ติ๊กทีละช่อง
 *
 * ตัวเลขทุกตัวใช้กติกากลางเดิม: สถานะซื้อ = lib/mo-material-status (คำนวณฝั่ง API แล้วส่งมา) · ต้องตัดไหม = lib/cut-rules
 * ข้อมูลมาจาก /api/mo/family-print · หน้าพิมพ์ /print/work-order/family · ไฟล์นี้ไม่ยิง DB (ทดสอบได้)
 */
import { needsCut } from "@/lib/cut-rules";
import { signoffHtml, SIGNOFF_CSS, type SignBox } from "@/lib/print-signoff";
import type { MatStatus } from "@/lib/mo-material-status";
import type { ReportTemplate } from "@/lib/template";

/* ─────────────── ข้อมูลเข้า (จาก API) ─────────────── */
export type FamilyMo = {
  id: string; mo_no: string; product_sku: string; qty: number;
  due_date?: string | null; status?: string | null;
  size_breakdown?: { label: string; qty: number }[] | null;
  /** ความคืบหน้างาน (ใบติดตามงาน lib/family-track) — ไม่มี = ใบซื้อ-ตัดอย่างเดียว */
  track?: FamilyMoTrack;
};
/** สถานะงานของใบ: ติ๊กเตรียม/ตัดระดับใบ · ขั้นที่แอดมินข้าม · เบิกของ/เข้าคลัง · ใบจ่ายงาน */
export type FamilyMoTrack = {
  prep_done: boolean; prep_at: string | null; cut_done: boolean; cut_at: string | null;
  internal_due: string | null; materials_issued: boolean; finished_received: boolean;
  /** ขั้นที่แอดมินข้าม (lib/mo-skip) เช่น ["prep","cut"] */
  skipped: string[];
  work_orders: FamilyWorkOrder[];
};
/** ใบจ่ายงาน 1 ใบ (mo_work_orders) + รอบส่งงาน (wo_submissions) + ผล QC (qc_warehouse_items) */
export type FamilyWorkOrder = {
  id: string; wo_no: string; who: string; dept: string | null; is_craftsman: boolean;
  qty: number; dispatch_date: string | null; due_date: string | null;
  /** ค่าแรงรวมของใบ (เรต × จำนวน) — ไม่ใช่เรตต่อชิ้น */
  labor_cost: number | null;
  received: number; qc_pulled: number; status: string;
  submissions: { date: string | null; qty: number; wage: number; who: string | null }[];
  qc: { good: number; defect: number; repairing: number };
};
export type FamilySku = { code: string; variant: string | null; image_url: string | null };
/** 1 แถวของ mo_material_summary + สถานะซื้อที่คำนวณแล้ว (computeMatStatus) */
export type FamilyBuyLine = {
  mo_no: string; code: string | null; name: string | null; type: string | null; uom: string | null;
  qty_per: number; required: number; remaining: number; status: MatStatus; po_nos: string[];
  seq: number; image_url: string | null;
};
/** 1 แถวของ mo_materials (บล็อกตัด) */
export type FamilyCutLine = {
  mo_no: string; code: string | null; name: string | null; type: string | null;
  block: string | null; width: number | null; length: number | null; pieces: number | null;
  size_label: string | null; cut_done: boolean; seq: number; image_url: string | null;
};
export type FamilyInput = {
  key: string;
  /** null = ใบที่ SKU ไม่มีสินค้าแม่ → รวมเฉพาะ SKU ตัวเอง */
  parent: { code: string; name: string | null; image_url: string | null } | null;
  mos: FamilyMo[]; skus: FamilySku[]; buy: FamilyBuyLine[]; cut: FamilyCutLine[];
  /** ข้อมูลหลักปัจจุบัน (ไม่ใช่สำเนาในใบ) — ใช้ตรวจข้อมูล/แก้ด่วน (lib/family-checks) */
  masters?: FamilyMasters;
};
export type FamilyMasters = {
  /** วัตถุดิบ: รหัส → id + ค่าในข้อมูลวัตถุดิบตอนนี้ */
  components: Record<string, { id: string; name: string | null; uom: string | null; type: string | null; color: string | null }>;
  /** สินค้า (สี): รหัส → id + ชื่อสี */
  products: Record<string, { id: string; color: string | null }>;
  /** ใบสั่งผลิต → สูตร BOM ที่ใช้ */
  bom_by_mo: Record<string, string | null>;
};
export type FamilyPrintResponse = {
  families: FamilyInput[];
  /** ตัวเลือกของช่องแก้ด่วน (ชื่อหน่วย / ชนิดวัตถุดิบ ที่มีในระบบ) */
  options?: { uoms: string[]; types: string[] };
};

/* ─────────────── ตั้งค่าหน้าตา (ค่ากลาง ui_config "family_print_settings") ─────────────── */
/** auto = รวมของเดียวกันต่างสี (ชื่อขึ้นต้นเหมือนกัน รองรับภาษาไทย) · strict = แบบเดิม (ต้องมีตัวคั่น) · none = แถวละรหัส */
export type FamilyMergeMode = "auto" | "strict" | "none";
export type FamilyPrintSettings = {
  merge: FamilyMergeMode;
  /** type = หมวดตามชนิดวัตถุดิบ · kind = ต่างสี / ใช้ทุกสี (แบบเดิม) */
  group: "type" | "kind";
  /** ในช่องของแถวต่างสี: ตัวเลขอย่างเดียว · + รหัสย่อ · + รหัสย่อ + คำบอกสี */
  cell: "num" | "code" | "full";
  /** ช่องที่สีนั้นไม่ใช้ */
  empty: "blank" | "dash" | "hatch";
  /** ช่องติ๊ก: หน้าตัวเลขทุกช่อง · คอลัมน์ท้ายแถว */
  tick: "before" | "row";
  /** รูปวัตถุดิบ: แสดงกรอบว่างด้วย · ซ่อนกรอบว่าง · ไม่มีคอลัมน์รูป */
  img: "show" | "hide" | "none";
  /** บาร์โค้ดเลขใบ (การ์ดสี + ใบติดตามงาน) */
  barcode: "both" | "line" | "qr" | "none";
  /** ขนาดแต่ละจุด (หัวใบ · การ์ดสี · ตาราง · ขอบกระดาษ) — ค่าเริ่ม = หน้าตาเดิม */
  sizes: FamilySizes;
  /** คอลัมน์ใบติดตามงาน (แบบ A): ลำดับ · ชื่อหัว · ความกว้าง · โชว์ — null = ค่าเริ่ม (lib/family-track normalizeTrackCols) */
  track_cols: PrintColCfg[] | null;
};
/** คอลัมน์ที่ปรับได้ (รูปแบบเดียวกับตั้งค่าคอลัมน์ใบสั่งงาน) — width = น้ำหนัก ≈ มม. */
export type PrintColCfg = { key: string; label: string; width: number; show: boolean };

/* ─────────────── ขนาดแต่ละจุด ───────────────
 * ตัวอักษรเป็น px (ขนาดตอนพิมพ์) · รูป/บาร์โค้ด/ขอบเป็น มม. · per_row 0 = อัตโนมัติ (มีบาร์โค้ดเส้น 3 · ไม่มี 6)
 * card_img / head_img = 0 → ไม่แสดงรูปจุดนั้น · บาร์โค้ดเส้นปรับได้แค่ความสูง (กว้างตายตัว ~55 มม. ให้เครื่องยิงอ่านได้)
 */
export type FamilySizes = {
  hero_img: number; hero_code: number; hero_qty: number;
  per_row: number; card_img: number; mo_no: number; bc_h: number; qr: number;
  head_img: number; mat_img: number; name: number; qty: number; code: number; tick: number; pad: "tight" | "normal" | "airy";
  cut_size: number; cut_sub: number;
  margin: number;
};
export const FAMILY_DEFAULT_SIZES: FamilySizes = {
  hero_img: 24, hero_code: 16, hero_qty: 20,
  per_row: 0, card_img: 14, mo_no: 9.5, bc_h: 8, qr: 13,
  head_img: 9, mat_img: 8.5, name: 9, qty: 9.5, code: 8.5, tick: 3.2, pad: "normal",
  cut_size: 13, cut_sub: 8.5,
  margin: 7,
};
type SizeNumKey = Exclude<keyof FamilySizes, "pad">;
export const FAMILY_SIZE_FIELDS: { zone: string; fields: { key: SizeNumKey; label: string; min: number; max: number; step: number; unit: string }[] }[] = [
  { zone: "หัวใบ", fields: [
    { key: "hero_img", label: "รูปสินค้า", min: 12, max: 40, step: 1, unit: "มม." },
    { key: "hero_code", label: "รหัสสินค้า", min: 10, max: 24, step: 0.5, unit: "px" },
    { key: "hero_qty", label: "จำนวนรวม", min: 12, max: 30, step: 1, unit: "px" },
  ] },
  { zone: "การ์ดสี", fields: [
    { key: "per_row", label: "การ์ดต่อแถว (0 = อัตโนมัติ)", min: 0, max: 6, step: 1, unit: "ใบ" },
    { key: "card_img", label: "รูปสี (0 = ไม่แสดง)", min: 0, max: 24, step: 1, unit: "มม." },
    { key: "mo_no", label: "เลขใบ", min: 7, max: 13, step: 0.5, unit: "px" },
    { key: "bc_h", label: "บาร์โค้ดเส้น สูง", min: 5, max: 12, step: 0.5, unit: "มม." },
    { key: "qr", label: "QR", min: 10, max: 20, step: 0.5, unit: "มม." },
  ] },
  { zone: "ตารางของที่ต้องซื้อ", fields: [
    { key: "head_img", label: "รูปหัวคอลัมน์ (0 = ไม่แสดง)", min: 0, max: 16, step: 1, unit: "มม." },
    { key: "mat_img", label: "รูปวัตถุดิบ", min: 4, max: 16, step: 0.5, unit: "มม." },
    { key: "name", label: "ชื่อวัตถุดิบ", min: 7, max: 13, step: 0.5, unit: "px" },
    { key: "qty", label: "ตัวเลข", min: 8, max: 14, step: 0.5, unit: "px" },
    { key: "code", label: "รหัส/สีในช่อง", min: 6, max: 10, step: 0.5, unit: "px" },
    { key: "tick", label: "ช่องติ๊ก", min: 2.5, max: 5, step: 0.1, unit: "มม." },
  ] },
  { zone: "ตารางบล็อกตัด", fields: [
    { key: "cut_size", label: "ขนาดตัด", min: 9, max: 18, step: 0.5, unit: "px" },
    { key: "cut_sub", label: "รหัสบล็อก/วัตถุดิบ", min: 7, max: 11, step: 0.5, unit: "px" },
  ] },
  { zone: "ทั้งใบ", fields: [
    { key: "margin", label: "ขอบกระดาษ", min: 4, max: 12, step: 0.5, unit: "มม." },
  ] },
];
export const FAMILY_SIZE_PADS: { v: FamilySizes["pad"]; label: string }[] = [{ v: "tight", label: "แน่น" }, { v: "normal", label: "ปกติ" }, { v: "airy", label: "โปร่ง" }];
/** ชุดสำเร็จ (ตามที่เจ้าของเห็นใน widget 2026-10-31) */
export const FAMILY_SIZE_PRESETS: { label: string; value: FamilySizes }[] = [
  { label: "ประหยัดกระดาษ", value: { hero_img: 16, hero_code: 13, hero_qty: 16, per_row: 4, card_img: 10, mo_no: 8, bc_h: 6.5, qr: 11, head_img: 0, mat_img: 7, name: 8, qty: 8.5, code: 6.5, tick: 2.8, pad: "tight", cut_size: 11, cut_sub: 7.5, margin: 5 } },
  { label: "ปกติ", value: FAMILY_DEFAULT_SIZES },
  { label: "ตัวใหญ่ อ่านง่าย", value: { hero_img: 32, hero_code: 20, hero_qty: 26, per_row: 3, card_img: 18, mo_no: 11, bc_h: 10, qr: 16, head_img: 12, mat_img: 12, name: 11, qty: 12, code: 8.5, tick: 4, pad: "airy", cut_size: 16, cut_sub: 10, margin: 8 } },
];
export function normalizeFamilySizes(raw: unknown): FamilySizes {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...FAMILY_DEFAULT_SIZES };
  for (const z of FAMILY_SIZE_FIELDS) for (const f of z.fields) {
    const n = Number(o[f.key]);
    if (o[f.key] !== undefined && o[f.key] !== null && Number.isFinite(n)) out[f.key] = Math.min(f.max, Math.max(f.min, n));
  }
  if (FAMILY_SIZE_PADS.some((p) => p.v === o.pad)) out.pad = o.pad as FamilySizes["pad"];
  return out;
}
const sanitizeCols = (raw: unknown): PrintColCfg[] | null => {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as { key?: unknown }).key === "string")
    .map((c) => ({ key: String(c.key), label: typeof c.label === "string" ? c.label.slice(0, 40) : "", width: Number(c.width) || 0, show: c.show !== false }));
  return out.length ? out : null;
};
/** ค่าที่เจ้าของเลือก (2026-10-31 "ใช้ค่าแนะนำ") */
export const FAMILY_DEFAULT_SETTINGS: FamilyPrintSettings = { merge: "auto", group: "type", cell: "code", empty: "blank", tick: "before", img: "hide", barcode: "both", sizes: FAMILY_DEFAULT_SIZES, track_cols: null };
export const FAMILY_SETTING_FIELDS: { key: keyof FamilyPrintSettings; label: string; options: { v: string; label: string }[] }[] = [
  { key: "merge", label: "วิธีรวมแถว", options: [{ v: "auto", label: "อัตโนมัติ" }, { v: "strict", label: "แบบเดิม (เข้ม)" }, { v: "none", label: "ไม่รวม (แถวละรหัส)" }] },
  { key: "group", label: "จัดหมวด", options: [{ v: "type", label: "ตามชนิดวัตถุดิบ" }, { v: "kind", label: "ต่างสี / ใช้ทุกสี" }] },
  { key: "cell", label: "ในช่อง", options: [{ v: "num", label: "ตัวเลขอย่างเดียว" }, { v: "code", label: "+ รหัสย่อ" }, { v: "full", label: "+ รหัส + สี" }] },
  { key: "empty", label: "ช่องที่ไม่ใช้", options: [{ v: "blank", label: "ว่าง" }, { v: "dash", label: "ขีด –" }, { v: "hatch", label: "ลายขีด" }] },
  { key: "tick", label: "ช่องติ๊ก", options: [{ v: "before", label: "หน้าตัวเลข" }, { v: "row", label: "ท้ายแถว" }] },
  { key: "img", label: "รูปวัตถุดิบ", options: [{ v: "show", label: "แสดงทุกช่อง" }, { v: "hide", label: "ซ่อนกรอบว่าง" }, { v: "none", label: "ไม่มีคอลัมน์รูป" }] },
  { key: "barcode", label: "บาร์โค้ดเลขใบ", options: [{ v: "both", label: "เส้น + QR" }, { v: "line", label: "เส้น" }, { v: "qr", label: "QR" }, { v: "none", label: "ไม่แสดง" }] },
];
/** อ่านค่าที่บันทึกไว้แบบปลอดภัย — คีย์ใหม่ที่ยังไม่เคยบันทึก/ค่าเพี้ยน = ค่าเริ่มต้น */
export function normalizeFamilySettings(raw: unknown): FamilyPrintSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...FAMILY_DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const f of FAMILY_SETTING_FIELDS) if (typeof o[f.key] === "string" && f.options.some((x) => x.v === o[f.key])) out[f.key] = o[f.key] as string;
  out.sizes = normalizeFamilySizes(o.sizes);
  out.track_cols = sanitizeCols(o.track_cols);
  return out as FamilyPrintSettings;
}

/** CSS ขนาดแต่ละจุด — ต่อท้ายเทมเพลต · เฉพาะค่าที่ต่างจากค่าเริ่ม (ค่าเริ่มทั้งหมด = ไม่ปล่อย CSS เพิ่ม หน้าตาเดิมเป๊ะ)
 *  ใช้ค่าเดียวกันทั้งบนจอและตอนพิมพ์ (บนจอเห็นขนาดจริงที่จะพิมพ์) */
export function familySizeCss(z: FamilySizes | null | undefined): string {
  if (!z) return "";
  const d = FAMILY_DEFAULT_SIZES, r: string[] = [];
  const ch = (k: keyof FamilySizes) => z[k] !== d[k];
  if (ch("hero_img")) r.push(`.fp-hero { grid-template-columns: ${z.hero_img + 6}mm 1.4fr 30mm 1.3fr; }`, `.fp-heroimg { max-height: ${z.hero_img}mm; }`, `.fp-heroimg.fp-noimg { width: ${z.hero_img}mm; height: ${z.hero_img}mm; }`);
  if (ch("hero_code")) r.push(`.product-code { font-size: ${z.hero_code}px; }`);
  if (ch("hero_qty")) r.push(`.qty-big { font-size: ${z.hero_qty}px; }`);
  if (ch("card_img")) r.push(z.card_img > 0 ? `.fp-cardimg, .fp-cardimg.fp-noimg { width: ${z.card_img}mm; height: ${z.card_img}mm; }` : `.fp-cardimg { display: none !important; }`);
  if (ch("mo_no")) r.push(`.fp-mo-no { font-size: ${z.mo_no}px; }`);
  if (ch("bc_h")) r.push(`.fp-bc-line .wo-barcode-svg { height: ${z.bc_h}mm; }`);
  if (ch("qr")) r.push(`.fp-bc-qr .wo-qr { width: ${z.qr}mm; height: ${z.qr}mm; }`);
  if (ch("head_img")) r.push(z.head_img > 0 ? `.fp-skuimg, .fp-skuimg.fp-noimg { width: ${z.head_img}mm; height: ${z.head_img}mm; }` : `.fp-skuimg { display: none !important; }`);
  if (ch("mat_img")) r.push(`.mat-img { max-height: ${z.mat_img}mm; }`, `.img-cell .fp-noimg { width: ${z.mat_img}mm; height: ${z.mat_img}mm; }`);
  if (ch("name")) r.push(`.fp-name { font-size: ${z.name}px; }`);
  if (ch("qty")) r.push(`.fp-q, .fp-tot { font-size: ${z.qty}px; }`);
  if (ch("code")) r.push(`.fp-cell .fp-sub { font-size: ${z.code}px; }`);
  if (ch("tick")) r.push(`.tick-box { width: ${z.tick}mm; height: ${z.tick}mm; }`);
  if (ch("pad")) r.push(`.summary-table th, .summary-table td, .doc-table th, .doc-table td { padding: ${z.pad === "tight" ? "0.3mm 0.4mm" : "1.3mm 1mm"}; }`);
  if (ch("cut_size")) r.push(`.fp-size { font-size: ${z.cut_size}px; }`);
  if (ch("cut_sub")) r.push(`.fp-size + .fp-sub { font-size: ${z.cut_sub}px; }`);
  if (ch("margin")) r.push(`.doc { padding: ${z.margin}mm ${z.margin + 1}mm !important; }`);
  if (!r.length) return "";
  const css = r.join("\n");
  return `\n/* ขนาดแต่ละจุด — ตั้งจากแผง "ตั้งค่าใบรวมทั้งรุ่น" */\n${css}\n@media print {\n${css}\n}\n`;
}
/** ความกว้างคอลัมน์รูปวัตถุดิบ — โตตามขนาดรูปที่ตั้ง (ค่าเริ่ม 12 มม. เท่าเดิม) */
const imgColW = (s: FamilyPrintSettings) => `${Math.max(12, Math.round((s.sizes?.mat_img ?? FAMILY_DEFAULT_SIZES.mat_img) + 3.5))}mm`;

/* ─────────────── ผลลัพธ์ (ตาราง) ─────────────── */
/** partial = ขอ/สั่งไปแล้วบางส่วน ยังขาด */
export type FamilyCellStatus = MatStatus | "partial";
export type FamilyColumn = {
  sku: string; variant: string | null; image_url: string | null; qty: number;
  mos: { id: string; mo_no: string; qty: number; due_date: string | null }[];
  /** ใบของสีนี้ยังไม่มีรายการวัตถุดิบเลย (ยังไม่ได้กางสูตร) — ช่องว่างทั้งคอลัมน์ไม่ได้แปลว่าไม่ต้องใช้ */
  no_materials: boolean;
};
export type FamilyBuyCell = {
  qty: number; remaining: number; status: FamilyCellStatus; po_nos: string[];
  code: string | null; short: string | null; colour: string | null; missing_qty: boolean;
};
export type FamilyBuyRow = {
  /** varies = ของชนิดเดียวกันต่างสี (ช่องบอกรหัส) · single = รหัสเดียว (ใช้ทุกสีหรือบางสี) */
  kind: "varies" | "single";
  type: string; label: string; code: string | null; codes: string[]; image_url: string | null; uom: string;
  cells: (FamilyBuyCell | null)[]; total: number; remaining: number; missing_qty: boolean;
  /** ลำดับใน BOM (น้อย = ขึ้นก่อน) — ใช้เรียงตอนจัดหมวดตามชนิด */
  seq: number;
};
export type FamilyCutCell = { pcs: number; code: string | null; short: string | null; colour: string | null; done: boolean };
export type FamilyCutRow = {
  type: string; block: string | null; size: string; pieces_per: number;
  varies: boolean; material: string; code: string | null; image_url: string | null;
  cells: (FamilyCutCell | null)[]; total: number;
};
export type FamilySheet = {
  key: string; title_code: string; title_name: string | null; image_url: string | null;
  columns: FamilyColumn[];
  buy: { varies: FamilyBuyRow[]; single: FamilyBuyRow[] };
  cut: { type: string; rows: FamilyCutRow[] }[];
  stats: { skus: number; mos: number; qty: number; codes: number; codes_to_buy: number; cut_rows: number; cut_pieces: number; due_min: string | null };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const EPS = 0.0001;
const txt = (v: unknown) => String(v ?? "").trim();
const natural = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });

/** ตัดคำนำหน้าร่วมให้ขาดที่ตัวคั่น (ช่องว่าง - # / _ . วงเล็บ) — "M638-1" → "M638-" */
const SEP = /[\s\-#/_.()]/;
function commonPrefix(list: string[]): string {
  if (list.length < 2) return "";
  let p = list[0];
  for (const s of list.slice(1)) {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i++;
    p = p.slice(0, i);
  }
  if (list.every((s) => s.length === p.length)) return p;   // เหมือนกันทั้งหมด
  let cut = p.length;
  while (cut > 0 && !SEP.test(p[cut - 1])) cut--;
  return p.slice(0, cut);
}
const ALNUM = /[A-Za-z0-9]/;
/** ส่วนหน้าที่ทุกข้อความเหมือนกันทีละตัวอักษร (ไม่สนตัวคั่น) */
function rawPrefix(list: string[]): string {
  let p = list[0] ?? "";
  for (const s of list.slice(1)) {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i++;
    p = p.slice(0, i);
  }
  return p;
}
/**
 * ชื่อแถว "ของต่างสี" = ส่วนหน้าที่ชื่อทุกตัวเหมือนกัน เช่น "พียูหนังเทียม M638" (ไม่มี = fallback)
 *   thai = true (ค่าเริ่ม "อัตโนมัติ"): ภาษาไทยไม่เว้นวรรค → ยอมตัดกลางคำไทยได้ เช่น "ผ้าซับใน FLYNOW สีดำ" + "ผ้าซับในตัวบาง" → "ผ้าซับใน"
 *     แต่ห้ามขาดกลางรหัส ("M638#1" → "M638") และตัดคำว่า "สี" ที่ห้อยท้ายทิ้ง ("…พร้อมหางสี" → "…พร้อมหาง") · ต้องยาว ≥ 4 ตัว
 *   thai = false ("แบบเดิม"): ตัดได้เฉพาะที่ตัวคั่น (ช่องว่าง - # / _ . วงเล็บ) · ยาว ≥ 3 ตัว
 * ตัดเศษตัวเลขท้ายที่ขาดกลางคำทิ้ง: "พลาสติกใส 0.30" กับ "พลาสติกใส 0.5" → "พลาสติกใส" (ไม่ใช่ "พลาสติกใส 0")
 */
export function sharedLabel(names: string[], fallback: string, thai = true): string {
  const uniq = [...new Set(names)];
  let p: string;
  if (uniq.length <= 1) p = uniq[0] ?? "";
  else if (thai) {
    p = rawPrefix(uniq);
    if (p && ALNUM.test(p[p.length - 1]) && uniq.some((s) => ALNUM.test(s[p.length] ?? ""))) p = p.replace(/[A-Za-z0-9]+$/, "");
    p = p.replace(/สี$/, "");
  } else p = commonPrefix(uniq);
  p = p.replace(/[\s\-#/_.(]+$/, "").trim();
  if (uniq.length > 1) p = p.replace(/\s+[\d.,*x×]+$/, "").trim();
  return p.length >= (thai && uniq.length > 1 ? 4 : 3) ? p : fallback;
}
/**
 * แบ่งของในแถวเดียวกันเป็นกลุ่ม "ชื่อขึ้นต้นเหมือนกัน" — ตัวที่ชื่อแปลกแยก (เช่น ชื่อเป็นรหัสล้วน "ZIP-N-NO.5#G515")
 * แยกออกไปตัวเดียว ไม่ทำให้ทั้งแถวแตก · กลุ่มที่เหลือ 1 ตัว = แถวรหัสเดียว
 */
export function clusterByName<T>(items: T[], name: (t: T) => string, thai: boolean): T[][] {
  if (items.length < 2 || sharedLabel(items.map(name), "", thai)) return [items];
  const byHead = new Map<string, T[]>();
  for (const it of items) {
    const k = name(it).trim().slice(0, 4).toLowerCase();
    byHead.set(k, [...(byHead.get(k) ?? []), it]);
  }
  return [...byHead.values()].flatMap((g) => (g.length > 1 && sharedLabel(g.map(name), "", thai) ? [g] : g.map((x) => [x])));
}
/** รหัสย่อในช่อง = ตัดส่วนหน้าที่ทุกรหัสเหมือนกันออก: M638-19-4004 → 19-4004 · BT-NO.5#G322 → G322 */
export function shortCodes(codes: string[]): Map<string, string> {
  const uniq = [...new Set(codes)];
  const p = commonPrefix(uniq);
  return new Map(uniq.map((c) => [c, c.slice(p.length) || c]));
}
/** คำบอกสีในชื่อวัตถุดิบ เช่น "สีม่วง" — ไว้เช็กด้วยตาว่าตรงกับสีกระเป๋าไหม */
export function colourWord(name: string | null | undefined): string | null {
  const m = txt(name).match(/สี[^\s#(),/]+/);
  return m ? m[0] : null;
}

function cellStatus(list: { status: MatStatus; remaining: number }[]): FamilyCellStatus {
  const remaining = list.reduce((n, l) => n + l.remaining, 0);
  if (remaining > EPS) return list.some((l) => l.status !== "buy") ? "partial" : "buy";
  // ไม่มีอะไรต้องซื้อแล้ว → โชว์สถานะที่ "ช้าสุด" (ยังไม่ถึงมือ) ก่อน
  const order: MatStatus[] = ["requested", "ordered", "received", "have", "ready", "skip"];
  for (const s of order) if (list.some((l) => l.status === s)) return s;
  return "skip";
}

/** แปลงข้อมูล 1 รุ่น → ตาราง ของ × สี · merge = วิธีรวมแถว (ตั้งค่ากลาง) */
export function buildFamilySheet(input: FamilyInput, merge: FamilyMergeMode = "auto"): FamilySheet {
  const thai = merge === "auto";
  const skuInfo = new Map(input.skus.map((s) => [s.code, s]));
  // คอลัมน์ = SKU (เรียงรหัส) — หลายใบของสีเดียวกันรวมกัน
  const colIdx = new Map<string, number>();
  const columns: FamilyColumn[] = [];
  for (const mo of [...input.mos].sort((a, b) => natural(a.product_sku, b.product_sku) || natural(a.mo_no, b.mo_no))) {
    let i = colIdx.get(mo.product_sku);
    if (i == null) {
      i = columns.length; colIdx.set(mo.product_sku, i);
      const s = skuInfo.get(mo.product_sku);
      columns.push({ sku: mo.product_sku, variant: s?.variant ?? null, image_url: s?.image_url ?? null, qty: 0, mos: [], no_materials: false });
    }
    columns[i].qty += Number(mo.qty) || 0;
    columns[i].mos.push({ id: mo.id, mo_no: mo.mo_no, qty: Number(mo.qty) || 0, due_date: mo.due_date ?? null });
  }
  const moCol = new Map(input.mos.map((m) => [m.mo_no, colIdx.get(m.product_sku)!]));
  const nCol = columns.length;
  const colsWithLines = new Set([...input.buy, ...input.cut].map((l) => moCol.get(l.mo_no)));
  columns.forEach((c, i) => { c.no_materials = !colsWithLines.has(i); });

  /* ── ของที่ต้องซื้อ ── */
  type CodeAgg = { key: string; code: string | null; name: string; type: string; uom: string; image: string | null; seq: number;
    cols: Map<number, { qty: number; remaining: number; lines: FamilyBuyLine[]; missing: boolean }> };
  const codes = new Map<string, CodeAgg>();
  for (const l of input.buy) {
    const c = moCol.get(l.mo_no); if (c == null) continue;
    const key = l.code ? `c:${l.code}` : `n:${txt(l.name)}`;
    let a = codes.get(key);
    if (!a) {
      a = { key, code: l.code, name: txt(l.name) || txt(l.code) || "-", type: txt(l.type) || "อื่น ๆ", uom: txt(l.uom), image: l.image_url, seq: l.seq, cols: new Map() };
      codes.set(key, a);
    }
    a.seq = Math.min(a.seq, l.seq);
    if (!a.image && l.image_url) a.image = l.image_url;
    const cell = a.cols.get(c) ?? { qty: 0, remaining: 0, lines: [], missing: false };
    cell.qty = r4(cell.qty + l.required); cell.remaining = r4(cell.remaining + l.remaining);
    cell.lines.push(l); if (!(l.qty_per > 0)) cell.missing = true;
    a.cols.set(c, cell);
  }
  const usedByAll = (a: CodeAgg) => nCol > 1 && a.cols.size === nCol;
  // ของที่ไม่ได้ใช้ทุกสี → จัดเป็น "ช่อง" ตามชนิด+หน่วย: สีละ 1 รหัสต่อแถว (รหัสที่ k ของแต่ละสี เรียงตามลำดับใน BOM)
  const slots = new Map<string, Map<number, CodeAgg>[]>();
  const singles: CodeAgg[] = [];
  for (const a of [...codes.values()].sort((x, y) => x.seq - y.seq || natural(x.name, y.name))) {
    if (merge === "none" || nCol <= 1 || usedByAll(a)) { singles.push(a); continue; }
    const gk = `${a.type}|${a.uom}`;
    const rows = slots.get(gk) ?? [];
    for (const c of a.cols.keys()) {
      let k = 0;
      while (rows[k]?.has(c)) k++;
      (rows[k] ??= new Map()).set(c, a);
    }
    slots.set(gk, rows);
  }

  const buyCell = (a: CodeAgg, c: number, short: Map<string, string> | null): FamilyBuyCell | null => {
    const v = a.cols.get(c); if (!v) return null;
    const po = [...new Set(v.lines.flatMap((l) => l.po_nos))];
    return {
      qty: v.qty, remaining: v.remaining, status: cellStatus(v.lines), po_nos: po,
      code: a.code, short: short && a.code ? short.get(a.code) ?? a.code : null, colour: short ? colourWord(a.name) : null, missing_qty: v.missing,
    };
  };
  const finishRow = (row: Omit<FamilyBuyRow, "total" | "remaining" | "missing_qty">): FamilyBuyRow => {
    const cs = row.cells.filter((x): x is FamilyBuyCell => !!x);
    return { ...row, total: r4(cs.reduce((n, x) => n + x.qty, 0)), remaining: r4(cs.reduce((n, x) => n + x.remaining, 0)), missing_qty: cs.some((x) => x.missing_qty) };
  };
  const singleRow = (a: CodeAgg, pick?: (c: number) => boolean): FamilyBuyRow => finishRow({
    kind: "single", type: a.type, label: a.name, code: a.code, codes: a.code ? [a.code] : [], image_url: a.image, uom: a.uom, seq: a.seq,
    cells: columns.map((_, c) => (!pick || pick(c) ? buyCell(a, c, null) : null)),
  });

  const varies: FamilyBuyRow[] = [];
  const singleOut: FamilyBuyRow[] = singles.map((a) => singleRow(a));
  for (const rows of slots.values()) {
    for (const slot of rows) {
      // รวมเป็นแถว "ต่างสี" เฉพาะของที่ชื่อมีส่วนหน้าร่วมกัน (ของเดียวกันคนละสี) — คนละของจริง
      // (เช่น รุ่นย่อย M ใช้หางซิป R ใช้หัวซิป · ชื่อเป็นรหัสล้วน) แยกแถวละรหัส ไม่งั้นแถวเดียวสลับของไปมาอ่านงง
      for (const aggs of clusterByName([...new Set(slot.values())], (a) => a.name, thai)) {
        const inGroup = (c: number) => { const a = slot.get(c); return !!a && aggs.includes(a); };
        if (aggs.length === 1) { singleOut.push(singleRow(aggs[0], (c) => slot.get(c) === aggs[0])); continue; }
        const codeList = aggs.map((a) => a.code).filter((x): x is string => !!x);
        const short = shortCodes(codeList);
        varies.push(finishRow({
          kind: "varies", type: aggs[0].type, label: sharedLabel(aggs.map((a) => a.name), aggs[0].type, thai), code: null, codes: codeList,
          image_url: aggs.find((a) => a.image)?.image ?? null, uom: aggs[0].uom, seq: Math.min(...aggs.map((a) => a.seq)),
          cells: columns.map((_, c) => (inGroup(c) ? buyCell(slot.get(c)!, c, short) : null)),
        }));
      }
    }
  }
  const ordered = (list: FamilyBuyRow[]) => list.sort((x, y) => x.seq - y.seq || natural(x.label, y.label));

  /* ── บล็อกตัด ── */
  const sizeQty = new Map<string, Map<string, number>>();
  for (const m of input.mos) sizeQty.set(m.mo_no, new Map((m.size_breakdown ?? []).map((s) => [s.label, Number(s.qty) || 0])));
  const moQty = new Map(input.mos.map((m) => [m.mo_no, Number(m.qty) || 0]));
  type CutAgg = { code: string | null; name: string; image: string | null; seq: number; pcs: number; done: boolean };
  // blockKey → คอลัมน์ → รหัส → ยอด
  const blocks = new Map<string, { type: string; block: string | null; width: number | null; length: number | null; pieces: number | null; size_label: string | null; seq: number;
    cols: Map<number, Map<string, CutAgg>> }>();
  for (const l of input.cut) {
    if (!needsCut({ material_type: l.type, cut_block_code: l.block, cut_length: l.length, pieces: l.pieces })) continue;
    const c = moCol.get(l.mo_no); if (c == null) continue;
    const rowQty = l.size_label ? sizeQty.get(l.mo_no)?.get(l.size_label) ?? 0 : moQty.get(l.mo_no) ?? 0;
    const pcs = (Number(l.pieces) || 1) * rowQty;
    const type = txt(l.type) || "อื่น ๆ";
    // ช่องกว้าง/ยาวว่าง = 0 (บางบรรทัด BOM เว้นว่าง บางบรรทัดใส่ 0 — ขนาดเดียวกัน ต้องอยู่แถวเดียวกัน)
    const W = Number(l.width) || 0, L = Number(l.length) || 0, P = Number(l.pieces) || 1;
    const bk = [type, txt(l.block), W, L, P, txt(l.size_label)].join("|");
    const b = blocks.get(bk) ?? { type, block: txt(l.block) || null, width: W, length: L, pieces: P, size_label: txt(l.size_label) || null, seq: l.seq, cols: new Map() };
    b.seq = Math.min(b.seq, l.seq);
    const perCol = b.cols.get(c) ?? new Map<string, CutAgg>();
    const ck = l.code ?? `n:${txt(l.name)}`;
    const cur = perCol.get(ck) ?? { code: l.code, name: txt(l.name) || txt(l.code) || "-", image: l.image_url, seq: l.seq, pcs: 0, done: true };
    cur.pcs += pcs; cur.done = cur.done && !!l.cut_done; cur.seq = Math.min(cur.seq, l.seq);
    perCol.set(ck, cur); b.cols.set(c, perCol);
    blocks.set(bk, b);
  }
  const sizeText = (w: number | null, l: number | null) => {
    const W = Number(w) || 0, L = Number(l) || 0;
    return W > 0 && L > 0 ? `${r2(W)} × ${r2(L)}` : L > 0 ? `ยาว ${r2(L)}` : W > 0 ? `กว้าง ${r2(W)}` : "—";
  };
  const cutRows: (FamilyCutRow & { seq: number })[] = [];
  for (const b of blocks.values()) {
    // สีละหลายรหัสในบล็อกขนาดเดียวกัน (เช่น ตัวนอก + ตัวใน) → แยกแถวตามลำดับใน BOM
    const depth = Math.max(...[...b.cols.values()].map((m) => m.size));
    const pushRow = (pick: (CutAgg | null)[]) => {
      const used = pick.filter((x): x is CutAgg => !!x);
      if (!used.length) return;
      const isVaries = new Set(used.map((x) => x.code ?? x.name)).size > 1;
      const short = isVaries ? shortCodes(used.map((x) => x.code).filter((x): x is string => !!x)) : null;
      cutRows.push({
        type: b.type, block: b.block, size: sizeText(b.width, b.length) + (b.size_label ? ` · ไซส์ ${b.size_label}` : ""),
        pieces_per: Number(b.pieces) || 1, varies: isVaries,
        material: isVaries ? sharedLabel(used.map((x) => x.name), b.type, thai) : used[0].name,
        code: isVaries ? null : used[0].code, image_url: isVaries ? null : used[0].image,
        cells: pick.map((x) => (x ? { pcs: x.pcs, code: x.code, short: short && x.code ? short.get(x.code) ?? x.code : null, colour: isVaries ? colourWord(x.name) : null, done: x.done } : null)),
        total: used.reduce((n, x) => n + x.pcs, 0),
        seq: Math.min(b.seq, ...used.map((x) => x.seq)),
      });
    };
    for (let k = 0; k < depth; k++) {
      const pick = columns.map((_, c) => [...(b.cols.get(c)?.values() ?? [])].sort((x, y) => x.seq - y.seq)[k] ?? null);
      const used = pick.filter((x): x is CutAgg => !!x);
      const keyOf = (x: CutAgg) => x.code ?? x.name;
      // ตั้ง "ไม่รวม" → แถวละวัตถุดิบ · ไม่งั้นรวมเฉพาะกลุ่มที่ชื่อขึ้นต้นเหมือนกัน (ตัวแปลกแยกออกไปแถวเดียว) เหมือนฝั่งซื้อ
      const distinct = [...new Map(used.map((x) => [keyOf(x), x])).values()];
      const groups = merge === "none" ? distinct.map((x) => [x]) : clusterByName(distinct, (x) => x.name, thai);
      for (const g of groups) {
        const keys = new Set(g.map(keyOf));
        pushRow(pick.map((x) => (x && keys.has(keyOf(x)) ? x : null)));
      }
    }
  }
  const cutGroups: { type: string; seq: number; rows: FamilyCutRow[] }[] = [];
  for (const r of cutRows.sort((x, y) => x.seq - y.seq || natural(x.material, y.material) || natural(x.block ?? "", y.block ?? "") || natural(x.size, y.size))) {
    // จัดกลุ่มตามชนิดวัตถุดิบ (PU / ผ้า / ซิป / ตัวเสริม ...) — กลุ่มเรียงตามลำดับใน BOM
    const { seq, ...row } = r;
    let g = cutGroups.find((x) => x.type === row.type);
    if (!g) { g = { type: row.type, seq, rows: [] }; cutGroups.push(g); }
    g.rows.push(row);
  }
  for (const g of cutGroups) g.rows.sort((x, y) => natural(x.material, y.material) || natural(x.block ?? "", y.block ?? ""));

  const dues = input.mos.map((m) => m.due_date).filter((d): d is string => !!d).sort();
  return {
    key: input.key,
    title_code: input.parent?.code ?? columns[0]?.sku ?? "-",
    title_name: input.parent?.name ?? null,
    image_url: input.parent?.image_url ?? columns[0]?.image_url ?? null,
    columns,
    buy: { varies: ordered(varies), single: ordered(singleOut) },
    cut: cutGroups.map(({ type, rows }) => ({ type, rows })),
    stats: {
      skus: nCol, mos: input.mos.length, qty: columns.reduce((n, c) => n + c.qty, 0),
      codes: codes.size,
      codes_to_buy: [...codes.values()].filter((a) => [...a.cols.values()].some((v) => v.remaining > EPS)).length,
      cut_rows: cutRows.length, cut_pieces: cutRows.reduce((n, r) => n + r.total, 0),
      due_min: dues[0] ?? null,
    },
  };
}

/** ใบที่พิมพ์ได้: buy = ซื้อ-ตัด (ของ × สี) · route = ติดตามงานแบบ A · status = ตามสถานะแบบ D · track = A + D */
export type FamilySheetKind = "buy" | "route" | "status" | "track";

/** ลิงก์หน้าพิมพ์รวมทั้งรุ่น — ทุกทางเข้าเรียกตัวนี้ (หน้าพิมพ์ใบเดียว · พิมพ์รวม · รายการใบสั่งผลิต · หัวกลุ่มบนบอร์ด) */
export function familyPrintUrl(by: { mo: string } | { ids: string[] } | { parent: string }, sheet?: FamilySheetKind): string {
  const p = new URLSearchParams();
  if ("mo" in by) p.set("mo", by.mo);
  else if ("ids" in by) p.set("ids", by.ids.join(","));
  else p.set("parent", by.parent);
  if (sheet && sheet !== "buy") p.set("sheet", sheet);
  return `/print/work-order/family?${p.toString().replace(/%2C/g, ",")}`;
}

/* ─────────────── HTML ใบพิมพ์ ─────────────── */
export type FamilyPrintOptions = {
  buy: boolean; cut: boolean;
  /** เฉพาะที่ยังต้องซื้อ — ช่องที่ขอ/สั่ง/มีของแล้วเป็น "–" และซ่อนแถวที่ครบแล้ว */
  only_to_buy: boolean;
  /** วันที่พิมพ์ (ข้อความพร้อมโชว์) */
  printed: string;
  /** ตั้งค่าหน้าตา (ค่ากลาง family_print_settings) */
  settings: FamilyPrintSettings;
  /** บาร์โค้ดเลขใบที่สร้างไว้แล้วในเบราว์เซอร์ (woBarcodeHtml / woQrHtml) · key = เลขใบสั่งผลิต */
  codes?: Record<string, MoCodes>;
  /** ตรวจข้อมูล (แบบ B): รหัส → คีย์ปัญหา · แถว/การ์ดที่มีรหัสนี้ติดกรอบเหลือง + ปุ่ม "แก้" (เฉพาะบนจอ ไม่ติดตอนพิมพ์) */
  flags?: Record<string, string>;
};
export const FAMILY_DEFAULT_OPTIONS: FamilyPrintOptions = { buy: true, cut: true, only_to_buy: false, printed: "", settings: FAMILY_DEFAULT_SETTINGS };
export type MoCodes = { line: string; qr: string };

// ตัวช่วย HTML — export ให้ใบติดตามงาน (lib/family-track) ใช้ชุดเดียวกัน
export const esc = (v: unknown) => txt(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const num = (n: number) => r2(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });
export const thDate = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
};
export const img = (url: string | null, cls: string) => (url ? `<img class="${cls}" src="${esc(url)}" alt="" />` : `<span class="${cls} fp-noimg"></span>`);
export const TICK = `<span class="tick-box"></span>`;

/** บาร์โค้ดเลขใบตามตั้งค่า: เส้น (+ เลขใต้เส้น) · QR · ทั้งคู่ — ยังไม่ได้สร้าง/ปิดไว้ = ค่าว่าง */
export function moCodesHtml(moNo: string, codes: Record<string, MoCodes> | undefined, mode: FamilyPrintSettings["barcode"]): string {
  const c = codes?.[moNo];
  if (!c || mode === "none") return "";
  const line = mode !== "qr" && c.line ? `<div class="fp-bc-line">${c.line}<div class="fp-bc-text">${esc(moNo)}</div></div>` : "";
  const qr = mode !== "line" && c.qr ? `<div class="fp-bc-qr">${c.qr}</div>` : "";
  return line || qr ? `<div class="fp-codes">${line}${qr}</div>` : "";
}
/** คีย์ปัญหาของแถว (รหัสแรกที่ติดธง) — ไม่มี = ค่าว่าง */
const flagOf = (codes: (string | null | undefined)[], opt: FamilyPrintOptions) => codes.map((c) => (c ? opt.flags?.[c] : undefined)).find(Boolean) ?? "";
const flagAttr = (fk: string) => (fk ? ` data-fix="${esc(fk)}"` : "");
const penHtml = (fk: string) => (fk ? `<span class="fp-pen" data-fix="${esc(fk)}">แก้</span>` : "");

/** ช่องที่สีนั้นไม่ใช้ — ว่าง / ขีด / ลายขีด ตามตั้งค่า */
const emptyTd = (s: FamilyPrintSettings) =>
  s.empty === "hatch" ? `<td class="fp-empty"></td>` : s.empty === "dash" ? `<td class="fp-cell fp-dim">–</td>` : `<td></td>`;
/** ช่องรูปวัตถุดิบ — ไม่มีคอลัมน์รูป = ค่าว่าง (ไม่มี <td>) */
const imgTd = (url: string | null, s: FamilyPrintSettings) =>
  s.img === "none" ? "" : `<td class="img-cell">${url ? img(url, "mat-img") : s.img === "show" ? img(null, "mat-img") : ""}</td>`;

export const FAMILY_STATUS_LABEL: Record<FamilyCellStatus, string> = {
  buy: "", partial: "ขาด", requested: "ขอซื้อแล้ว", ordered: "สั่งแล้ว", received: "รับแล้ว", have: "มีของ", ready: "เตรียมแล้ว", skip: "ไม่ต้องซื้อ",
};
const DONE: FamilyCellStatus[] = ["ordered", "received", "have", "ready", "skip"];

function colgroup(n: number, lead: string[], tail: string[]) {
  return `<colgroup>${lead.map((w) => `<col style="width:${w}" />`).join("")}${Array.from({ length: n }, () => "<col />").join("")}${tail.map((w) => `<col style="width:${w}" />`).join("")}</colgroup>`;
}
function skuHeads(cols: FamilyColumn[]) {
  return cols.map((c) => `<th class="fp-skuh">${img(c.image_url, "fp-skuimg")}<div class="fp-skucode">${esc(c.sku)}</div><div class="fp-skuqty">${num(c.qty)} ชิ้น</div></th>`).join("");
}

function buyCellHtml(cell: FamilyBuyCell | null, opt: FamilyPrintOptions): string {
  const s = opt.settings, tk = s.tick === "before" ? TICK : "";
  if (!cell) return emptyTd(s);
  const short = s.cell !== "num" && cell.short ? `<div class="fp-sub fp-code">${esc(cell.short)}</div>` : "";
  if (cell.missing_qty) return `<td class="fp-cell fp-warn">${tk}?${short}</td>`;
  if (opt.only_to_buy && cell.remaining <= EPS) return `<td class="fp-cell fp-dim">–</td>`;
  const q = opt.only_to_buy ? cell.remaining : cell.qty;
  const st = cell.status === "partial" ? `ขาด ${num(cell.remaining)}` : FAMILY_STATUS_LABEL[cell.status];
  return `<td class="fp-cell${DONE.includes(cell.status) && !opt.only_to_buy ? " fp-done" : ""}"><div class="fp-q">${tk}${num(q)}</div>`
    + `${short}${s.cell === "full" && cell.colour ? `<div class="fp-sub">${esc(cell.colour)}</div>` : ""}`
    + `${st && !opt.only_to_buy ? `<div class="fp-st">${esc(st)}</div>` : ""}</td>`;
}

function buyRowHtml(r: FamilyBuyRow, opt: FamilyPrintOptions): string {
  if (opt.only_to_buy && r.remaining <= EPS && !r.missing_qty) return "";
  const name = r.kind === "varies"
    ? `<div class="fp-name">${esc(r.label)}</div><div class="fp-sub">${esc(r.type)} · ต่างสี ${r.codes.length} รหัส</div>`
    : `<div class="fp-name">${esc(r.label)}</div><div class="fp-sub fp-code">${esc(r.code ?? "")}</div>`;
  const tot = r.missing_qty && r.total <= EPS
    ? `<span class="fp-warn">BOM ยังไม่ใส่จำนวน</span>`
    : opt.only_to_buy
      ? `${num(r.remaining)} ${esc(r.uom)}`
      : `${num(r.total)} ${esc(r.uom)}${r.remaining > EPS && r.remaining < r.total - EPS ? `<div class="fp-st">ต้องซื้อ ${num(r.remaining)}</div>` : r.remaining <= EPS ? `<div class="fp-st">ครบแล้ว</div>` : ""}`;
  const fk = flagOf([r.code, ...r.codes], opt);
  return `<tr${fk ? ` class="fp-flag"${flagAttr(fk)}` : ""}>${imgTd(r.image_url, opt.settings)}<td>${name}${penHtml(fk)}</td>${r.cells.map((c) => buyCellHtml(c, opt)).join("")}<td class="text-right fp-tot">${tot}</td>${opt.settings.tick === "row" ? `<td class="text-center">${TICK}</td>` : ""}</tr>`;
}

/** หมวด "ชนิดวัตถุดิบ" ที่ยังไม่ได้ตั้ง — บอกให้รู้ว่าทำไมแถวนี้ไม่ไปรวมกับพวก */
const typeLabel = (t: string) => (t === "อื่น ๆ" ? "อื่น ๆ (ยังไม่ได้ตั้งชนิดวัตถุดิบ)" : t);

function buySectionHtml(s: FamilySheet, opt: FamilyPrintOptions): string {
  const st = opt.settings, n = s.columns.length;
  const lead = st.img === "none" ? ["44mm"] : [imgColW(st), "44mm"];
  const tail = st.tick === "row" ? ["22mm", "7mm"] : ["22mm"];
  const span = n + lead.length + tail.length;
  const gh = (label: string, rows: string) => (rows ? `<tr class="fp-gh"><td colspan="${span}">${esc(label)}</td></tr>${rows}` : "");
  let body = "";
  if (st.group === "type") {
    // หมวดตามชนิดวัตถุดิบ: ของชนิดเดียวกันอยู่ติดกันเสมอ (แถวต่างสี + แถวรหัสเดียว) เรียงตามลำดับใน BOM
    const all = [...s.buy.varies, ...s.buy.single].sort((x, y) => x.seq - y.seq || natural(x.label, y.label));
    const types = [...new Set(all.map((r) => r.type))];
    for (const t of types) body += gh(typeLabel(t), all.filter((r) => r.type === t).map((r) => buyRowHtml(r, opt)).join(""));
  } else {
    body = gh("ของชนิดเดียวกันแต่ต่างสี — แถวเดียว ช่องบอกรหัสของสีนั้น", s.buy.varies.map((r) => buyRowHtml(r, opt)).join(""))
      + gh(n > 1 ? "ใช้ทุกสี / บางสี (รหัสเดียวกัน)" : "วัตถุดิบ", s.buy.single.map((r) => buyRowHtml(r, opt)).join(""));
  }
  const legend = opt.only_to_buy
    ? "เฉพาะที่ยังต้องซื้อ · ตัวเลข = จำนวนที่ยังขาด · – = ขอ/สั่ง/มีของแล้ว"
    : "ตัวเลข = ยอดต้องใช้ของสีนั้น · ช่องเทา = สั่งแล้ว/มีของ/เตรียมแล้ว · ? = BOM ยังไม่ใส่จำนวน";
  return `<section class="fp-section"><div class="section-title">1) ของที่ต้องซื้อ / เตรียม <span class="fp-legend">${legend}</span></div>`
    + (body
      ? `<table class="summary-table fp-table">${colgroup(n, lead, tail)}<thead><tr>${st.img === "none" ? "" : "<th>รูป</th>"}<th>วัตถุดิบ</th>${skuHeads(s.columns)}<th>รวม</th>${st.tick === "row" ? "<th>✓</th>" : ""}</tr></thead><tbody>${body}</tbody></table>`
      : `<div class="fp-none">${s.buy.varies.length + s.buy.single.length === 0 ? "ใบสั่งผลิตในรุ่นนี้ยังไม่มีรายการวัตถุดิบ (ยังไม่ได้กางสูตร BOM)" : "ไม่มีของที่ต้องซื้อแล้ว"}</div>`)
    + `</section>`;
}

function cutSectionHtml(s: FamilySheet, no: number, opt: FamilyPrintOptions): string {
  const st = opt.settings, n = s.columns.length;
  const lead = st.img === "none" ? ["44mm", "11mm"] : [imgColW(st), "44mm", "11mm"];
  const span = n + lead.length + 1;
  let body = "";
  for (const g of s.cut) {
    body += `<tr class="fp-gh"><td colspan="${span}">${esc(typeLabel(g.type))}</td></tr>`;
    for (const r of g.rows) {
      // ขนาดตัดตัวใหญ่ (สิ่งที่ช่างตัดดูก่อน) · รหัสบล็อก + วัตถุดิบตัวเล็กบรรทัดล่าง
      const label = `<div class="fp-size">${esc(r.size)}</div><div class="fp-sub">${r.block ? `บล็อก ${esc(r.block)} · ` : ""}${esc(r.material)}${r.varies ? " — สีตามรุ่น" : r.code ? ` · ${esc(r.code)}` : ""}</div>`;
      const cells = r.cells.map((c) => (c
        ? `<td class="fp-cell${c.done ? " fp-done" : ""}"><div class="fp-q">${st.tick === "before" ? `${TICK}${num(c.pcs)}` : `${num(c.pcs)} ${TICK}`}</div>`
          + `${st.cell !== "num" && c.short ? `<div class="fp-sub fp-code">${esc(c.short)}</div>` : ""}${st.cell === "full" && c.colour ? `<div class="fp-sub">${esc(c.colour)}</div>` : ""}${c.done ? `<div class="fp-st">ตัดแล้ว</div>` : ""}</td>`
        : emptyTd(st))).join("");
      const fk = flagOf([r.code, ...r.cells.map((c) => c?.code)], opt);
      body += `<tr${fk ? ` class="fp-flag"${flagAttr(fk)}` : ""}>${imgTd(r.image_url, st)}<td>${label}${penHtml(fk)}</td><td class="text-center">×${num(r.pieces_per)}</td>${cells}<td class="text-right fp-tot">${num(r.total)}</td></tr>`;
    }
  }
  return `<section class="fp-section"><div class="section-title">${no}) บล็อกตัด <span class="fp-legend">ขนาดเดียวกันตัดรวดเดียวทุกสี · ติ๊กทีละช่องเมื่อตัดสีนั้นเสร็จ · ตัวเลข = จำนวนชิ้น (ไม่รวมอะไหล่)</span></div>`
    + (body
      ? `<table class="doc-table fp-table">${colgroup(n, lead, ["16mm"])}<thead><tr>${st.img === "none" ? "" : "<th>รูป</th>"}<th>ขนาดตัด (ซม.)</th><th>ชิ้น/ใบ</th>${skuHeads(s.columns)}<th>รวมชิ้น</th></tr></thead><tbody>${body}</tbody></table>`
      : `<div class="fp-none">รุ่นนี้ไม่มีบล็อกตัดในใบสั่งผลิต</div>`)
    + `</section>`;
}

/** หัวใบ: รูปรุ่น + รหัส/ชื่อ + จำนวน + การ์ดสีทุกสี (เลขใบสั่งผลิตเต็ม + บาร์โค้ด) */
export function familyHeadHtml(s: FamilySheet, opt: FamilyPrintOptions): string {
  const st = s.stats, bc = opt.settings.barcode;
  const cards = s.columns.map((c) => { const fk = flagOf([c.sku], opt); return `<div class="fp-card${fk ? " fp-flag" : ""}"${flagAttr(fk)}><div class="fp-cardtop">${img(c.image_url, "fp-cardimg")}<div class="fp-cardtxt"><div class="fp-skucode">${esc(c.sku)}</div>`
    + `${c.variant ? `<div class="fp-sub">${esc(c.variant)}${penHtml(fk)}</div>` : penHtml(fk)}<div><b>${num(c.qty)}</b> ชิ้น</div>`
    + `${c.no_materials ? `<div class="fp-warn">ยังไม่มีรายการวัตถุดิบ</div>` : ""}</div></div>`
    + c.mos.map((m) => `<div class="fp-mo"><span class="fp-mo-no">${esc(m.mo_no)}</span>${c.mos.length > 1 ? ` <span class="fp-sub">${num(m.qty)} ชิ้น</span>` : ""}${moCodesHtml(m.mo_no, opt.codes, bc)}</div>`).join("")
    + `</div>`; }).join("");
  // บาร์โค้ดเส้นกว้าง ~5.5 ซม. → การ์ดแถวละ 3 · ไม่มีเส้น = แถวละ 6 เหมือนเดิม
  const perRow = opt.settings.sizes?.per_row || (bc === "both" || bc === "line" ? 3 : 6);   // ตั้งเองได้ในแผง (0 = อัตโนมัติ)
  return `<div class="doc-head-inline"><div class="doc-title">ใบสั่งผลิตรวมทั้งรุ่น</div><div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง</div></div>
<section class="fp-hero">
  <div class="fp-photo">${img(s.image_url, "fp-heroimg")}</div>
  <div class="fp-model"><div class="muted">รุ่น (สินค้าแม่)</div><div class="product-code">${esc(s.title_code)}</div>${s.title_name ? `<div class="product-name">${esc(s.title_name)}</div>` : ""}</div>
  <div class="fp-qty"><div class="muted">รวมทั้งรุ่น</div><div class="qty-big">${num(st.qty)}</div><div>ชิ้น · ${st.skus} สี · ${st.mos} ใบ</div></div>
  <div class="fp-meta"><div><span class="label">พิมพ์:</span> ${esc(opt.printed || "-")}</div><div><span class="label">กำหนดส่งเร็วสุด:</span> ${esc(thDate(st.due_min))}</div>
    <div><span class="label">วัตถุดิบ:</span> ${st.codes} รหัส (ยังต้องซื้อ ${st.codes_to_buy})</div><div><span class="label">บล็อกตัด:</span> ${st.cut_rows} แบบ · ${num(st.cut_pieces)} ชิ้น</div></div>
</section>
<div class="fp-cards" style="grid-template-columns:repeat(${Math.min(Math.max(s.columns.length, 1), perRow)},minmax(0,1fr))">${cards}</div>`;
}

/** เนื้อใบ: ซื้อ / ตัด / กล่องลงชื่อ (ตามที่เลือกพิมพ์) */
export function familyBodyHtml(s: FamilySheet, opt: FamilyPrintOptions): string {
  const parts: string[] = [];
  if (opt.buy) parts.push(buySectionHtml(s, opt));
  if (opt.cut) parts.push(cutSectionHtml(s, opt.buy ? 2 : 1, opt));
  const boxes: SignBox[] = [];
  const box = (title: string): SignBox => ({ title, lines: [{ kind: "sign" }, { kind: "date" }] });
  if (opt.buy) boxes.push(box("ผู้ซื้อ / เตรียมของ"));
  if (opt.cut) boxes.push(box("ผู้ตัด"));
  boxes.push(box("ผู้ตรวจ"));
  parts.push(signoffHtml(boxes, { title: "ลงชื่อ", cols: boxes.length }));
  return parts.join("\n");
}

/** ชุดข้อมูลต่อแผ่น (1 รุ่น = 1 เอกสาร) สำหรับ buildReportHtmlMulti */
export function familyHtmlData(s: FamilySheet, opt: FamilyPrintOptions): Record<string, unknown> {
  return { head_html: familyHeadHtml(s, opt), body_html: familyBodyHtml(s, opt) };
}

/** แนวกระดาษ: สีเยอะ (> 4 คอลัมน์) ใช้แนวนอน */
export const familyOrientation = (sheets: FamilySheet[]): "portrait" | "landscape" =>
  sheets.some((s) => s.columns.length > 4) ? "landscape" : "portrait";

const FAMILY_CSS = `
.doc { font-size: 10px; color: #111827; padding: 12mm 10mm; }
.doc-head-inline { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; border-bottom: 0.15mm solid #e2e8f0; padding-bottom: 1mm; margin-bottom: 2.5mm; }
.doc-title { font-size: 18px; font-weight: 800; }
.company-name { font-size: 11px; font-weight: 700; color: #475569; }
.muted { color: #64748b; font-size: 9px; }
.label { font-weight: 700; }
.fp-hero { display: grid; grid-template-columns: 30mm 1.4fr 30mm 1.3fr; gap: 3mm; border: 0.25mm solid #111; padding: 2mm; margin-bottom: 2mm; align-items: center; }
.fp-heroimg { display: block; max-width: 100%; max-height: 28mm; margin: 0 auto; border: 0.15mm solid #cbd5e1; background: #fff; }
.product-code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 18px; font-weight: 800; color: #0f172a; }
.product-name { font-size: 11px; font-style: italic; color: #334155; line-height: 1.3; }
.fp-qty { text-align: center; border-left: 0.15mm solid #e2e8f0; border-right: 0.15mm solid #e2e8f0; }
.qty-big { font-size: 24px; font-weight: 900; line-height: 1; }
.fp-meta { line-height: 1.55; }
.fp-cards { display: grid; gap: 1.5mm; margin-bottom: 1mm; }
.fp-card { border: 0.15mm solid #94a3b8; border-radius: 0.6mm; padding: 1mm; min-width: 0; break-inside: avoid; }
.fp-cardtop { display: flex; gap: 1.5mm; align-items: center; }
.fp-mo { margin-top: 0.8mm; }
.fp-mo-no { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 800; font-size: 9.5px; }
/* บาร์โค้ดเลขใบ: เส้น (ขอบว่างซ้ายขวา ≥ 10 เส้นให้เครื่องยิงจับได้) + QR */
.fp-codes { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1.5mm; margin-top: 0.6mm; }
.fp-bc-line { padding: 0 3.5mm; background: #fff; line-height: 1; }
.fp-bc-line .wo-barcode-svg { display: block; height: 8mm; }
.fp-bc-text { margin-top: 0.5mm; text-align: center; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 7.5px; letter-spacing: 0.4mm; }
.fp-bc-qr .wo-qr { display: block; width: 13mm; height: 13mm; }
/* ตรวจข้อมูล (แบบ B) — กรอบเหลือง + ปุ่ม "แก้" เฉพาะบนจอ */
@media screen {
  .fp-flag > td { background: #fef3c7 !important; }
  .fp-flag > td:first-child, .fp-card.fp-flag { box-shadow: inset 0.8mm 0 0 #f59e0b; }
  .fp-card.fp-flag { background: #fef3c7; outline: 0.4mm solid #f59e0b; }
  [data-fix] { cursor: pointer; }
  .fp-pen { display: inline-block; margin-left: 1.5mm; padding: 0 1.5mm; border-radius: 1mm; background: #f59e0b; color: #fff; font-size: 9px; font-weight: 700; line-height: 1.6; vertical-align: 0.3mm; }
}
@media print { .fp-pen { display: none !important; } }
.fp-size { font-size: 13px; font-weight: 800; line-height: 1.15; white-space: nowrap; }
.fp-cardimg { width: 14mm; height: 14mm; object-fit: contain; flex-shrink: 0; background: #fff; }
.fp-cardtxt { min-width: 0; line-height: 1.3; }
.fp-skucode { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 800; }
.section-title { font-size: 12px; font-weight: 800; margin: 3mm 0 1.2mm; }
.fp-legend { font-size: 8.5px; font-weight: 400; color: #64748b; margin-left: 2mm; }
.summary-table, .doc-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.summary-table th, .summary-table td, .doc-table th, .doc-table td { border: 0.15mm solid #475569; padding: 0.8mm 0.8mm; vertical-align: middle; }
.summary-table th, .doc-table th { text-align: center; font-weight: 800; background: #f1f5f9; font-size: 9px; }
.fp-skuh { line-height: 1.15; }
.fp-skuimg { display: block; width: 9mm; height: 9mm; object-fit: contain; margin: 0 auto 0.5mm; background: #fff; }
.fp-skuqty { font-weight: 400; color: #475569; }
.fp-gh td { background: #f8fafc; font-weight: 700; font-size: 9px; color: #334155; }
.fp-name { font-weight: 600; line-height: 1.25; }
.fp-sub { font-size: 8.5px; color: #475569; line-height: 1.2; }
.fp-code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; word-break: break-all; }
.fp-cell { text-align: center; line-height: 1.2; }
.fp-q { font-weight: 700; font-size: 10.5px; white-space: nowrap; }
.fp-st { font-size: 8px; font-weight: 700; color: #1e3a8a; }
.fp-done { background: #e5e7eb; }
.fp-dim, .fp-empty { color: #94a3b8; }
.fp-empty { background: repeating-linear-gradient(135deg, #fff 0, #fff 1.2mm, #f1f5f9 1.2mm, #f1f5f9 2.4mm); }
.fp-warn { color: #b45309; font-weight: 700; }
.fp-tot { font-weight: 700; line-height: 1.2; }
.fp-none { color: #64748b; padding: 2mm 0; }
.img-cell { text-align: center; padding: 0.4mm !important; }
.mat-img { display: inline-block; max-width: 100%; max-height: 10mm; object-fit: contain; vertical-align: middle; }
.fp-noimg { display: inline-block; width: 8mm; height: 8mm; border: 0.15mm dashed #cbd5e1; border-radius: 0.6mm; background: #f8fafc; }
.fp-cardimg.fp-noimg, .fp-skuimg.fp-noimg { width: 9mm; height: 9mm; }
.fp-heroimg.fp-noimg { width: 26mm; height: 26mm; }
.tick-box { display: inline-block; width: 3.2mm; height: 3.2mm; border: 0.2mm solid #475569; border-radius: 0.5mm; vertical-align: -0.6mm; background: #fff; }
.fp-section { margin-bottom: 1mm; }
@media print {
  .doc { padding: 7mm 8mm !important; font-size: 9px; }
  .fp-hero { padding: 1.5mm; margin-bottom: 1.5mm; }
  .fp-heroimg { max-height: 24mm; }
  .qty-big { font-size: 20px; }
  .product-code { font-size: 16px; }
  .section-title { font-size: 10.5px; margin: 2mm 0 1mm; }
  .summary-table th, .summary-table td, .doc-table th, .doc-table td { padding: 0.5mm 0.6mm; }
  .fp-q { font-size: 9.5px; }
  .mat-img { max-height: 8.5mm; }
}
`;

/**
 * เทมเพลตใบรวมทั้งรุ่น — ใช้ระบบพิมพ์กลาง (lib/template) + กล่องลงชื่อกลาง (lib/print-signoff)
 * styleCss = เส้นตาราง/ขนาดตัวอักษรจาก "ตั้งค่าใบพิมพ์" ของใบสั่งงานผลิต (woStyleCss) — ตั้งที่เดียวใช้ทั้ง 2 ใบ
 */
export function buildFamilyTemplate(orientation: "portrait" | "landscape", styleCss = ""): ReportTemplate {
  return {
    paper_size: "A4", orientation,
    header_html: "{{{head_html}}}",
    body_html: "{{{body_html}}}",
    footer_html: "",
    custom_css: FAMILY_CSS + SIGNOFF_CSS + styleCss,
  };
}
