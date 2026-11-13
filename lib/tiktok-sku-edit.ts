/**
 * รูปตัวเลือก + ชื่อตัวเลือก บน TikTok (Partial Edit 202509 ช่อง skus) — pure (ไม่เรียก API) ใช้ได้ทั้งหน้าเว็บและหลังบ้าน + เทสต์
 * เจ้าของสั่ง 2026-11-13 "ทำ 1,2,4" (ข้อ 1 = รูปของแต่ละตัวเลือก + แก้ตัวเลือก)
 *
 * เอกสารทางการ (อ่าน 2026-11-13):
 *   - skus เป็นช่องบนสุด → ต้องส่ง "ทุก SKU" (SKU ที่ไม่ส่ง = ถูกลบ) และทุกช่องย่อยที่มีค่า (ช่องย่อยที่ไม่ส่ง = ถูกล้าง)
 *   - sales_attributes[{ id, value_id | value_name (กำหนดเอง ≤ 50 · ห้ามซ้ำในชั้นเดียวกัน), sku_img{ uri } }]
 *     sku_img ใส่ได้ชั้นเดียว (ชั้นหลัก เช่น สี) และต้องมีรูป "ทุกค่า" ของชั้นนั้น · uri จาก Upload Product Image use_case=ATTRIBUTE_IMAGE
 *   - ⚠️ สต๊อก: บันทึกแบบ AS_DRAFT กับสินค้าที่ขายอยู่ (post-live draft) → ช่อง inventory "ไม่ถูกบันทึก" และฉบับร่างใช้สต๊อกของฉบับขายเสมอ
 *     → สินค้าที่ขายอยู่: บันทึกตัวเลือกเป็นร่างก่อน (ไม่ส่งสต๊อก) แล้วค่อยส่งตรวจ (LISTING) → ไม่แตะสต๊อก (BigSeller ยังซิงค์สต๊อกอยู่)
 *     → สินค้าที่เป็นฉบับร่างอยู่แล้ว: บันทึก AS_DRAFT ครั้งเดียว ส่งสต๊อกเดิมของร่างกลับไป (ค่าเดิม)
 *   - ไม่แก้: ราคา (ใช้ค่าบนร้านล่าสุด) · รหัส SKU (BigSeller ผูกด้วยรหัสนี้) · เพิ่ม/ลบตัวเลือก
 *
 * ref รูปในฟอร์ม: "tts:<uri>" = รูปเดิมบน TikTok · "r2:<key>" = รูปใหม่จากคลังรูปในระบบ
 */
import { tiktokImageRef, tiktokR2KeyOfRef, tiktokUriOfRef, type TiktokSkuView } from "@/lib/tiktok-listing-edit";

export const TTS_OPT_VALUE_MAX = 50;

export type TiktokOptValue = { key: string; id: string | null; name: string; img: { url: string; uri: string } | null; skuIds: string[] };
export type TiktokOptGroup = { key: string; id: string | null; name: string; values: TiktokOptValue[]; hasImages: boolean };
/** ฟอร์มแก้ตัวเลือก: primary = ชั้นที่มีรูป · images[valueKey] = ref รูป · names["group|value"] = ชื่อค่า */
export type TiktokSkuForm = { primary: string | null; images: Record<string, string | null>; names: Record<string, string> };

const s = (v: unknown): string => (v == null ? "" : String(v)).trim();
const groupKeyOf = (a: { id: string | null; name: string | null }) => (a.id ? `id:${a.id}` : `n:${s(a.name)}`);
const valueKeyOf = (a: { valueId: string | null; valueName: string | null }) => (a.valueId ? `id:${a.valueId}` : `n:${s(a.valueName)}`);
export const tiktokOptNameKey = (groupKey: string, valueKey: string): string => `${groupKey}|${valueKey}`;

