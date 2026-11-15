/**
 * /api/sku-swatches — 🎨 Swatch = รูปแผ่นตัวอย่าง (การ์ดสีผ้า/ด้าย/อะไหล่) + ชิ้นบนรูป (รหัสภายใน · ผูก SKU ได้)
 * (แท็บ Swatch ในหน้า /master/skus)
 *
 *   GET    ?search=&family_ids=&limit=&offset=   → รายการแผ่น (ปก + จำนวนรูป/ชิ้น/ที่ผูกแล้ว + ชื่อแท็ก) · ค้นได้ทั้งชื่อแผ่น รหัสแผ่น/ชิ้น ชื่อสี เลขบนแผง SKU
 *   GET    ?id=<uuid>                             → แผ่นเดียว + รูปทั้งหมด + ชิ้นทั้งหมด + ข้อมูล SKU ของแต่ละชิ้น
 *   GET    ?sku_id=<uuid>                         → SKU นี้อยู่บนแผ่นไหน ตรงไหน (ลิงก์ย้อนกลับในหน้า SKU)
 *   POST   { name?, note?, code?, family_tag_ids?, images: [{image_key,image_w,image_h}], spots?: Spot[] }   → สร้างแผ่นใหม่
 *          (รุ่นเก่า: image_key/image_w/image_h ตัวเดียว ยังรับ)
 *   GET    รายการ: + no_tags=1 (ยังไม่ติดแท็ก) · sort=new|name|code|chips|unlinked|shop · color=#hex (ค้นด้วยสี ΔE ≤ 20)
 *   PATCH  { id, name?, note?, family_tag_ids?, images?, spots?, suppliers?, material?, weight?, weight_unit?, width_cm?, thickness_mm?, supplier_model? }
 *          suppliers = ร้าน "ทั้งชุด" (มี id = แก้ · ไม่มี id = เพิ่ม · id เดิมที่ไม่ส่ง = ลบ) · ร้านหลักได้ร้านเดียว
 *          spot.price / spot.supplier_ref = ราคา/ร้านรายชิ้น (supplier_ref ต้องเป็นร้านของแผ่นนี้ ไม่งั้นเป็นว่าง)
 *          images = รูป "ทั้งชุด" ตามลำดับ (มี id = รูปเดิม · ไม่มี id = รูปใหม่ · id เดิมที่ไม่ส่ง = ลบ พร้อมชิ้นบนรูปนั้น) · ตัวแรก = ปก
 *          spots  = ชิ้น "ทั้งแผ่น" (มี id = แก้ · ไม่มี id = เพิ่ม · id เดิมที่ไม่ส่ง = ลบ) · image_index = ลำดับรูปใน images ที่ส่งมา (ไม่ส่ง images = ลำดับรูปปัจจุบัน)
 *   DELETE ?id=                                   → ลบแผ่น (รูป/ชิ้นลบตาม cascade · SKU ไม่กระทบ · ไฟล์รูปใน R2 ไม่ลบ)
 *
 * รหัส: แผ่น = SW-0001 (ของกลาง erp_next_number key "sku_swatch" หรือพิมพ์เอง) · ชิ้น = รหัสแผ่น-01 ออกที่นี่เท่านั้น (เลขไม่ใช้ซ้ำ — next_chip_no)
 * ตำแหน่งชิ้นเป็น % ของรูปที่ชิ้นนั้นอยู่ (0-100) · sku_id ว่างได้ = ยังไม่ผูก
 * สิทธิ์: products.view (อ่าน) / products.edit (เขียน) + audit log ของกลาง
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi, apiCan } from "@/lib/api-auth";
import { loadSkuStock } from "@/lib/sku-stock";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit, auditChangeMeta } from "@/lib/audit";
import { bboxOf, chipCode, cleanBoardCode, cleanPoints, isAxisRect, isHex, type Pt } from "@/lib/sku-swatch";
import { deltaE2000, hexToLab } from "@/lib/color-swatch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SwatchImage = { id: string; image_key: string; image_w: number | null; image_h: number | null; sort_order: number };
export type SwatchSpot = {
  id: string; x: number; y: number; w: number; h: number; label: string | null; sort_order: number;
  /** รูปที่ชิ้นนี้อยู่ (null = รูปแรก) + key ของรูปนั้น (ใช้ตัดรูปชิ้นไปโชว์) */
  image_id: string | null; image_key: string | null;
  /** รหัสภายใน SW-0001-01 · ชื่อสี · สีจริง #rrggbb · มาจาก AI หรือทำเอง */
  code: string | null; name: string | null; color_hex: string | null; source: "manual" | "ai";
  /** กรอบดัดมุม: จุดมุม [[x,y],…] เป็น % ของรูป · null = สี่เหลี่ยมตรง (x/y/w/h = กรอบครอบเสมอ) */
  points: Pt[] | null;
  /** ราคา/ร้านรายชิ้น (ว่าง = ใช้ของแผ่น) · supplier_ref = id ใน suppliers ของแผ่น */
  price: number | null; supplier_ref: string | null;
  sku_id: string | null;
  sku: { id: string; code: string; name: string; image: string | null; image_key: string | null; uom: string | null; color: string | null; qty_on_hand: number | null; is_active: boolean;
    /** ซื้อล่าสุด (ใบสั่งซื้อ v2) · ราคา = ว่างถ้าไม่มีสิทธิ์ดูต้นทุน */
    last_po?: LastPurchase | null } | null;
};
export type LastPurchase = { po_no: string | null; date: string | null; seller: string | null; price: number | null; currency: string | null; uom: string | null };
/** ร้านที่สั่งได้ของแผ่น (หลัก + สำรอง) — ราคา/เงื่อนไขซื้ออยู่กับร้าน */
export type SwatchSupplier = {
  id: string; partner_id: string | null; partner_name: string | null; /** ชื่อที่โชว์ (ทะเบียนคู่ค้า → ชื่อที่พิมพ์) */ name: string;
  buy_url: string | null; price: number | null; currency: "THB" | "CNY" | "USD"; unit: string | null;
  moq: number | null; lead_days: number | null; price_updated_at: string | null; is_main: boolean; note: string | null; sort_order: number;
};
/** สเปกวัสดุของแผ่น */
export type SwatchSpecs = { material: string | null; weight: number | null; weight_unit: "oz" | "gsm" | null; width_cm: number | null; thickness_mm: number | null; supplier_model: string | null };
export type SwatchCard = SwatchSpecs & {
  id: string; name: string | null; note: string | null; seq: number; code: string | null;
  /** ปก (= รูปแรก) + รูปทั้งหมด (≤ 6 · ชี้การ์ดแล้วเลื่อนดู) */
  image_key: string | null; image_w: number | null; image_h: number | null; image_count: number; image_keys: string[];
  family_tag_ids: string[]; tags: { id: string; name: string }[];
  spot_count: number; linked_count: number;
  /** สีของชิ้นตามลำดับ (≤ 40 · แถบสีจิ๋วใต้การ์ด) */
  chip_colors: string[];
  /** ร้านหลัก (หรือร้านแรก) — โชว์บนการ์ด/ตาราง */
  main_supplier: { name: string; price: number | null; currency: string; unit: string | null } | null;
  /** ค้นด้วยสี: ชิ้นที่สีใกล้สุด */
  color_match?: { code: string | null; name: string | null; hex: string; dE: number } | null;
  created_at: string; updated_at: string;
};
export type SwatchDetail = SwatchCard & { images: SwatchImage[]; spots: SwatchSpot[]; next_chip_no: number; suppliers: SwatchSupplier[]; /** เห็นราคาซื้อได้ไหม (products.cost.view) */ can_cost: boolean };
/** ตำแหน่งของ SKU บนแผ่น swatch (1 แถว = 1 ชิ้น) — image_key = รูปที่ชิ้นอยู่ */
export type SkuSwatchLink = { swatch_id: string; swatch_name: string; image_key: string | null; spot_id: string; label: string | null; code: string | null; x: number; y: number; w: number; h: number };

