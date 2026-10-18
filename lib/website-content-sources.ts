/**
 * 📚 คลังแหล่งข้อมูล — ช่อง "เอาข้อมูลจาก" ของหัวข้อรายละเอียดสินค้า (เว็บไซต์ → ดีไซน์ → หน้าสินค้า)
 *
 *   ดึงจากสินค้า (คำอธิบาย / ฟิลด์ / จุดเด่น / ขนาด) = แหล่งในตัว ลบไม่ได้ (DETAIL_SOURCES ใน lib/website-theme)
 *   ข้อความของร้าน = theme.product.contentSources (ต่อร้าน · บันทึกพร้อมธีม)
 *     - id "shipping" = การจัดส่ง & ชำระเงิน → บรรทัดอัตโนมัติจากแท็บข้อมูลร้าน (ซ่อนได้ทีละบรรทัด) + บรรทัดที่พิมพ์เพิ่ม
 *     - อื่น ๆ = ร้านเพิ่มเอง เช่น การรับประกัน / การคืนสินค้า → หัวข้อเลือก source "custom" + sourceId
 *   ภาษาอังกฤษ: lines[].text_en ตามกฎกลาง `<key>_en` (THEME_TEXT_KEYS มี "text" อยู่แล้ว → ตารางแปลเห็นเอง)
 *     ชื่อแหล่งใช้ `name` (ไม่ใช่ label) เพราะโชว์แค่ในหลังบ้าน ไม่ต้องแปล
 *   เว็บร้านวาดเป็นรายการจุด (storefront src/lib/product-details.ts — ต้องรู้จักรูปแบบเดียวกัน)
 *
 * ไฟล์ pure (ไม่มี "use client") — ใช้ได้ทั้ง API และหน้าจอ
 */

export const SHIPPING_SOURCE_ID = "shipping";
export const SHIPPING_SOURCE_NAME = "การจัดส่ง & ชำระเงิน";

/** บรรทัดอัตโนมัติของ "การจัดส่ง & ชำระเงิน" — ลำดับเดียวกับที่เว็บร้านสร้าง (shippingLines) */
export type ShippingAutoKey = "shipping" | "payment" | "note";
export const SHIPPING_AUTO_LINES: { key: ShippingAutoKey; label: string }[] = [
  { key: "shipping", label: "ค่าส่ง / ส่งฟรี" },
  { key: "payment", label: "ช่องทางชำระเงิน" },
  { key: "note", label: "หมายเหตุการสั่งซื้อ" },
];
const AUTO_KEYS = SHIPPING_AUTO_LINES.map((a) => a.key);

export interface ContentLine {
  id: string;
  text: string;
}
export interface ContentSource {
  id: string;
  name: string;
  lines: ContentLine[];
  /** เฉพาะ shipping: บรรทัดอัตโนมัติที่ซ่อน */
  hideAuto?: ShippingAutoKey[];
}

export const MAX_CONTENT_SOURCES = 20;
export const MAX_CONTENT_LINES = 30;
export const CONTENT_LINE_MAX = 300;
export const CONTENT_NAME_MAX = 60;

