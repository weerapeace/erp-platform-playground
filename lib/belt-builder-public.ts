/**
 * Belt Builder — ข้อมูลชุด "สาธารณะ" ที่ส่งให้เว็บร้าน (site API `beltBuilder`)
 *
 * ส่งเฉพาะที่เว็บต้องใช้วาด/คิดราคา: ชิ้นส่วนที่เปิดอยู่ (ไม่มี deleted) + กติกาไซซ์ + ราคาฐาน/ค่าสลักจากข้อมูลร้าน
 * ไม่ส่ง: shop_id, created_at, note — และไม่ส่งอะไรถ้าร้านยังไม่มีสาย+หัวอย่างน้อยอย่างละ 1 (เว็บจะไม่โชว์ Section)
 * ฝั่งเว็บร้าน: src/lib/belt-builder.ts parseBeltBuilder() ต้องอ่านรูปแบบนี้ได้
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { BELT_CANVAS, DEFAULT_ENGRAVING_BOX, parseAnchor, parseStrapFormula, type Anchor, type PartType, type StrapFormula } from "@/lib/belt-builder";
import type { SiteInfo } from "@/lib/website-site-info";

type Admin = ReturnType<typeof supabaseAdmin>;

export type PublicBeltPart = {
  id: string;
  type: PartType;
  code: string | null;
  name: string;
  nameEn: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  anchor: Anchor;
  attrs: Record<string, unknown>;
  priceDelta: number;
};
export type PublicBeltSizeRule = {
  id: string;
  gender: "men" | "women";
  label: string;
  waistMin: number;
  waistMax: number;
  formula: StrapFormula;
  holeCount: number;
  holeSpacing: number;
};
export type PublicEngravingFont = { key: string; label: string; css: string };
export type PublicEngravingPosition = { key: string; label: string; box: Anchor };
export type BeltBuilderPayload = {
  canvas: { w: number; h: number };
  basePrice: number;
  leadTime: string;
  engraving: { enabled: boolean; maxChars: number; fee: number; fonts: PublicEngravingFont[]; positions: PublicEngravingPosition[] };
  parts: PublicBeltPart[];
  sizeRules: PublicBeltSizeRule[];
};

/** ฟอนต์สลักชื่อที่ให้ลูกค้าเลือก (ชื่อ css ต้องมีบนเว็บร้าน — ใช้ฟอนต์ระบบ/serif ไม่ต้องโหลดเพิ่ม) */
export const ENGRAVING_FONTS: PublicEngravingFont[] = [
  { key: "serif", label: "คลาสสิก (Serif)", css: "Georgia, 'Times New Roman', serif" },
  { key: "sans", label: "เรียบ (Sans)", css: "'Helvetica Neue', Arial, sans-serif" },
  { key: "script", label: "ลายมือ (Script)", css: "'Brush Script MT', 'Segoe Script', cursive" },
];

/** ตำแหน่งสลักชื่อ — กล่องบนผืนผ้าใบ 1600×600 (ปลายสาย = ค่าเริ่มต้น) */
export const ENGRAVING_POSITIONS: PublicEngravingPosition[] = [
  { key: "tip", label: "ปลายสาย", box: DEFAULT_ENGRAVING_BOX },
  { key: "center", label: "กลางสาย", box: { x: 610, y: 330, w: 380, h: 90 } },
  { key: "inside", label: "ด้านในสาย (ไม่เห็นตอนใส่)", box: { x: 400, y: 330, w: 380, h: 90 } },
];

type PartRow = { id: string; part_type: string; code: string | null; name_th: string; name_en: string | null; image_key: string | null; image_url: string | null; anchor: unknown; attrs: unknown; price_delta: number | string | null; sort_order: number };
type RuleRow = { id: string; gender: string; label: string | null; waist_min_in: number | string; waist_max_in: number | string; strap_formula: unknown; hole_count: number; hole_spacing_cm: number | string; sort_order: number };

export async function buildBeltBuilderPayload(sb: Admin, shopId: string, info: Pick<SiteInfo, "belt_base_price" | "belt_engraving_fee" | "belt_engraving_max" | "belt_lead_time">): Promise<BeltBuilderPayload | null> {
  const [{ data: pr }, { data: rr }] = await Promise.all([
    sb.from("belt_parts").select("id, part_type, code, name_th, name_en, image_key, image_url, anchor, attrs, price_delta, sort_order")
      .eq("shop_id", shopId).eq("is_active", true).is("deleted_at", null).order("part_type").order("sort_order"),
    sb.from("belt_size_rules").select("id, gender, label, waist_min_in, waist_max_in, strap_formula, hole_count, hole_spacing_cm, sort_order")
      .eq("shop_id", shopId).eq("is_active", true).order("sort_order"),
  ]);
  const parts: PublicBeltPart[] = [];
  for (const r of (pr ?? []) as PartRow[]) {
    const anchor = parseAnchor(r.anchor);
    if (!anchor || !["strap", "buckle", "keeper"].includes(r.part_type)) continue;
    parts.push({
      id: r.id, type: r.part_type as PartType, code: r.code, name: r.name_th, nameEn: r.name_en,
      imageKey: r.image_key, imageUrl: r.image_url, anchor,
      attrs: (r.attrs && typeof r.attrs === "object" ? r.attrs : {}) as Record<string, unknown>,
      priceDelta: Math.max(0, Number(r.price_delta) || 0),
    });
  }
  if (!parts.some((p) => p.type === "strap") || !parts.some((p) => p.type === "buckle")) return null;

  const sizeRules: PublicBeltSizeRule[] = [];
  for (const r of (rr ?? []) as RuleRow[]) {
    const formula = parseStrapFormula(r.strap_formula);
    if (!formula || (r.gender !== "men" && r.gender !== "women")) continue;
    sizeRules.push({
      id: r.id, gender: r.gender, label: r.label || (r.gender === "men" ? "ผู้ชาย" : "ผู้หญิง"),
      waistMin: Number(r.waist_min_in), waistMax: Number(r.waist_max_in), formula,
      holeCount: Number(r.hole_count) || 5, holeSpacing: Number(r.hole_spacing_cm) || 2.5,
    });
  }
  const maxChars = Math.max(0, Math.min(30, Math.round(Number(info.belt_engraving_max) || 0)));
  return {
    canvas: { w: BELT_CANVAS.w, h: BELT_CANVAS.h },
    basePrice: Math.max(0, Number(info.belt_base_price) || 0),
    leadTime: String(info.belt_lead_time ?? "").trim(),
    engraving: { enabled: maxChars > 0, maxChars, fee: Math.max(0, Number(info.belt_engraving_fee) || 0), fonts: ENGRAVING_FONTS, positions: ENGRAVING_POSITIONS },
    parts,
    sizeRules,
  };
}