type Admin = ReturnType<typeof supabaseAdmin>;
type SwatchRow = { id: string; name: string | null; note: string | null; code: string | null; next_chip_no: number | null; image_key: string | null; image_w: number | null; image_h: number | null; family_tag_ids: unknown; created_at: string; updated_at: string;
  material: string | null; weight: number | string | null; weight_unit: string | null; width_cm: number | string | null; thickness_mm: number | string | null; supplier_model: string | null };
type SpotRow = { id: string; swatch_id: string; sku_id: string | null; image_id: string | null; x: number | string; y: number | string; w: number | string; h: number | string; label: string | null; sort_order: number; code: string | null; name: string | null; color_hex: string | null; source: string | null; points: unknown; price: number | string | null; supplier_ref: string | null };
type ImageRow = { id: string; swatch_id: string; image_key: string; image_w: number | null; image_h: number | null; sort_order: number };
type SupRow = { id: string; swatch_id: string; partner_id: string | null; partner_name: string | null; buy_url: string | null; price: number | string | null; currency: string; unit: string | null; moq: number | string | null; lead_days: number | null; price_updated_at: string | null; is_main: boolean; note: string | null; sort_order: number };

const COLS = "id, name, note, code, next_chip_no, image_key, image_w, image_h, family_tag_ids, created_at, updated_at, material, weight, weight_unit, width_cm, thickness_mm, supplier_model";
const SPOT_COLS = "id, swatch_id, sku_id, image_id, x, y, w, h, label, sort_order, code, name, color_hex, source, points, price, supplier_ref";
const SUP_COLS = "id, swatch_id, partner_id, partner_name, buy_url, price, currency, unit, moq, lead_days, price_updated_at, is_main, note, sort_order";
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const specsOf = (s: SwatchRow): SwatchSpecs => ({
  material: s.material ?? null, weight: numOrNull(s.weight), weight_unit: s.weight_unit === "oz" || s.weight_unit === "gsm" ? s.weight_unit : null,
  width_cm: numOrNull(s.width_cm), thickness_mm: numOrNull(s.thickness_mm), supplier_model: s.supplier_model ?? null,
});
/** ร้านของหลายแผ่น + ชื่อจากทะเบียนคู่ค้า · ราคา = ต้นทุน → ไม่มีสิทธิ์ products.cost.view = ว่าง */
async function suppliersOf(admin: Admin, swatchIds: string[], canCost: boolean): Promise<Map<string, SwatchSupplier[]>> {
  const out = new Map<string, SwatchSupplier[]>();
  if (!swatchIds.length) return out;
  const { data } = await admin.from("sku_swatch_suppliers").select(SUP_COLS).in("swatch_id", swatchIds).order("sort_order");
  const rows = (data ?? []) as unknown as SupRow[];
  const pids = [...new Set(rows.map((r) => r.partner_id).filter((x): x is string => !!x))];
  const pname = new Map<string, string>();
  if (pids.length) {
    const { data: ps } = await admin.from("partners_v2").select("id, name_th, display_name, code").in("id", pids);
    for (const p of (ps ?? []) as { id: string; name_th: string | null; display_name: string | null; code: string | null }[]) pname.set(p.id, p.name_th || p.display_name || p.code || "ร้าน");
  }
  for (const r of rows) {
    const list = out.get(r.swatch_id) ?? [];
    list.push({
      id: r.id, partner_id: r.partner_id, partner_name: r.partner_name, name: (r.partner_id && pname.get(r.partner_id)) || r.partner_name || "ร้าน",
      buy_url: r.buy_url, price: canCost ? numOrNull(r.price) : null, currency: r.currency === "CNY" || r.currency === "USD" ? r.currency : "THB", unit: r.unit,
      moq: numOrNull(r.moq), lead_days: r.lead_days, price_updated_at: r.price_updated_at, is_main: r.is_main, note: r.note, sort_order: r.sort_order,
    });
    out.set(r.swatch_id, list);
  }
  return out;
}
const mainOf = (list: SwatchSupplier[] | undefined) => {
  const m = list?.find((s) => s.is_main) ?? list?.[0];
  return m ? { name: m.name, price: m.price, currency: m.currency, unit: m.unit } : null;
};
/** ซื้อล่าสุดของแต่ละ SKU — บรรทัดใบสั่งซื้อ v2 (ไม่นับใบที่ปิดใช้) เรียงวันที่ใบ → วันที่สร้างบรรทัด */
async function lastPurchases(admin: Admin, skuIds: string[], canCost: boolean): Promise<Map<string, LastPurchase>> {
  const out = new Map<string, LastPurchase>();
  if (!skuIds.length) return out;
  const { data: lines } = await admin.from("purchase_order_lines_v2").select("item_sku_id, po_id, price_est, currency, uom, created_at").in("item_sku_id", skuIds).not("is_active", "is", false).limit(2000);
  const ls = (lines ?? []) as { item_sku_id: string; po_id: string | null; price_est: number | string | null; currency: string | null; uom: string | null; created_at: string }[];
  const poIds = [...new Set(ls.map((l) => l.po_id).filter((x): x is string => !!x))];
  const po = new Map<string, { po_no: string | null; seller_name: string | null; order_date: string | null; currency: string | null }>();
  if (poIds.length) {
    const { data: heads } = await admin.from("purchase_orders_v2").select("id, po_no, seller_name, order_date, currency").in("id", poIds).not("is_active", "is", false);
    for (const h of (heads ?? []) as { id: string; po_no: string | null; seller_name: string | null; order_date: string | null; currency: string | null }[]) po.set(h.id, h);
  }
  const when = (l: (typeof ls)[number]) => (l.po_id && po.get(l.po_id)?.order_date) || l.created_at.slice(0, 10);
  for (const l of ls) {
    const h = l.po_id ? po.get(l.po_id) : undefined;
    if (l.po_id && !h) continue;   // ใบปิดใช้/ลบแล้ว
    const cur = out.get(l.item_sku_id);
    if (cur && (cur.date ?? "") >= when(l)) continue;
    out.set(l.item_sku_id, { po_no: h?.po_no ?? null, date: when(l), seller: h?.seller_name ?? null, price: canCost ? numOrNull(l.price_est) : null, currency: l.currency ?? h?.currency ?? null, uom: l.uom });
  }
  return out;
}
const IMG_COLS = "id, swatch_id, image_key, image_w, image_h, sort_order";
const UUID = /^[0-9a-f-]{36}$/i;
const tagIdsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter((s) => UUID.test(s)) : []);
const clamp = (n: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(n) || 0));
const r2 = (n: number) => Math.round(n * 100) / 100;
const txt = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const posInt = (v: unknown) => (Number(v) > 0 ? Math.round(Number(v)) : null);

