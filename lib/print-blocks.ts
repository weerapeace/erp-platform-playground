/**
 * จัดหน้าเอกสารพิมพ์เอง (ของกลาง · เจ้าของขอ 2026-11-20) — เพิ่มช่องในการ์ด + เพิ่มกล่องบนหน้า
 *
 * - ช่องในการ์ด (CardField): ข้อมูลจาก SKU ที่ผูก (วัสดุ ซิป …) · จากบรรทัดเอกสาร (จำนวน ส่วนลด …) · ข้อความที่พิมพ์เอง
 *   ค่าว่าง = ไม่วาดแถวนั้น (SKU ไม่มีวัสดุ ก็ไม่มีแถว "วัสดุ" โล่ง ๆ)
 * - ลำดับในการ์ด (cardOrder): ช่องพื้นฐาน (รหัส ชื่อ สี/ตัวเลือก ราคา จำนวน/รวม) + ช่องที่เพิ่ม ลากเรียงได้ · รูปอยู่บนสุด/ซ้ายเสมอ
 * - กล่องบนหน้า (PageBlock): ข้อความ / รูป / เส้นคั่น วางได้ 4 จุด (PAGE_SLOTS) เรียงตามลำดับใน array
 * - ทุกช่อง/กล่องมี data-pp="f-<id>" / "b-<id>" → กดแก้หน้าตาด้วยตัวแก้ทีละกล่องเดิม (lib/print-part-style · printBlockPartDefs)
 * - ค่าเก็บใน ReportLayoutSettings (cardFields · cardOrder · pageBlocks) → จำรายใบ + เข้า "แบบ" ด้วย
 */
import type { PrintPartDef } from "@/lib/print-part-style";

export type CardFieldKind = "sku" | "line" | "text";
export type CardField = {
  id: string;
  kind: CardFieldKind;
  /** sku: ชื่อช่องใน skus_v2 · line: ชื่อช่องของบรรทัด */
  key?: string;
  /** ป้ายหน้าค่า (เช่น "วัสดุ") — ว่าง = ไม่มีป้าย */
  label: string;
  /** (text) ข้อความที่พิมพ์เอง */
  text?: string;
};

export type PageBlockSlot = "top" | "before" | "after" | "end";
export type PageBlockKind = "text" | "image" | "divider";
export type PageBlock = {
  id: string;
  slot: PageBlockSlot;
  kind: PageBlockKind;
  text?: string;
  /** (image) r2 key */
  imageKey?: string;
  /** (image) ความสูง mm */
  imageMm?: number;
};

export const PAGE_SLOTS: { key: PageBlockSlot; label: string }[] = [
  { key: "top", label: "ใต้หัวกระดาษ" },
  { key: "before", label: "ก่อนรายการ" },
  { key: "after", label: "ท้ายรายการ" },
  { key: "end", label: "ท้ายใบ (ก่อนช่องเซ็น)" },
];

/** ช่องจาก SKU ที่ผูก (skus_v2) — ดึงผ่าน /api/quotations/[id]/print-extras */
export const SKU_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "materials", label: "วัสดุ" },
  { key: "lining", label: "ซับใน" },
  { key: "zipper", label: "ซิป" },
  { key: "strap", label: "สายกระเป๋า" },
  { key: "hardware", label: "อะไหล่" },
  { key: "thread", label: "ด้าย" },
  { key: "logo", label: "โลโก้" },
  { key: "color_th", label: "สี" },
  { key: "description", label: "คำอธิบาย" },
  { key: "additional", label: "รายละเอียดเพิ่มเติม" },
  { key: "moq", label: "สั่งขั้นต่ำ (MOQ)" },
  { key: "barcode", label: "บาร์โค้ด" },
];
export const SKU_FIELD_KEYS = SKU_FIELD_OPTIONS.map((o) => o.key);

/** ช่องจากบรรทัดเอกสาร */
export const LINE_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "unit", label: "หน่วย" },
  { key: "discount", label: "ส่วนลด" },
  { key: "unit_price", label: "ราคาต่อหน่วย" },
  { key: "line_total", label: "รวมรายการ" },
];

/** ช่องพื้นฐานในการ์ด (เรียงได้) */
export const BASE_CARD_SLOTS: { key: string; label: string }[] = [
  { key: "sku", label: "รหัสสินค้า" },
  { key: "name", label: "ชื่อสินค้า" },
  { key: "note", label: "สี / ตัวเลือก" },
  { key: "price", label: "ราคา" },
  { key: "foot", label: "จำนวน / รวม" },
];
const BASE_KEYS = BASE_CARD_SLOTS.map((b) => b.key);

const ID_RE = /^[a-z0-9]{4,12}$/;
const R2_KEY_RE = /^[\w\-./]{3,300}$/;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

/** id สั้นสำหรับช่อง/กล่องใหม่ */
export const newBlockId = () => Math.random().toString(36).slice(2, 8).padEnd(6, "0");

export function normalizeCardFields(v: unknown): CardField[] {
  if (!Array.isArray(v)) return [];
  const out: CardField[] = [];
  for (const raw of v.slice(0, 20)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = String(r.id ?? "");
    if (!ID_RE.test(id) || out.some((x) => x.id === id)) continue;
    const kind = r.kind === "sku" || r.kind === "line" || r.kind === "text" ? r.kind : null;
    if (!kind) continue;
    const key = typeof r.key === "string" ? r.key : undefined;
    if (kind === "sku" && (!key || !SKU_FIELD_KEYS.includes(key))) continue;
    if (kind === "line" && (!key || !LINE_FIELD_OPTIONS.some((o) => o.key === key))) continue;
    const f: CardField = { id, kind, label: clip(r.label, 40) };
    if (key && kind !== "text") f.key = key;
    if (kind === "text") { f.text = clip(r.text, 300); if (!f.text.trim()) continue; }
    out.push(f);
  }
  return out;
}