/** ชั้นตัวเลือก (เช่น สี / ไซซ์) + ค่าในแต่ละชั้น จาก SKU ในมุมมองลิ้นชัก — ลำดับตามที่เจอ */
export function tiktokOptionGroups(skus: Pick<TiktokSkuView, "skuId" | "attrs">[]): TiktokOptGroup[] {
  const groups = new Map<string, TiktokOptGroup>();
  for (const sku of skus) {
    for (const a of sku.attrs ?? []) {
      const gk = groupKeyOf(a);
      let g = groups.get(gk);
      if (!g) { g = { key: gk, id: a.id, name: s(a.name) || "ตัวเลือก", values: [], hasImages: false }; groups.set(gk, g); }
      const vk = valueKeyOf(a);
      let v = g.values.find((x) => x.key === vk);
      if (!v) { v = { key: vk, id: a.valueId, name: s(a.valueName), img: a.img ?? null, skuIds: [] }; g.values.push(v); }
      if (!v.img && a.img) v.img = a.img;
      if (!v.skuIds.includes(sku.skuId)) v.skuIds.push(sku.skuId);
      if (a.img) g.hasImages = true;
    }
  }
  return [...groups.values()];
}

/** ฟอร์มตั้งต้น = ของบนร้าน (ชั้นหลัก = ชั้นที่มีรูปอยู่แล้ว ไม่งั้นชั้นแรก) */
export function tiktokSkuFormOf(groups: TiktokOptGroup[]): TiktokSkuForm {
  const primary = (groups.find((g) => g.hasImages) ?? groups[0])?.key ?? null;
  const images: Record<string, string | null> = {};
  const names: Record<string, string> = {};
  for (const g of groups) {
    for (const v of g.values) {
      names[tiktokOptNameKey(g.key, v.key)] = v.name;
      if (g.key === primary) images[v.key] = v.img ? tiktokImageRef(v.img.uri) : null;
    }
  }
  return { primary, images, names };
}

/** ลายเซ็นตัวเลือกบนร้าน (กันส่งทับ — ไม่รวมราคา/สต๊อก) */
export function tiktokSkuSignature(skus: Pick<TiktokSkuView, "skuId" | "attrs">[]): string {
  return JSON.stringify(skus.map((x) => [x.skuId, (x.attrs ?? []).map((a) => [a.id, a.valueId, a.valueName, a.img?.uri ?? null])]));
}

export type TiktokSkuChange = { label: string; before: string; after: string };
export type TiktokSkuPlan = {
  changed: boolean; imagesChanged: boolean; namesChanged: boolean;
  /** รูปใหม่ที่ต้องฝากกับ TikTok ก่อน ("r2:<key>") */
  newImages: string[];
  changes: TiktokSkuChange[]; errors: string[]; warnings: string[];
};

/**
 * เทียบตัวเลือกบนร้านกับฟอร์ม → ส่งไหม + กฎ (หน้าเว็บกับ API ใช้ตัวเดียวกัน)
 * status = สถานะรวมของสินค้า (PENDING/FREEZE/DELETED บันทึกร่างไม่ได้ → แก้ตัวเลือกไม่ได้)
 */