async function actorOf(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}
async function tagNames(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const { data } = await admin.from("product_families").select("id, name").in("id", ids);
  for (const t of (data ?? []) as { id: string; name: string | null }[]) m.set(t.id, t.name ?? "แท็ก");
  return m;
}
/** ลำดับ "Swatch #n" = ลำดับที่สร้าง (เก่าสุด = #1) — ใช้เป็นชื่อเมื่อไม่ได้ตั้งชื่อ */
async function seqMap(admin: Admin): Promise<Map<string, number>> {
  const { data } = await admin.from("sku_swatches").select("id").eq("is_active", true).order("created_at", { ascending: true });
  const m = new Map<string, number>();
  ((data ?? []) as { id: string }[]).forEach((r, i) => m.set(r.id, i + 1));
  return m;
}
const titleOf = (name: string | null, code: string | null, seq: number | undefined) => name?.trim() || code || `Swatch #${seq ?? ""}`;
const friendlyDbError = (msg: string) => (/sku_swatches_code_uq/.test(msg) ? "รหัสแผ่นนี้มีอยู่แล้ว ลองรหัสอื่น" : /sku_swatch_spots_code_uq/.test(msg) ? "รหัสชิ้นซ้ำกับแผ่นอื่น ลองบันทึกใหม่อีกครั้ง" : msg);

/** ชิ้นที่ส่งมาจากหน้าจอ → แถวที่บันทึกได้ (ยังไม่มีรหัส/รูป) */
function parseSpot(p: Record<string, unknown>, i: number) {
  // กรอบดัดมุม: เก็บจุดมุม + กรอบครอบ (ไม่ได้ดัดจริง = เก็บเป็นสี่เหลี่ยมตรง)
  const pts = cleanPoints(p.points);
  const points = pts && !isAxisRect(pts) ? pts : null;
  const bb = points ? bboxOf(points) : null;
  const x = bb ? bb.x : r2(clamp(p.x, 0, 100)), y = bb ? bb.y : r2(clamp(p.y, 0, 100));
  const w = bb ? r2(Math.min(bb.w, 100 - x)) : r2(clamp(p.w, 0.5, 100 - x)), h = bb ? r2(Math.min(bb.h, 100 - y)) : r2(clamp(p.h, 0.5, 100 - y));   // ไม่ให้ล้นขอบรูป
  return {
    id: typeof p.id === "string" && UUID.test(p.id) ? p.id : null,
    sku_id: typeof p.sku_id === "string" && UUID.test(p.sku_id) ? p.sku_id : null,
    image_index: Number.isInteger(Number(p.image_index)) && Number(p.image_index) >= 0 ? Number(p.image_index) : null,
    image_id: typeof p.image_id === "string" && UUID.test(p.image_id) ? p.image_id : null,
    x, y, w, h, points, label: txt(p.label, 30), name: txt(p.name, 60),
    color_hex: isHex(p.color_hex) ? p.color_hex.toLowerCase() : null,
    source: p.source === "ai" ? "ai" : "manual",
    // ราคา/ร้านรายชิ้น (ว่าง = ใช้ของแผ่น) · supplier_ref ตรวจว่าเป็นร้านของแผ่นนี้ตอนบันทึก
    price: numOrNull(p.price) !== null && Number(p.price) >= 0 ? Number(p.price) : null,
    supplier_ref: typeof p.supplier_ref === "string" && UUID.test(p.supplier_ref) ? p.supplier_ref : null,
    sort_order: i,
  };
}
type ParsedSpot = ReturnType<typeof parseSpot>;

/** สเปกที่ส่งมา (เฉพาะช่องที่ส่ง) */
function parseSpecs(b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("material" in b) out.material = txt(b.material, 120);
  if ("supplier_model" in b) out.supplier_model = txt(b.supplier_model, 60);
  if ("weight_unit" in b) out.weight_unit = b.weight_unit === "oz" || b.weight_unit === "gsm" ? b.weight_unit : null;
  for (const k of ["weight", "width_cm", "thickness_mm"]) if (k in b) { const n = numOrNull(b[k]); out[k] = n !== null && n >= 0 ? n : null; }
  return out;
}
/** ร้านที่ส่งมา → แถวที่บันทึกได้ (ตัดแถวที่ไม่มีทั้งร้านในทะเบียนและชื่อ) · มีร้านหลักได้ร้านเดียว */
function parseSuppliers(v: unknown) {
  if (!Array.isArray(v)) return null;
  const list = (v as Record<string, unknown>[]).slice(0, 20).map((s, i) => ({
    id: typeof s?.id === "string" && UUID.test(s.id) ? s.id : null,
    partner_id: typeof s?.partner_id === "string" && UUID.test(s.partner_id) ? s.partner_id : null,
    partner_name: txt(s?.partner_name, 120),
    buy_url: typeof s?.buy_url === "string" && /^https?:\/\//i.test(s.buy_url.trim()) ? s.buy_url.trim().slice(0, 1000) : txt(s?.buy_url, 300),
    price: numOrNull(s?.price) !== null && Number(s?.price) >= 0 ? Number(s?.price) : null,
    currency: s?.currency === "CNY" || s?.currency === "USD" ? (s.currency as string) : "THB",
    unit: txt(s?.unit, 20),
    moq: numOrNull(s?.moq) !== null && Number(s?.moq) >= 0 ? Number(s?.moq) : null,
    lead_days: numOrNull(s?.lead_days) !== null && Number(s?.lead_days) >= 0 ? Math.round(Number(s?.lead_days)) : null,
    price_updated_at: typeof s?.price_updated_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(s.price_updated_at) ? s.price_updated_at.slice(0, 10) : null,
    is_main: s?.is_main === true,
    note: txt(s?.note, 500),
    sort_order: i,
  })).filter((s) => s.partner_id || s.partner_name);
  const mainIdx = list.findIndex((s) => s.is_main);
  list.forEach((s, i) => { s.is_main = mainIdx < 0 ? i === 0 : i === mainIdx; });   // ไม่ได้เลือก = ร้านแรกเป็นหลัก
  return list;
}