const cleanId = (v: unknown): string => String(v ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
const rid = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;

/** อ่านค่าที่เก็บในธีม — บรรทัดว่างถูกตัดทิ้ง · id ซ้ำถูกแก้ · shipping ชื่อคงที่ */
export function normalizeContentSources(raw: unknown): ContentSource[] {
  if (!Array.isArray(raw)) return [];
  const out: ContentSource[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    let id = cleanId(o.id) || `s${out.length + 1}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    const lineIds = new Set<string>();
    const lines: ContentLine[] = [];
    for (const l of Array.isArray(o.lines) ? o.lines : []) {
      if (!l || typeof l !== "object") continue;
      const lo = l as Record<string, unknown>;
      const text = String(lo.text ?? "").trim().slice(0, CONTENT_LINE_MAX);
      if (!text) continue;
      let lid = cleanId(lo.id) || `l${lines.length + 1}`;
      while (lineIds.has(lid)) lid = `${lid}_`;
      lineIds.add(lid);
      lines.push({ id: lid, text });
      if (lines.length >= MAX_CONTENT_LINES) break;
    }
    const shipping = id === SHIPPING_SOURCE_ID;
    out.push({
      id,
      name: shipping ? SHIPPING_SOURCE_NAME : String(o.name ?? "").trim().slice(0, CONTENT_NAME_MAX) || "แหล่งข้อมูล",
      lines,
      ...(shipping ? { hideAuto: (Array.isArray(o.hideAuto) ? o.hideAuto : []).filter((k): k is ShippingAutoKey => AUTO_KEYS.includes(k as ShippingAutoKey)) } : {}),
    });
    if (out.length >= MAX_CONTENT_SOURCES) break;
  }
  return out;
}

export const newContentLine = (): ContentLine => ({ id: rid("l"), text: "" });
export const newContentSource = (name = "แหล่งข้อมูลใหม่"): ContentSource => ({ id: rid("s"), name, lines: [newContentLine()] });

/** แหล่ง shipping สำหรับแก้ไข (ยังไม่เคยแก้ = ว่าง ไม่ซ่อนอะไร) */
export const shippingSourceOf = (sources: ContentSource[]): ContentSource =>
  sources.find((s) => s.id === SHIPPING_SOURCE_ID) ?? { id: SHIPPING_SOURCE_ID, name: SHIPPING_SOURCE_NAME, lines: [], hideAuto: [] };

/** แทนที่/เพิ่มแหล่งตาม id */
export const upsertSource = (sources: ContentSource[], src: ContentSource): ContentSource[] =>
  sources.some((s) => s.id === src.id) ? sources.map((s) => (s.id === src.id ? src : s)) : [...sources, src];

/** หัวข้อที่เลือกแหล่งนี้อยู่ (ไว้เตือนก่อนลบ) */
export function sourceUsage(items: { label: string; source: string; sourceId?: string }[], id: string): string[] {
  return items.filter((it) => (id === SHIPPING_SOURCE_ID ? it.source === "shipping" : it.source === "custom" && it.sourceId === id)).map((it) => it.label);
}

/** ค่าในดรอปดาวน์ "เอาข้อมูลจาก" ↔ source + sourceId (แหล่งที่ร้านเพิ่มเอง = "custom:<id>") */
export const detailSourceValue = (it: { source: string; sourceId?: string }): string => (it.source === "custom" ? `custom:${it.sourceId ?? ""}` : it.source);
export function parseDetailSourceValue(v: string): { source: string; sourceId: string | undefined } {
  return v.startsWith("custom:") ? { source: "custom", sourceId: v.slice(7) } : { source: v, sourceId: undefined };
}

/**
 * ข้อความบรรทัดอัตโนมัติ (ภาษาไทย) ตามข้อมูลร้านตอนนี้ — ไว้โชว์ในหลังบ้าน
 * ⚠️ ถ้อยคำต้องตรงกับ shippingLines ของเว็บร้าน (storefront src/lib/product-details.ts)
 */
export function shippingAutoPreview(info: {
  free_shipping_min: number;
  shipping_flat: number;
  pay_cod: boolean;
  pay_promptpay: boolean;
  order_note?: string;
}): { key: ShippingAutoKey; text: string }[] {
  // เหมือน formatPrice ของเว็บร้าน: จำนวนเต็มไม่มีทศนิยม · มีเศษ = 2 ตำแหน่ง
  const baht = (n: number) => `฿${(Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  let ship: string;
  if (info.free_shipping_min > 0) ship = `ส่งฟรีเมื่อสั่งครบ ${baht(info.free_shipping_min)}${info.shipping_flat > 0 ? ` · ต่ำกว่านั้นค่าส่ง ${baht(info.shipping_flat)}` : ""}`;
  else if (info.shipping_flat > 0) ship = `ค่าส่ง ${baht(info.shipping_flat)} ต่อออเดอร์`;
  else ship = "ส่งฟรีทุกออเดอร์";
  const pay = [info.pay_cod && "เก็บเงินปลายทาง", info.pay_promptpay && "โอนพร้อมเพย์"].filter(Boolean) as string[];
  return [
    { key: "shipping", text: ship },
    { key: "payment", text: pay.length ? `ชำระเงิน: ${pay.join(" · ")}` : "" },
    { key: "note", text: info.order_note?.trim() ?? "" },
  ];
}