export function planTiktokSkuEdit(groups: TiktokOptGroup[], form: TiktokSkuForm, opts: { status: string | null; hasDraft?: boolean }): TiktokSkuPlan {
  const base = tiktokSkuFormOf(groups);
  const changes: TiktokSkuChange[] = []; const errors: string[] = []; const warnings: string[] = [];
  // ชื่อค่า
  let namesChanged = false;
  for (const g of groups) {
    const seen = new Map<string, number>();
    for (const v of g.values) {
      const k = tiktokOptNameKey(g.key, v.key);
      const next = s(form.names[k] ?? v.name);
      seen.set(next.toLowerCase(), (seen.get(next.toLowerCase()) ?? 0) + 1);
      if (next === v.name) continue;
      namesChanged = true;
      changes.push({ label: `ชื่อตัวเลือก ${g.name}`, before: v.name || "(ว่าง)", after: next || "(ว่าง)" });
      if (!next) errors.push(`${g.name}: ชื่อตัวเลือกว่างไม่ได้`);
      else if (next.length > TTS_OPT_VALUE_MAX) errors.push(`${g.name}: ชื่อ "${next.slice(0, 20)}…" ยาวเกิน ${TTS_OPT_VALUE_MAX} ตัวอักษร`);
    }
    const dup = [...seen.entries()].filter(([n, c]) => n && c > 1).map(([n]) => n);
    if (dup.length) errors.push(`${g.name}: ชื่อตัวเลือกซ้ำกัน (${dup.slice(0, 3).join(", ")}) — TikTok ไม่ให้ซ้ำในชั้นเดียวกัน`);
  }
  // รูป (ชั้นหลักชั้นเดียว)
  const primary = groups.find((g) => g.key === form.primary) ?? null;
  const basePrimary = groups.find((g) => g.key === base.primary) ?? null;
  let imagesChanged = false;
  const newImages: string[] = [];
  if (primary) {
    const switched = primary.key !== basePrimary?.key && !!basePrimary?.hasImages;
    for (const v of primary.values) {
      const next = form.images[v.key] ?? null;
      const before = primary.key === base.primary ? base.images[v.key] ?? null : null;
      if (next && tiktokR2KeyOfRef(next) && !newImages.includes(next)) newImages.push(next);
      if (next === before) continue;
      imagesChanged = true;
      changes.push({ label: `รูปตัวเลือก ${primary.name}: ${s(form.names[tiktokOptNameKey(primary.key, v.key)] ?? v.name)}`, before: before ? "รูปเดิม" : "ไม่มี", after: !next ? "ไม่มี" : tiktokR2KeyOfRef(next) ? "รูปใหม่" : "รูปเดิม" });
    }
    if (switched) { imagesChanged = true; warnings.push(`ย้ายรูปตัวเลือกจากชั้น "${basePrimary!.name}" ไปชั้น "${primary.name}" — รูปเดิมของชั้น "${basePrimary!.name}" จะหายจาก TikTok`); }
    const withImg = primary.values.filter((v) => form.images[v.key]).length;
    if (imagesChanged && withImg > 0 && withImg < primary.values.length) errors.push(`ต้องใส่รูปให้ครบทุกค่าของชั้น "${primary.name}" (ขาด ${primary.values.length - withImg} ค่า) — TikTok บังคับ`);
    if (imagesChanged && withImg === 0 && basePrimary?.hasImages) errors.push("เอารูปตัวเลือกออกทั้งหมดไม่ได้ — TikTok ไม่มีให้ล้าง ให้เปลี่ยนรูปแทน");
    for (const ref of Object.values(form.images)) if (ref && !tiktokUriOfRef(ref) && !tiktokR2KeyOfRef(ref)) { errors.push("มีรูปตัวเลือกที่ระบบไม่รู้จัก — ปิดแล้วเปิดลิ้นชักใหม่"); break; }
  }
  const changed = namesChanged || imagesChanged;
  const st = (opts.status ?? "").toUpperCase();
  if (changed && (st === "PENDING" || st === "FREEZE" || st === "DELETED")) {
    errors.push(st === "PENDING" ? "สินค้านี้รอ TikTok ตรวจอยู่ — แก้ตัวเลือกได้หลังตรวจเสร็จ (TikTok ไม่ให้บันทึกร่างระหว่างตรวจ)" : "สินค้าที่ถูกระงับ/ลบแล้ว แก้ตัวเลือกไม่ได้");
  }
  if (changed) {
    warnings.push("ไม่แตะสต๊อก / ราคา / รหัส SKU — ส่งเฉพาะรูปและชื่อตัวเลือก (TikTok ตรวจใหม่ ระหว่างตรวจร้านยังใช้ของเดิม)");
    if (newImages.length) warnings.push(`รูปใหม่ ${newImages.length} รูปจะถูกทำเป็นจัตุรัสพื้นขาว 1500px แล้วฝากกับ TikTok ตอนกดบันทึก`);
    if (namesChanged) warnings.push("เปลี่ยนชื่อตัวเลือกแล้ว รหัส SKU บน TikTok ยังเหมือนเดิม (BigSeller/ออเดอร์ไม่กระทบ)");
    if (opts.hasDraft && st !== "DRAFT") warnings.push("มีฉบับร่างที่แก้ค้างไว้ใน Seller Center — จะถูกส่งตรวจไปพร้อมกัน");
  }
  return { changed, imagesChanged, namesChanged, newImages, changes, errors, warnings };
}