/** ออกรหัสให้ชิ้นใหม่ตามลำดับ รูป → ลำดับที่ผู้ใช้จัดในรายการ (ลากสลับ / เรียงตามแถว-คอลัมน์) · คืนเลขชิ้นถัดไป */
function assignCodes<T extends ParsedSpot & { image_id: string | null; code?: string | null }>(spots: T[], boardCode: string, nextNo: number, imageOrder: string[]): number {
  const need = spots.filter((s) => !s.code);
  const byImage = new Map<string, T[]>();
  for (const s of need) { const k = s.image_id ?? ""; byImage.set(k, [...(byImage.get(k) ?? []), s]); }
  const order = [...byImage.keys()].sort((a, b) => imageOrder.indexOf(a) - imageOrder.indexOf(b));
  let no = nextNo;
  for (const k of order) for (const s of byImage.get(k) ?? []) s.code = chipCode(boardCode, no++);
  return no;
}

async function boardCodeFor(admin: Admin, wanted: unknown): Promise<string> {
  const custom = cleanBoardCode(wanted);
  if (custom) return custom;
  const { data, error } = await admin.rpc("erp_next_number", { p_key: "sku_swatch" });
  if (error || !data) throw new Error(error?.message ?? "ออกรหัสแผ่นไม่สำเร็จ");
  return String(data);
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const admin = supabaseAdmin();
  const id = (sp.get("id") ?? "").trim();

  // ───── รหัสแผ่นถัดไป (ตัวอย่างในป๊อปเพิ่มแผ่น · ยังไม่จองเลข) ─────
  if (sp.get("next_code")) {
    const { data: rule } = await admin.from("erp_numbering_rules").select("pattern, current_value").eq("key", "sku_swatch").maybeSingle();
    const r = rule as { pattern: string; current_value: number | null } | null;
    const code = r ? r.pattern.replace(/\{(0+)\}/, (_, z: string) => String((r.current_value ?? 0) + 1).padStart(z.length, "0")) : null;
    return NextResponse.json({ code, error: null });
  }

  // ───── SKU นี้อยู่บนแผ่นไหนบ้าง ─────
  const bySku = (sp.get("sku_id") ?? "").trim();
  if (bySku) {
    if (!UUID.test(bySku)) return NextResponse.json({ data: [], error: "sku_id ไม่ถูกต้อง" }, { status: 400 });
    const { data: spotRows, error: spErr } = await admin.from("sku_swatch_spots").select(SPOT_COLS).eq("sku_id", bySku).order("created_at");
    if (spErr) return NextResponse.json({ data: [], error: spErr.message }, { status: 500 });
    const spots = (spotRows ?? []) as unknown as SpotRow[];
    if (spots.length === 0) return NextResponse.json({ data: [], error: null });
    const imgIds = [...new Set(spots.map((p) => p.image_id).filter((x): x is string => !!x))];
    const [{ data: heads }, seq, { data: imgs }] = await Promise.all([
      admin.from("sku_swatches").select("id, name, code, image_key").in("id", [...new Set(spots.map((p) => p.swatch_id))]).eq("is_active", true),
      seqMap(admin),
      imgIds.length ? admin.from("sku_swatch_images").select("id, image_key").in("id", imgIds) : Promise.resolve({ data: [] }),
    ]);
    const headMap = new Map(((heads ?? []) as { id: string; name: string | null; code: string | null; image_key: string | null }[]).map((h) => [h.id, h]));
    const imgMap = new Map(((imgs ?? []) as { id: string; image_key: string }[]).map((i) => [i.id, i.image_key]));
    const data: SkuSwatchLink[] = spots.filter((p) => headMap.has(p.swatch_id)).map((p) => {
      const h = headMap.get(p.swatch_id)!;
      return {
        swatch_id: h.id, swatch_name: titleOf(h.name, h.code, seq.get(h.id)), image_key: (p.image_id && imgMap.get(p.image_id)) || h.image_key,
        spot_id: p.id, label: p.label, code: p.code, x: Number(p.x), y: Number(p.y), w: Number(p.w), h: Number(p.h),
      };
    });
    return NextResponse.json({ data, error: null });
  }

  // ───── แผ่นเดียว + รูป + ชิ้น ─────
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    const { data: row } = await admin.from("sku_swatches").select(COLS).eq("id", id).eq("is_active", true).maybeSingle();
    if (!row) return NextResponse.json({ error: "ไม่พบแผ่น swatch นี้" }, { status: 404 });
    const s = row as unknown as SwatchRow;
    const [{ data: spotRows }, { data: imgRows }] = await Promise.all([
      admin.from("sku_swatch_spots").select(SPOT_COLS).eq("swatch_id", id).order("sort_order").order("created_at"),
      admin.from("sku_swatch_images").select(IMG_COLS).eq("swatch_id", id).order("sort_order").order("created_at"),
    ]);
    const spots = (spotRows ?? []) as unknown as SpotRow[];
    let images = ((imgRows ?? []) as unknown as ImageRow[]).map((i) => ({ id: i.id, image_key: i.image_key, image_w: i.image_w, image_h: i.image_h, sort_order: i.sort_order }));
    if (images.length === 0 && s.image_key) images = [{ id: "", image_key: s.image_key, image_w: s.image_w, image_h: s.image_h, sort_order: 0 }];   // กันข้อมูลก่อนย้ายโครง
    const imgKey = new Map(images.map((i) => [i.id, i.image_key]));
    const skuIds = [...new Set(spots.map((p) => p.sku_id).filter((x): x is string => !!x))];
    const skuMap = new Map<string, NonNullable<SwatchSpot["sku"]>>();
    const canCost = await apiCan(request, "products.cost.view");
    if (skuIds.length) {
      const [skuRes, balRes, lastPo] = await Promise.all([
        admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key, color, is_active, uom:uoms!uom_id(name)").in("id", skuIds),
        loadSkuStock(admin, skuIds),
        lastPurchases(admin, skuIds, canCost),
      ]);
      const stock = new Map<string, number>([...balRes].map(([id, s]) => [id, s.onHand]));
      for (const k of (skuRes.data ?? []) as unknown as { id: string; code: string; name_th: string | null; cover_image_r2_key: string | null; color: string | null; is_active: boolean | null; uom: { name: string | null } | { name: string | null }[] | null }[]) {
        const uomRow = Array.isArray(k.uom) ? k.uom[0] : k.uom;
        skuMap.set(k.id, {
          id: k.id, code: k.code, name: k.name_th ?? "", color: k.color ?? null, is_active: k.is_active !== false,
          image_key: k.cover_image_r2_key ?? null, uom: uomRow?.name ?? null,
          image: k.cover_image_r2_key ? `/api/r2-image?key=${encodeURIComponent(k.cover_image_r2_key)}` : null,
          qty_on_hand: stock.has(k.id) ? (stock.get(k.id) as number) : null,
          last_po: lastPo.get(k.id) ?? null,
        });
      }
    }
    const tids = tagIdsOf(s.family_tag_ids);
    const [names, seq, sups] = await Promise.all([tagNames(admin, tids), seqMap(admin), suppliersOf(admin, [id], canCost)]);
    const cover = images[0] ?? null;
    const supList = sups.get(id) ?? [];
    const detail: SwatchDetail = {
      id: s.id, name: s.name, note: s.note, seq: seq.get(s.id) ?? 0, code: s.code, next_chip_no: s.next_chip_no ?? 1,
      ...specsOf(s),
      image_key: cover?.image_key ?? s.image_key, image_w: cover?.image_w ?? s.image_w, image_h: cover?.image_h ?? s.image_h, image_count: images.length,
      image_keys: images.map((i) => i.image_key).slice(0, 6),
      family_tag_ids: tids, tags: tids.map((t) => ({ id: t, name: names.get(t) ?? "แท็ก" })),
      spot_count: spots.length, linked_count: spots.filter((p) => p.sku_id && skuMap.has(p.sku_id)).length,
      chip_colors: spots.map((p) => p.color_hex).filter((c): c is string => !!c).slice(0, 40),
      main_supplier: mainOf(supList), suppliers: supList, can_cost: canCost,
      created_at: s.created_at, updated_at: s.updated_at,
      images,
      spots: spots.map((p) => ({
        id: p.id, x: Number(p.x), y: Number(p.y), w: Number(p.w), h: Number(p.h), points: cleanPoints(p.points), label: p.label, sort_order: p.sort_order,
        image_id: p.image_id, image_key: (p.image_id && imgKey.get(p.image_id)) || cover?.image_key || null,
        code: p.code, name: p.name, color_hex: p.color_hex, source: p.source === "ai" ? "ai" : "manual",
        price: canCost ? numOrNull(p.price) : null, supplier_ref: p.supplier_ref ?? null,
        sku_id: p.sku_id, sku: p.sku_id ? (skuMap.get(p.sku_id) ?? null) : null,
      })),
    };
    return NextResponse.json({ swatch: detail, error: null });
  }

  // ───── รายการแผ่น ─────
  const search = (sp.get("search") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 60)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));
  const familyIds = (sp.get("family_ids") ?? "").split(",").map((x) => x.trim()).filter((x) => UUID.test(x));
  const noTags = sp.get("no_tags") === "1";                        // ตัวกรอง "ยังไม่ติดแท็ก" (รวมกับแท็กที่เลือก = OR)
  const sort = sp.get("sort") ?? "new";                            // new · name · code · chips · unlinked · shop
  const colorQ = (sp.get("color") ?? "").trim();                   // ค้นด้วยสี "#rrggbb"
  const colorLab = colorQ ? hexToLab(colorQ.startsWith("#") ? colorQ : `#${colorQ}`) : null;

  const { data: all, error } = await admin.from("sku_swatches").select(COLS).eq("is_active", true).order("created_at", { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ swatches: [], total: 0, error: error.message }, { status: 500 });
  let rows = (all ?? []) as unknown as SwatchRow[];
  if (familyIds.length || noTags) rows = rows.filter((r) => { const t = tagIdsOf(r.family_tag_ids); return (noTags && t.length === 0) || t.some((x) => familyIds.includes(x)); });   // หลายแท็ก = OR เหมือนหน้า SKU
  const seq = await seqMap(admin);

  // ชิ้น + รูปของทุกแผ่น (นับ + แถบสี + ค้นด้วยรหัสชิ้น/ชื่อสี/เลขบนแผง/รหัส-ชื่อ SKU/สี)
  const ids = rows.map((r) => r.id);
  type LiteSpot = { swatch_id: string; sku_id: string | null; code: string | null; name: string | null; label: string | null; color_hex: string | null; sort_order: number };
  const [spotRows, imgRows] = ids.length ? await Promise.all([
    admin.from("sku_swatch_spots").select("swatch_id, sku_id, code, name, label, color_hex, sort_order").in("swatch_id", ids).order("sort_order").then((r) => (r.data ?? []) as LiteSpot[]),
    admin.from("sku_swatch_images").select("swatch_id, image_key, sort_order").in("swatch_id", ids).order("sort_order").then((r) => (r.data ?? []) as { swatch_id: string; image_key: string; sort_order: number }[]),
  ]) : [[] as LiteSpot[], [] as { swatch_id: string; image_key: string; sort_order: number }[]];
  // ค้นด้วยสี: ชิ้นที่สีใกล้สุดของแต่ละแผ่น (CIEDE2000 · ใกล้พอ ≤ 20)
  const colorBest = new Map<string, { code: string | null; name: string | null; hex: string; dE: number }>();
  if (colorLab) {
    for (const p of spotRows) {
      const lab = p.color_hex ? hexToLab(p.color_hex) : null;
      if (!lab) continue;
      const d = Math.round(deltaE2000(colorLab, lab) * 10) / 10;
      const cur = colorBest.get(p.swatch_id);
      if (!cur || d < cur.dE) colorBest.set(p.swatch_id, { code: p.code, name: p.name, hex: p.color_hex as string, dE: d });
    }
    rows = rows.filter((r) => (colorBest.get(r.id)?.dE ?? 99) <= 20);
  }
  if (search) {
    const s = search.toLowerCase();
    const safe = search.replace(/[%,()]/g, " ").trim();
    const hit = new Set<string>();
    for (const p of spotRows) if ([p.code, p.name, p.label].some((v) => (v ?? "").toLowerCase().includes(s))) hit.add(p.swatch_id);
    if (safe) {
      const { data: skus } = await admin.from("skus_v2").select("id").or(`code.ilike.%${safe}%,name_th.ilike.%${safe}%`).limit(500);
      const skuIds = new Set(((skus ?? []) as { id: string }[]).map((x) => x.id));
      for (const p of spotRows) if (p.sku_id && skuIds.has(p.sku_id)) hit.add(p.swatch_id);
    }
    rows = rows.filter((r) => hit.has(r.id) || (r.name ?? "").toLowerCase().includes(s) || (r.note ?? "").toLowerCase().includes(s) || (r.code ?? "").toLowerCase().includes(s) || `swatch #${seq.get(r.id)}`.includes(s));
  }
  // เรียง (ร้าน = ต้องรู้ร้านทุกแผ่นก่อนตัดหน้า)
  const sups = await suppliersOf(admin, rows.map((r) => r.id), await apiCan(request, "products.cost.view"));
  const spotsOf = (id: string) => spotRows.filter((p) => p.swatch_id === id);
  const title = (r: SwatchRow) => (r.name?.trim() || r.code || "").toLowerCase();
  if (colorLab) rows.sort((a, b) => (colorBest.get(a.id)?.dE ?? 99) - (colorBest.get(b.id)?.dE ?? 99));
  else if (sort === "name") rows.sort((a, b) => title(a).localeCompare(title(b), "th"));
  else if (sort === "code") rows.sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));
  else if (sort === "chips") rows.sort((a, b) => spotsOf(b.id).length - spotsOf(a.id).length);
  else if (sort === "unlinked") rows.sort((a, b) => spotsOf(b.id).filter((p) => !p.sku_id).length - spotsOf(a.id).filter((p) => !p.sku_id).length);
  else if (sort === "shop") rows.sort((a, b) => (mainOf(sups.get(a.id))?.name ?? "￿").localeCompare(mainOf(sups.get(b.id))?.name ?? "￿", "th"));
  const total = rows.length;
  const page = rows.slice(offset, offset + limit);
  const names = await tagNames(admin, [...new Set(page.flatMap((r) => tagIdsOf(r.family_tag_ids)))]);
  const swatches: SwatchCard[] = page.map((r) => {
    const mine = spotsOf(r.id);
    const tids = tagIdsOf(r.family_tag_ids);
    const imgs = imgRows.filter((i) => i.swatch_id === r.id).map((i) => i.image_key);
    return {
      id: r.id, name: r.name, note: r.note, seq: seq.get(r.id) ?? 0, code: r.code, ...specsOf(r),
      image_key: r.image_key, image_w: r.image_w, image_h: r.image_h, image_count: imgs.length || (r.image_key ? 1 : 0),
      image_keys: (imgs.length ? imgs : r.image_key ? [r.image_key] : []).slice(0, 6),
      family_tag_ids: tids, tags: tids.map((t) => ({ id: t, name: names.get(t) ?? "แท็ก" })),
      spot_count: mine.length, linked_count: mine.filter((p) => !!p.sku_id).length,
      chip_colors: mine.map((p) => p.color_hex).filter((c): c is string => !!c).slice(0, 40),
      main_supplier: mainOf(sups.get(r.id)),
      color_match: colorBest.get(r.id) ?? null,
      created_at: r.created_at, updated_at: r.updated_at,
    };
  });
  return NextResponse.json({ swatches, total, error: null });
}