export function normalizePageBlocks(v: unknown): PageBlock[] {
  if (!Array.isArray(v)) return [];
  const out: PageBlock[] = [];
  for (const raw of v.slice(0, 30)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = String(r.id ?? "");
    if (!ID_RE.test(id) || out.some((x) => x.id === id)) continue;
    const slot = PAGE_SLOTS.some((s) => s.key === r.slot) ? (r.slot as PageBlockSlot) : null;
    const kind = r.kind === "text" || r.kind === "image" || r.kind === "divider" ? r.kind : null;
    if (!slot || !kind) continue;
    const b: PageBlock = { id, slot, kind };
    if (kind === "text") { b.text = clip(r.text, 2000); if (!b.text.trim()) continue; }
    if (kind === "image") {
      const k = typeof r.imageKey === "string" && R2_KEY_RE.test(r.imageKey) && !r.imageKey.includes("..") && !r.imageKey.startsWith("/") ? r.imageKey : "";
      if (!k) continue;
      b.imageKey = k;
      const mm = Number(r.imageMm);
      if (Number.isFinite(mm)) b.imageMm = Math.min(150, Math.max(8, Math.round(mm)));
    }
    out.push(b);
  }
  return out;
}

/** ลำดับในการ์ด: ช่องพื้นฐาน "base:<key>" + ช่องที่เพิ่ม "f:<id>" — ตัวที่หาย ต่อท้าย · ตัวที่ไม่มีแล้ว ทิ้ง */
export function normalizeCardOrder(v: unknown, fields: CardField[]): string[] {
  const valid = new Set([...BASE_KEYS.map((k) => `base:${k}`), ...fields.map((f) => `f:${f.id}`)]);
  const out: string[] = [];
  if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && valid.has(x) && !out.includes(x)) out.push(x);
  // ช่องพื้นฐานที่หาย → แทรกตามลำดับเดิม · ช่องใหม่ → ก่อน "ราคา" (ถ้ามี) ไม่งั้นท้ายสุด
  for (const k of BASE_KEYS) if (!out.includes(`base:${k}`)) out.push(`base:${k}`);
  for (const f of fields) {
    const k = `f:${f.id}`;
    if (out.includes(k)) continue;
    const at = out.indexOf("base:price");
    if (at >= 0) out.splice(at, 0, k); else out.push(k);
  }
  return out;
}

export type PrintLineLike = { qty?: number | null; unit?: string | null; unit_price?: number | null; discount_amount?: number | null; net_amount?: number | null; line_total?: number | null };

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ค่าของช่องในการ์ดสำหรับบรรทัดนี้ — ว่าง/ไม่มี = null (ไม่วาดแถว) */
export function cardFieldValue(field: CardField, line: PrintLineLike, sku: Record<string, unknown> | null | undefined, lineTotal: number): string | null {
  if (field.kind === "text") return field.text?.trim() || null;
  if (field.kind === "sku") {
    const v = sku?.[field.key ?? ""];
    if (v == null) return null;
    const s = typeof v === "number" ? v.toLocaleString("th-TH") : String(v).trim();
    return s || null;
  }
  switch (field.key) {
    case "unit": return line.unit?.trim() || null;
    case "discount": return Number(line.discount_amount ?? 0) > 0 ? `${money(Number(line.discount_amount))} บาท` : null;
    case "unit_price": return line.unit_price != null ? `${money(Number(line.unit_price))} บาท` : null;
    case "line_total": return `${money(lineTotal)} บาท`;
    default: return null;
  }
}

/** ป้ายของช่อง (ตามตัวเลือก) */
export function cardFieldDefaultLabel(kind: CardFieldKind, key?: string): string {
  if (kind === "sku") return SKU_FIELD_OPTIONS.find((o) => o.key === key)?.label ?? "";
  if (kind === "line") return LINE_FIELD_OPTIONS.find((o) => o.key === key)?.label ?? "";
  return "";
}

/** ทะเบียนกล่องสำหรับตัวแก้ทีละกล่อง (ช่อง/กล่องที่ผู้ใช้เพิ่ม) */
export function printBlockPartDefs(fields: CardField[], blocks: PageBlock[]): PrintPartDef[] {
  return [
    ...fields.map((f): PrintPartDef => ({ key: `f-${f.id}`, label: f.kind === "text" ? `ข้อความในการ์ด: ${(f.text ?? "").slice(0, 20)}` : `ช่อง ${f.label || cardFieldDefaultLabel(f.kind, f.key)}`, kind: "text", perCard: true, baseSizePx: 12 })),
    ...blocks.map((b): PrintPartDef => ({ key: `b-${b.id}`, label: b.kind === "text" ? `กล่องข้อความ: ${(b.text ?? "").slice(0, 20)}` : b.kind === "image" ? "กล่องรูป" : "เส้นคั่น", kind: b.kind === "image" ? "image" : b.kind === "divider" ? "box" : "box", baseSizePx: 12 })),
  ];
}