// ───────── ประกอบ skus ที่ส่ง TikTok (หลังบ้าน · ต้องใช้รายละเอียดดิบจาก Get Product) ─────────
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Obj[] : []);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** ช่องย่อยของ SKU ที่ Partial Edit รับ — คัดลอกตามของบนร้าน (ไม่ส่ง = ถูกล้าง) */
const COPY_FIELDS = ["seller_sku", "identifier_code", "external_sku_id", "external_urls", "extra_identifier_codes", "fees", "list_price", "external_list_prices", "pre_sale", "sku_dimensions", "sku_unit_count", "sku_weight"] as const;

/**
 * skus ทั้งชุดที่ส่ง Partial Edit — คงทุกอย่างตามบนร้าน เปลี่ยนเฉพาะชื่อค่า + รูปชั้นหลัก
 * includeInventory: true = สินค้าเป็นฉบับร่าง (ส่งสต๊อกเดิมของร่างกลับ) · false = สินค้าที่ขายอยู่ (ไม่ส่งสต๊อกเลย)
 * uriOf(ref) = uri ของรูป ("tts:<uri>" → uri เดิม · "r2:<key>" → uri ที่ฝากแล้ว) · ไม่รู้ = null → error
 */
export function buildTiktokSkusPayload(rawSkus: unknown, groups: TiktokOptGroup[], form: TiktokSkuForm, uriOf: (ref: string) => string | null, opts: { includeInventory: boolean }): { skus: Obj[]; errors: string[]; warnings: string[] } {
  const errors: string[] = []; const warnings: string[] = [];
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const out: Obj[] = [];
  let bundle = false; let limit = false;
  for (const raw of arr(rawSkus)) {
    const id = s(raw.id);
    if (!id) { errors.push("มี SKU บนร้านที่ไม่มีรหัส — ดึงตัวนี้จาก TikTok ใหม่"); continue; }
    if (arr(raw.combined_skus).length) bundle = true;
    if (obj(raw.purchase_order_quantity_limit)) limit = true;
    const sku: Obj = { id };
    for (const f of COPY_FIELDS) if (raw[f] != null && raw[f] !== "") sku[f] = clone(raw[f]);
    const price = obj(raw.price);
    const amount = s(price?.sale_price) || s(price?.tax_exclusive_price);
    if (!amount) errors.push(`SKU ${s(raw.seller_sku) || id}: ไม่รู้ราคาบนร้าน — ดึงตัวนี้จาก TikTok ใหม่`);
    sku.price = { amount, currency: s(price?.currency) || "THB" };
    if (opts.includeInventory) {
      const inv = arr(raw.inventory).map((w) => { const o: Obj = { warehouse_id: s(w.warehouse_id), quantity: Number(w.quantity ?? 0) }; if (w.backorder_quantity != null) o.backorder_quantity = w.backorder_quantity; if (w.handling_time != null) o.handling_time = w.handling_time; return o; }).filter((w) => w.warehouse_id);
      if (inv.length) sku.inventory = inv;
    }
    const sa = arr(raw.sales_attributes).map((a) => {
      const gk = s(a.id) ? `id:${s(a.id)}` : `n:${s(a.name)}`;
      const vk = s(a.value_id) ? `id:${s(a.value_id)}` : `n:${s(a.value_name)}`;
      const g = byKey.get(gk);
      const oldName = s(a.value_name);
      const nextName = s(form.names[tiktokOptNameKey(gk, vk)] ?? oldName);
      const o: Obj = s(a.id) ? { id: s(a.id) } : { name: s(a.name) };
      if (nextName !== oldName || !s(a.value_id)) o.value_name = nextName; else o.value_id = s(a.value_id);
      if (g && g.key === form.primary) {
        const ref = form.images[vk] ?? null;
        if (ref) { const uri = uriOf(ref); if (uri) o.sku_img = { uri }; else errors.push(`ไม่รู้รหัสรูปของตัวเลือก "${nextName}" — ลองบันทึกใหม่`); }
      }
      return o;
    });
    if (sa.length) sku.sales_attributes = sa;
    out.push(sku);
  }
  if (bundle) warnings.push("สินค้านี้มี SKU แบบชุดรวม (bundle) — ตรวจใน Seller Center หลังบันทึก");
  if (limit) warnings.push("สินค้านี้ตั้งจำกัดจำนวนซื้อต่อออเดอร์ไว้ — ตรวจใน Seller Center หลังบันทึกว่ายังอยู่");
  return { skus: out, errors: [...new Set(errors)], warnings };
}