/** รูปที่ส่งมา → แถวที่ใช้ได้ (ตัดตัวที่ไม่มี key) */
function parseImages(v: unknown): { id: string | null; image_key: string; image_w: number | null; image_h: number | null }[] {
  if (!Array.isArray(v)) return [];
  return (v as Record<string, unknown>[]).map((i) => ({
    id: typeof i?.id === "string" && UUID.test(i.id) ? i.id : null,
    image_key: typeof i?.image_key === "string" ? i.image_key.trim() : "",
    image_w: posInt(i?.image_w), image_h: posInt(i?.image_h),
  })).filter((i) => !!i.image_key).slice(0, 30);
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  let images = parseImages(b.images);
  if (!images.length && typeof b.image_key === "string" && b.image_key.trim()) images = [{ id: null, image_key: b.image_key.trim(), image_w: posInt(b.image_w), image_h: posInt(b.image_h) }];
  if (!images.length) return NextResponse.json({ error: "ต้องอัปโหลดรูปแผ่น swatch ก่อน" }, { status: 400 });
  const admin = supabaseAdmin();
  const canCost = await apiCan(request, "products.cost.view");

  let code: string;
  try { code = await boardCodeFor(admin, b.code); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const cover = images[0];
  const row = {
    name: txt(b.name), note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 4000) : null, code,
    ...parseSpecs(b),
    image_key: cover.image_key, image_w: cover.image_w, image_h: cover.image_h,
    family_tag_ids: tagIdsOf(b.family_tag_ids),
    created_by: actor.id,
  };
  const { data, error } = await admin.from("sku_swatches").insert(row).select("id").single();
  if (error || !data) return NextResponse.json({ error: friendlyDbError(error?.message ?? "สร้างไม่สำเร็จ") }, { status: 400 });
  const id = data.id as string;
  const fail = async (msg: string) => {   // สร้างไม่ครบ = ลบแผ่นทิ้ง (รูป/ชิ้นลบตาม cascade) ไม่ให้ค้างครึ่ง ๆ
    await admin.from("sku_swatches").delete().eq("id", id);
    return NextResponse.json({ error: friendlyDbError(msg) }, { status: 400 });
  };

  const { data: imgIns, error: imgErr } = await admin.from("sku_swatch_images")
    .insert(images.map((i, n) => ({ swatch_id: id, image_key: i.image_key, image_w: i.image_w, image_h: i.image_h, sort_order: n }))).select("id, sort_order");
  if (imgErr || !imgIns) return fail(imgErr?.message ?? "บันทึกรูปไม่สำเร็จ");
  const imageIds = ((imgIns ?? []) as { id: string; sort_order: number }[]).sort((a, b2) => a.sort_order - b2.sort_order).map((i) => i.id);

  const spots = (Array.isArray(b.spots) ? (b.spots as Record<string, unknown>[]) : []).slice(0, 1000).map(parseSpot)
    .map((s) => ({ ...s, image_id: imageIds[s.image_index ?? 0] ?? imageIds[0], code: null as string | null }));
  const nextNo = assignCodes(spots, code, 1, imageIds);
  if (spots.length) {
    const { error: spErr } = await admin.from("sku_swatch_spots").insert(spots.map((s) => ({
      swatch_id: id, image_id: s.image_id, sku_id: s.sku_id, x: s.x, y: s.y, w: s.w, h: s.h, points: s.points, label: s.label, name: s.name,
      color_hex: s.color_hex, source: s.source, code: s.code, sort_order: s.sort_order, price: canCost ? s.price : null,
    })));
    if (spErr) return fail(spErr.message);
  }
  await admin.from("sku_swatches").update({ next_chip_no: nextNo }).eq("id", id);
  await writeAudit(admin, {
    action: "create", entityType: "sku_swatches", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { code, name: row.name, images: images.length, chips: spots.length, chips_from_ai: spots.filter((s) => s.source === "ai").length },
  });
  return NextResponse.json({ id, code, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = typeof b.id === "string" ? b.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: headRow } = await admin.from("sku_swatches").select(COLS).eq("id", id).maybeSingle();
  if (!headRow) return NextResponse.json({ error: "ไม่พบแผ่น swatch นี้" }, { status: 404 });
  const head = headRow as unknown as SwatchRow;
  const now = new Date().toISOString();
  const canCost = await apiCan(request, "products.cost.view");   // ราคาซื้อ = ต้นทุน · ไม่มีสิทธิ์ = ไม่แตะราคาเดิม

  // ── ผูก SKU ให้ชิ้นเดียว (หน้าดู: ขอซื้อชิ้นที่ยังไม่ผูก → สร้าง SKU แล้วผูกทันที) — ไม่ต้องส่งชิ้นทั้งแผ่น ──
  if (b.link_spot && typeof b.link_spot === "object") {
    const ls = b.link_spot as Record<string, unknown>;
    const spotId = typeof ls.spot_id === "string" && UUID.test(ls.spot_id) ? ls.spot_id : null;
    const skuId = typeof ls.sku_id === "string" && UUID.test(ls.sku_id) ? ls.sku_id : null;
    if (!spotId) return NextResponse.json({ error: "ต้องระบุชิ้น" }, { status: 400 });
    const { data: sp } = await admin.from("sku_swatch_spots").select("id, code, sku_id").eq("id", spotId).eq("swatch_id", id).maybeSingle();
    if (!sp) return NextResponse.json({ error: "ไม่พบชิ้นนี้บนแผ่น" }, { status: 404 });
    const { error } = await admin.from("sku_swatch_spots").update({ sku_id: skuId, updated_at: now }).eq("id", spotId).eq("swatch_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("sku_swatches").update({ updated_at: now }).eq("id", id);
    await writeAudit(admin, {
      action: "update", entityType: "sku_swatches", entityId: id, actorId: actor.id, actorName: actor.name,
      metadata: { code: head.code, name: head.name, link_spot: { chip: (sp as { code: string | null }).code, old_sku_id: (sp as { sku_id: string | null }).sku_id, new_sku_id: skuId } },
    });
    return NextResponse.json({ ok: true, error: null });
  }

  const changes: Record<string, unknown> = {};
  if ("name" in b) changes.name = txt(b.name);
  if ("note" in b) changes.note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 4000) : null;   // รายละเอียดหลายบรรทัด
  if (Array.isArray(b.family_tag_ids)) changes.family_tag_ids = tagIdsOf(b.family_tag_ids);
  Object.assign(changes, parseSpecs(b));

  // ── ร้านที่สั่งได้ (ทั้งชุด: มี id = แก้ · ไม่มี id = เพิ่ม · id เดิมที่ไม่ส่ง = ลบ) ──
  const supReport = { added: 0, updated: 0, removed: 0 };
  const supIn = parseSuppliers(b.suppliers);
  let supIds: string[] | null = null;   // ร้านของแผ่นหลังบันทึก (ตรวจ supplier_ref ของชิ้น)
  if (supIn) {
    const { data: curS } = await admin.from("sku_swatch_suppliers").select("id").eq("swatch_id", id);
    const curSet = new Set(((curS ?? []) as { id: string }[]).map((r) => r.id));
    const keepS = new Set(supIn.map((s) => s.id).filter((x): x is string => !!x && curSet.has(x)));
    const removeS = [...curSet].filter((x) => !keepS.has(x));
    if (removeS.length) {
      const { error } = await admin.from("sku_swatch_suppliers").delete().eq("swatch_id", id).in("id", removeS);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      supReport.removed = removeS.length;
    }
    supIds = [];
    for (const s of supIn) {
      const { id: sid, ...all } = s;
      const vals: Partial<typeof all> = { ...all };
      if (!canCost) delete vals.price;
      if (sid && curSet.has(sid)) {
        const { error } = await admin.from("sku_swatch_suppliers").update({ ...vals, updated_at: now }).eq("id", sid).eq("swatch_id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        supIds.push(sid); supReport.updated++;
      } else {
        const { data: ins, error } = await admin.from("sku_swatch_suppliers").insert({ ...vals, swatch_id: id }).select("id").single();
        if (error || !ins) return NextResponse.json({ error: error?.message ?? "บันทึกร้านไม่สำเร็จ" }, { status: 400 });
        supIds.push(ins.id as string); supReport.added++;
      }
    }
  }
  // รุ่นเก่า: เปลี่ยนรูปเดียว = แทนรูปปก
  if (!Array.isArray(b.images) && typeof b.image_key === "string" && b.image_key.trim()) {
    const { data: firstImg } = await admin.from("sku_swatch_images").select("id").eq("swatch_id", id).order("sort_order").limit(1).maybeSingle();
    b.images = [{ id: (firstImg as { id: string } | null)?.id, image_key: b.image_key, image_w: b.image_w, image_h: b.image_h }];
    const { data: rest } = await admin.from("sku_swatch_images").select("id, image_key, image_w, image_h").eq("swatch_id", id).order("sort_order").range(1, 100);
    (b.images as unknown[]).push(...((rest ?? []) as unknown[]));
  }

  // ── รูป (ทั้งชุด) ──
  const imgReport = { added: 0, removed: 0, reordered: false };
  const { data: curImgRows } = await admin.from("sku_swatch_images").select(IMG_COLS).eq("swatch_id", id).order("sort_order");
  let imageIds = ((curImgRows ?? []) as unknown as ImageRow[]).map((i) => i.id);
  if (Array.isArray(b.images)) {
    const incoming = parseImages(b.images);
    if (!incoming.length) return NextResponse.json({ error: "แผ่นต้องมีรูปอย่างน้อย 1 รูป" }, { status: 400 });
    const curIds = new Set(imageIds);
    const keep = new Set(incoming.map((i) => i.id).filter((x): x is string => !!x && curIds.has(x)));
    const remove = [...curIds].filter((x) => !keep.has(x));
    if (remove.length) {
      const { error } = await admin.from("sku_swatch_images").delete().eq("swatch_id", id).in("id", remove);   // ชิ้นบนรูปนั้นลบตาม cascade
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      imgReport.removed = remove.length;
    }
    const nextIds: string[] = [];
    for (const [n, im] of incoming.entries()) {
      if (im.id && curIds.has(im.id)) {
        const { error } = await admin.from("sku_swatch_images").update({ image_key: im.image_key, image_w: im.image_w, image_h: im.image_h, sort_order: n, updated_at: now }).eq("id", im.id).eq("swatch_id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        nextIds.push(im.id);
      } else {
        const { data: ins, error } = await admin.from("sku_swatch_images").insert({ swatch_id: id, image_key: im.image_key, image_w: im.image_w, image_h: im.image_h, sort_order: n }).select("id").single();
        if (error || !ins) return NextResponse.json({ error: error?.message ?? "บันทึกรูปไม่สำเร็จ" }, { status: 400 });
        nextIds.push(ins.id as string);
        imgReport.added++;
      }
    }
    imgReport.reordered = nextIds.filter((x) => curIds.has(x)).join() !== imageIds.filter((x) => keep.has(x)).join();
    imageIds = nextIds;
    const cover = incoming[0];
    changes.image_key = cover.image_key; changes.image_w = cover.image_w; changes.image_h = cover.image_h;   // ปก → หน้าเดิมที่อ่านรูปเดียวใช้ต่อได้
  }

  // ── ชิ้น (ทั้งแผ่น) ──
  const spotReport = { added: 0, updated: 0, removed: 0, linked: 0, unlinked: 0, added_codes: [] as string[], removed_codes: [] as string[] };
  let nextNo = head.next_chip_no ?? 1;
  if (Array.isArray(b.spots)) {
    const { data: cur } = await admin.from("sku_swatch_spots").select("id, code, sku_id, image_id").eq("swatch_id", id);
    const curMap = new Map(((cur ?? []) as { id: string; code: string | null; sku_id: string | null; image_id: string | null }[]).map((r) => [r.id, r]));
    const incoming = (b.spots as Record<string, unknown>[]).slice(0, 1000).map(parseSpot).map((s) => {
      const old = s.id ? curMap.get(s.id) : undefined;
      const image_id = s.image_index != null ? (imageIds[s.image_index] ?? null) : (s.image_id && imageIds.includes(s.image_id) ? s.image_id : old?.image_id ?? imageIds[0] ?? null);
      return { ...s, image_id, code: old?.code ?? null, isOld: !!old };
    }).filter((s) => !s.image_id || imageIds.includes(s.image_id));   // ชิ้นบนรูปที่ถูกลบ = ทิ้ง
    const keep = new Set(incoming.filter((s) => s.isOld).map((s) => s.id as string));
    const remove = [...curMap.keys()].filter((x) => !keep.has(x));
    if (remove.length) {
      const { error } = await admin.from("sku_swatch_spots").delete().eq("swatch_id", id).in("id", remove);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      spotReport.removed = remove.length;
      spotReport.removed_codes = remove.map((x) => curMap.get(x)?.code).filter((x): x is string => !!x).slice(0, 50);
    }
    const boardCode = head.code ?? (await boardCodeFor(admin, null));
    if (!head.code) changes.code = boardCode;
    nextNo = assignCodes(incoming, boardCode, nextNo, imageIds);
    // ร้านรายชิ้นต้องเป็นร้านของแผ่นนี้ (ไม่ส่งร้านมา = อ่านร้านปัจจุบัน)
    if (!supIds) supIds = (((await admin.from("sku_swatch_suppliers").select("id").eq("swatch_id", id)).data ?? []) as { id: string }[]).map((r) => r.id);
    for (const p of incoming) if (p.supplier_ref && !supIds.includes(p.supplier_ref)) p.supplier_ref = null;
    for (const p of incoming) {
      const old = p.id ? curMap.get(p.id) : undefined;
      if (old && old.sku_id !== p.sku_id) { if (p.sku_id) spotReport.linked++; else spotReport.unlinked++; }
      if (p.isOld) {
        const { error } = await admin.from("sku_swatch_spots").update({
          sku_id: p.sku_id, image_id: p.image_id, x: p.x, y: p.y, w: p.w, h: p.h, points: p.points, label: p.label, name: p.name, color_hex: p.color_hex,
          code: p.code, sort_order: p.sort_order, ...(canCost ? { price: p.price } : {}), supplier_ref: p.supplier_ref, updated_at: now,
        }).eq("id", p.id as string).eq("swatch_id", id);
        if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
        spotReport.updated++;
      }
    }
    const fresh = incoming.filter((p) => !p.isOld).map((p) => ({
      swatch_id: id, image_id: p.image_id, sku_id: p.sku_id, x: p.x, y: p.y, w: p.w, h: p.h, points: p.points, label: p.label, name: p.name,
      color_hex: p.color_hex, source: p.source, code: p.code, sort_order: p.sort_order, price: canCost ? p.price : null, supplier_ref: p.supplier_ref,
    }));
    if (fresh.length) {
      const { error } = await admin.from("sku_swatch_spots").insert(fresh);
      if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
      spotReport.added = fresh.length;
      spotReport.added_codes = fresh.map((f) => f.code).filter((x): x is string => !!x).slice(0, 50);
      spotReport.linked += fresh.filter((f) => !!f.sku_id).length;
    }
    changes.next_chip_no = nextNo;
  }

  const { error: upErr } = await admin.from("sku_swatches").update({ ...changes, updated_at: now }).eq("id", id);
  if (upErr) return NextResponse.json({ error: friendlyDbError(upErr.message) }, { status: 400 });
  const HIDDEN = new Set(["next_chip_no", "image_key", "image_w", "image_h"]);   // ตัวนับ/ปกจดแยกในรายงานรูป ไม่ต้องโชว์เป็น "แก้ช่อง"
  const shown = Object.fromEntries(Object.entries(changes).filter(([k]) => !HIDDEN.has(k)));
  await writeAudit(admin, {
    action: "update", entityType: "sku_swatches", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: {
      code: head.code, name: head.name,
      ...auditChangeMeta(head as unknown as Record<string, unknown>, shown, { opaque: ["family_tag_ids"] }),
      images: Array.isArray(b.images) ? imgReport : null,
      spots: Array.isArray(b.spots) ? spotReport : null,
      suppliers: supIn ? supReport : null,
    },
  });
  return NextResponse.json({ ok: true, images: imgReport, spots: spotReport, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  // เก็บ snapshot ลง audit ก่อนลบ (กู้ด้วยมือได้ถ้าลบผิด) — รูปใน R2 ไม่ลบ
  const [{ data: head }, { data: spots }, { data: images }] = await Promise.all([
    admin.from("sku_swatches").select(COLS).eq("id", id).maybeSingle(),
    admin.from("sku_swatch_spots").select(SPOT_COLS).eq("swatch_id", id),
    admin.from("sku_swatch_images").select(IMG_COLS).eq("swatch_id", id),
  ]);
  const { error } = await admin.from("sku_swatches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "sku_swatches", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { snapshot: head ?? null, images: images ?? [], spots: spots ?? [] } });
  return NextResponse.json({ ok: true, error: null });
}
