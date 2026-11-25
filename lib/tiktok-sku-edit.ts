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
 *   - ไม่แก้: ราคา (ใช้ค่าบนร้านล่าสุด) · รหัส SKU (BigSeller ผูกด้วยรหัสนี้) · ลบตัวเลือก
 *   - เพิ่มสีจากระบบ (เจ้าของเลือก 2026-11-24 "แบบ A + ข้อเสนอ 1, 2, 3, 5, 6"): SKU ใหม่ = ไม่ใส่ id + seller_sku + ราคา + sales_attributes(value_name)
 *     + inventory (TikTok บังคับ 1–99,999 → ใช้สต๊อกจริงในระบบครั้งเดียว · ในระบบ 0 = เพิ่มไม่ได้)
 *     สินค้าที่ขายอยู่ + เพิ่มสี: ส่งครั้งเดียวแบบ LISTING (ร่าง AS_DRAFT ไม่เก็บสต๊อก) → ตัวเลือกเดิมส่งสต๊อกเท่าที่อ่านจากร้านก่อนส่ง (ไม่เปลี่ยน)
 *     ตัวที่สต๊อก 0 ไม่ส่งช่องสต๊อก (ถ้า TikTok ล้าง = 0 เท่าเดิม)
 *
 * ref รูปในฟอร์ม: "tts:<uri>" = รูปเดิมบน TikTok · "r2:<key>" = รูปใหม่จากคลังรูปในระบบ
 */
import { TTS_PRICE_MAX, TTS_PRICE_MIN, tiktokImageRef, tiktokR2KeyOfRef, tiktokUriOfRef, type TiktokSkuView } from "@/lib/tiktok-listing-edit";

export const TTS_OPT_VALUE_MAX = 50;
/** สต๊อกต่อคลังที่ TikTok รับ (Partial Edit skus[].inventory[].quantity) */
export const TTS_STOCK_MIN = 1;
export const TTS_STOCK_MAX = 99_999;
/** จำนวน SKU ต่อสินค้า (กันพลาด — TikTok ไทยรับไม่เกิน 100) */
export const TTS_MAX_SKUS = 100;

export type TiktokOptValue = { key: string; id: string | null; name: string; img: { url: string; uri: string } | null; skuIds: string[] };
export type TiktokOptGroup = { key: string; id: string | null; name: string; values: TiktokOptValue[]; hasImages: boolean };
/** สีใหม่จากระบบ — ไซซ์ (สินค้าสี×ไซซ์) = ค่าเดิมของชั้นที่ 2 (valueKey) ที่ติ๊กเพิ่ม พร้อมรหัส/ราคา/สต๊อกของตัวเอง */
export type TiktokSkuAddSize = { valueKey: string; sku: string; price: number | null; stock: number | null };
/** code = รหัสสีในระบบ (= seller_sku ของสินค้าชั้นเดียว) · stock = สต๊อกในระบบ (หลังบ้านอ่านซ้ำเองก่อนส่ง) */
export type TiktokSkuAdd = { code: string; name: string; image: string | null; price: number | null; stock: number | null; sizes?: TiktokSkuAddSize[] };
/** ฟอร์มแก้ตัวเลือก: primary = ชั้นที่มีรูป · images[valueKey] = ref รูป · names["group|value"] = ชื่อค่า · adds = สีใหม่จากระบบ (ชั้นแรก) */
export type TiktokSkuForm = { primary: string | null; images: Record<string, string | null>; names: Record<string, string>; adds?: TiktokSkuAdd[] };

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

/**
 * SKU บนร้าน → แบบย่อที่ lib/listing-option-sync ใช้ (tierIndex = ตำแหน่งค่าในชั้นที่ 1/2 ตามลำดับ groups)
 * ใช้หา "สีนี้คือสีไหนในระบบ" (ชื่อตามระบบ) + รหัส/ราคาต่อไซซ์ของสีใหม่
 */
export function tiktokModelsLite(groups: TiktokOptGroup[], skus: Pick<TiktokSkuView, "skuId" | "sellerSku" | "price">[]): { sku: string | null; tierIndex: number[]; price: number | null }[] {
  return skus.map((x) => ({
    sku: x.sellerSku,
    price: x.price,
    tierIndex: groups.map((g) => g.values.findIndex((v) => v.skuIds.includes(x.skuId))),
  }));
}

/** จำนวน SKU ที่สีใหม่ตัวนี้จะสร้าง (ชั้นเดียว = 1 · สี×ไซซ์ = ไซซ์ที่ติ๊ก) */
export const tiktokAddSkuCount = (a: TiktokSkuAdd, twoTier: boolean): number => (twoTier ? (a.sizes ?? []).length : 1);

export type TiktokSkuChange = { label: string; before: string; after: string };
export type TiktokSkuPlan = {
  changed: boolean; imagesChanged: boolean; namesChanged: boolean;
  /** มีสีใหม่จากระบบ (ต้องส่งสต๊อก → สินค้าที่ขายอยู่ส่งแบบ LISTING ครั้งเดียว) */
  addsChanged: boolean;
  /** SKU ใหม่ทั้งหมดที่จะสร้าง */
  newSkuCount: number;
  /** รูปใหม่ที่ต้องฝากกับ TikTok ก่อน ("r2:<key>") */
  newImages: string[];
  changes: TiktokSkuChange[]; errors: string[]; warnings: string[];
};

const stockOk = (n: number | null | undefined): n is number => n != null && Number.isInteger(n) && n >= TTS_STOCK_MIN && n <= TTS_STOCK_MAX;
const priceOk = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n >= TTS_PRICE_MIN && n <= TTS_PRICE_MAX;
const skuCodeErr = (code: string): string | null => (!code ? "ยังไม่มีรหัส SKU" : /\s/.test(code) ? `รหัส "${code}" มีช่องว่าง (TikTok ไม่รับ)` : code.length > 50 ? `รหัส "${code.slice(0, 20)}…" ยาวเกิน 50 ตัวอักษร` : null);

/** ตรวจสีใหม่จากระบบ (ชั้นแรก) — ชื่อห้ามซ้ำ · รูปครบถ้าชั้นนี้มีรูป · ราคา/สต๊อก/รหัส ตามกฎ TikTok */
function planTiktokAdds(groups: TiktokOptGroup[], form: TiktokSkuForm, existingSkus: readonly (string | null)[]): { changes: TiktokSkuChange[]; errors: string[]; warnings: string[]; newImages: string[]; newSkuCount: number } {
  const adds = form.adds ?? [];
  const changes: TiktokSkuChange[] = []; const errors: string[] = []; const warnings: string[] = []; const newImages: string[] = [];
  if (!adds.length) return { changes, errors, warnings, newImages, newSkuCount: 0 };
  const color = groups[0];
  if (!color) { errors.push("สินค้านี้ไม่มีตัวเลือก — เพิ่มสีไม่ได้"); return { changes, errors, warnings, newImages, newSkuCount: 0 }; }
  if (groups.length > 2) { errors.push("สินค้าที่มีตัวเลือก 3 ชั้น ยังเพิ่มสีจากระบบไม่ได้ — เพิ่มใน Seller Center"); return { changes, errors, warnings, newImages, newSkuCount: 0 }; }
  const twoTier = groups.length === 2;
  const size = twoTier ? groups[1] : null;
  // รูป: ชั้นสีเป็นชั้นรูป และมีรูปอยู่ (ในฟอร์ม) → สีใหม่ต้องมีรูป (TikTok ต้องครบทุกค่า)
  const needImage = form.primary === color.key && color.values.some((v) => !!form.images[v.key]);
  const taken = new Set(color.values.map((v) => s(form.names[tiktokOptNameKey(color.key, v.key)] ?? v.name).toLowerCase()));
  const skuTaken = new Set(existingSkus.map((x) => s(x).toUpperCase()).filter(Boolean));
  let n = 0;
  for (const a of adds) {
    const name = s(a.name);
    const tag = name || a.code;
    if (!name) errors.push(`สีใหม่ ${a.code}: ยังไม่มีชื่อ`);
    else if (name.length > TTS_OPT_VALUE_MAX) errors.push(`สีใหม่ "${name.slice(0, 20)}…" ยาวเกิน ${TTS_OPT_VALUE_MAX} ตัวอักษร`);
    else if (taken.has(name.toLowerCase())) errors.push(`สีใหม่ "${name}" ชื่อซ้ำกับสีที่มีอยู่ — TikTok ไม่ให้ซ้ำในชั้นเดียวกัน`);
    if (name) taken.add(name.toLowerCase());
    if (needImage && !a.image) errors.push(`สีใหม่ "${tag}": ต้องใส่รูป (สินค้านี้มีรูปทุกสี — TikTok บังคับครบ)`);
    if (needImage && a.image && tiktokR2KeyOfRef(a.image) && !newImages.includes(a.image)) newImages.push(a.image);
    if (needImage && a.image && !tiktokR2KeyOfRef(a.image) && !tiktokUriOfRef(a.image)) errors.push(`สีใหม่ "${tag}": รูปที่เลือกใช้ไม่ได้ — เลือกรูปจากระบบใหม่`);
    const rows: { sku: string; price: number | null; stock: number | null; label: string }[] = !twoTier
      ? [{ sku: s(a.code), price: a.price, stock: a.stock, label: tag }]
      : (a.sizes ?? []).map((z) => ({ sku: s(z.sku), price: z.price, stock: z.stock, label: `${tag} · ${size!.values.find((v) => v.key === z.valueKey)?.name ?? "?"}` }));
    if (twoTier && !rows.length) errors.push(`สีใหม่ "${tag}": ติ๊ก${size!.name || "ไซซ์"}ที่จะเพิ่มอย่างน้อย 1 ค่า`);
    if (twoTier) for (const z of a.sizes ?? []) if (!size!.values.some((v) => v.key === z.valueKey)) errors.push(`สีใหม่ "${tag}": ${size!.name || "ไซซ์"}ที่เลือกไม่มีบนร้านแล้ว — ปิดแล้วเปิดลิ้นชักใหม่`);
    for (const r of rows) {
      const ce = skuCodeErr(r.sku);
      if (ce) errors.push(`${r.label}: ${ce}`);
      else if (skuTaken.has(r.sku.toUpperCase())) errors.push(`${r.label}: รหัส ${r.sku} มีบนร้านแล้ว`);
      else skuTaken.add(r.sku.toUpperCase());
      if (!priceOk(r.price)) errors.push(`${r.label}: ราคาต้องอยู่ระหว่าง ${TTS_PRICE_MIN.toLocaleString()}–${TTS_PRICE_MAX.toLocaleString()} บาท`);
      if (twoTier && r.stock == null) errors.push(`${r.label}: ใส่สต๊อกของ${size!.name || "ไซซ์"}นี้ (${TTS_STOCK_MIN}–${TTS_STOCK_MAX.toLocaleString()})`);
      else if (r.stock == null || r.stock <= 0) errors.push(`${r.label}: สต๊อก${twoTier ? "" : "ในระบบ"}เป็น 0 — ยังเพิ่มขึ้น TikTok ไม่ได้ (TikTok ต้องมีสต๊อกอย่างน้อย 1)`);
      else if (!stockOk(r.stock)) errors.push(`${r.label}: สต๊อกต้องเป็นจำนวนเต็ม ${TTS_STOCK_MIN}–${TTS_STOCK_MAX.toLocaleString()}`);
      n++;
    }
    changes.push({
      label: `เพิ่มสี ${color.name}`, before: "—",
      after: `${tag} (${twoTier ? rows.map((r) => r.sku).join(", ") : a.code}) · ${rows.map((r) => `${r.stock ?? 0} ชิ้น`).join(" / ")} · ${[...new Set(rows.map((r) => (r.price == null ? "—" : `฿${r.price.toLocaleString()}`)))].join("/")}`,
    });
  }
  const total = color.values.reduce((sum, v) => sum + v.skuIds.length, 0) + n;
  if (total > TTS_MAX_SKUS) errors.push(`รวมแล้ว ${total} ตัวเลือก เกินที่ TikTok รับ (${TTS_MAX_SKUS})`);
  warnings.push(`เพิ่มสีใหม่ ${adds.length} สี (${n} ตัวเลือก) — ใส่สต๊อกตามระบบครั้งเดียว (TikTok บังคับมีสต๊อก) หลังจากนั้น BigSeller ซิงค์ต่อเหมือนเดิม`);
  if (!needImage && form.primary === color.key) warnings.push("สินค้านี้ยังไม่มีรูปตัวเลือก — สีใหม่จะขึ้นแบบไม่มีรูปเหมือนสีเดิม");
  return { changes, errors, warnings, newImages, newSkuCount: n };
}

/**
 * เทียบตัวเลือกบนร้านกับฟอร์ม → ส่งไหม + กฎ (หน้าเว็บกับ API ใช้ตัวเดียวกัน)
 * status = สถานะรวมของสินค้า (PENDING/FREEZE/DELETED บันทึกร่างไม่ได้ → แก้ตัวเลือกไม่ได้)
 */
export function planTiktokSkuEdit(groups: TiktokOptGroup[], form: TiktokSkuForm, opts: { status: string | null; hasDraft?: boolean; existingSkus?: readonly (string | null)[] }): TiktokSkuPlan {
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
  // สีใหม่จากระบบ
  const ad = planTiktokAdds(groups, form, opts.existingSkus ?? []);
  const addsChanged = (form.adds ?? []).length > 0;
  changes.push(...ad.changes); errors.push(...ad.errors);
  for (const img of ad.newImages) if (!newImages.includes(img)) newImages.push(img);
  const changed = namesChanged || imagesChanged || addsChanged;
  const st = (opts.status ?? "").toUpperCase();
  if (changed && (st === "PENDING" || st === "FREEZE" || st === "DELETED")) {
    errors.push(st === "PENDING" ? "สินค้านี้รอ TikTok ตรวจอยู่ — แก้ตัวเลือกได้หลังตรวจเสร็จ (TikTok ไม่ให้บันทึกร่างระหว่างตรวจ)" : "สินค้าที่ถูกระงับ/ลบแล้ว แก้ตัวเลือกไม่ได้");
  }
  if (changed) {
    if (!addsChanged) warnings.push("ไม่แตะสต๊อก / ราคา / รหัส SKU — ส่งเฉพาะรูปและชื่อตัวเลือก (TikTok ตรวจใหม่ ระหว่างตรวจร้านยังใช้ของเดิม)");
    else {
      warnings.push(...ad.warnings);
      if (st !== "DRAFT") warnings.push("TikTok ให้ส่งสต๊อกทุกตัวเลือกพร้อมสีใหม่ — ตัวเลือกเดิมส่งค่าที่อ่านจากร้านก่อนส่ง (ไม่เปลี่ยน) · สีใหม่รอ TikTok ตรวจก่อนขึ้นขาย");
    }
    if (newImages.length) warnings.push(`รูปใหม่ ${newImages.length} รูปจะถูกทำเป็นจัตุรัสพื้นขาว 1500px แล้วฝากกับ TikTok ตอนกดบันทึก`);
    if (namesChanged) warnings.push("เปลี่ยนชื่อตัวเลือกแล้ว รหัส SKU บน TikTok ยังเหมือนเดิม (BigSeller/ออเดอร์ไม่กระทบ)");
    if (opts.hasDraft && st !== "DRAFT") warnings.push("มีฉบับร่างที่แก้ค้างไว้ใน Seller Center — จะถูกส่งตรวจไปพร้อมกัน");
  }
  return { changed, imagesChanged, namesChanged, addsChanged, newSkuCount: ad.newSkuCount, newImages, changes, errors, warnings };
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
 * positiveOnly (คู่กับ includeInventory · ใช้ตอนเพิ่มสีบนสินค้าที่ขายอยู่): ส่งเฉพาะคลังที่สต๊อก ≥ 1 (TikTok รับ 1–99,999 · ตัวที่ 0 ไม่ส่ง = 0 เท่าเดิม)
 * uriOf(ref) = uri ของรูป ("tts:<uri>" → uri เดิม · "r2:<key>" → uri ที่ฝากแล้ว) · ไม่รู้ = null → error
 */
export function buildTiktokSkusPayload(rawSkus: unknown, groups: TiktokOptGroup[], form: TiktokSkuForm, uriOf: (ref: string) => string | null, opts: { includeInventory: boolean; positiveOnly?: boolean }): { skus: Obj[]; errors: string[]; warnings: string[] } {
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
      const inv = arr(raw.inventory).map((w) => { const o: Obj = { warehouse_id: s(w.warehouse_id), quantity: Number(w.quantity ?? 0) }; if (w.backorder_quantity != null) o.backorder_quantity = w.backorder_quantity; if (w.handling_time != null) o.handling_time = w.handling_time; return o; })
        .filter((w) => w.warehouse_id && (!opts.positiveOnly || (Number(w.quantity) >= TTS_STOCK_MIN && Number(w.quantity) <= TTS_STOCK_MAX)));
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

/** คลังที่ใช้บ่อยสุดของ SKU บนร้าน (สีใหม่ใส่สต๊อกคลังนี้) · ไม่มี = null */
export function tiktokMainWarehouse(rawSkus: unknown): string | null {
  const count = new Map<string, number>();
  for (const raw of arr(rawSkus)) for (const w of arr(raw.inventory)) { const id = s(w.warehouse_id); if (id) count.set(id, (count.get(id) ?? 0) + 1); }
  let best: string | null = null; let n = 0;
  for (const [id, c] of count) if (c > n) { best = id; n = c; }
  return best;
}

/**
 * SKU ใหม่ของสีที่เพิ่ม (ต่อท้าย skus เดิม) — ไม่มี id · seller_sku · ราคา · สต๊อก (คลัง warehouseId) · sales_attributes
 *   ชั้นสี (ชั้นแรก): value_name = ชื่อสีใหม่ (+ sku_img ถ้าชั้นนี้เป็นชั้นรูป) · ชั้นไซซ์: ค่าเดิม (value_id หรือชื่อที่แก้ในรอบนี้)
 * stock ต้องผ่านการตรวจก่อน (planTiktokSkuEdit) — หลังบ้านแทนค่าด้วยสต๊อกในระบบที่อ่านเองแล้ว
 */
export function buildTiktokNewSkus(groups: TiktokOptGroup[], form: TiktokSkuForm, uriOf: (ref: string) => string | null, opts: { warehouseId: string; currency?: string }): { skus: Obj[]; errors: string[] } {
  const errors: string[] = []; const out: Obj[] = [];
  const color = groups[0]; const size = groups.length === 2 ? groups[1] : null;
  if (!color || groups.length > 2) return { skus: out, errors: (form.adds ?? []).length ? ["สินค้านี้เพิ่มสีจากระบบไม่ได้"] : [] };
  const needImage = form.primary === color.key && color.values.some((v) => !!form.images[v.key]);
  const grp = (g: TiktokOptGroup): Obj => (g.id ? { id: g.id } : { name: g.name });
  const money = (n: number | null) => ({ amount: n == null ? "" : String(Math.round(n * 100) / 100), currency: opts.currency || "THB" });
  for (const a of form.adds ?? []) {
    const name = s(a.name);
    const colorAttr: Obj = { ...grp(color), value_name: name };
    if (needImage) {
      const uri = a.image ? uriOf(a.image) : null;
      if (uri) colorAttr.sku_img = { uri }; else errors.push(`ไม่รู้รหัสรูปของสีใหม่ "${name}" — ลองบันทึกใหม่`);
    }
    const rows = size
      ? (a.sizes ?? []).map((z) => {
        const v = size.values.find((x) => x.key === z.valueKey);
        if (!v) { errors.push(`สีใหม่ "${name}": ไม่พบ${size.name || "ไซซ์"}ที่เลือก`); return null; }
        const next = s(form.names[tiktokOptNameKey(size.key, v.key)] ?? v.name);
        const sizeAttr: Obj = { ...grp(size), ...(v.id && next === v.name ? { value_id: v.id } : { value_name: next }) };
        // ชั้นรูปเป็นชั้นไซซ์ (ไม่ค่อยเจอ) → ใส่รูปเดิมของไซซ์นั้นด้วย (TikTok ต้องครบทุก SKU)
        const sizeImg = form.primary === size.key ? form.images[v.key] ?? null : null;
        if (sizeImg) { const uri = uriOf(sizeImg); if (uri) sizeAttr.sku_img = { uri }; }
        return { sku: s(z.sku), price: z.price, stock: z.stock, attrs: [colorAttr, sizeAttr] };
      })
      : [{ sku: s(a.code), price: a.price, stock: a.stock, attrs: [colorAttr] }];
    for (const r of rows) {
      if (!r) continue;
      if (!stockOk(r.stock)) { errors.push(`${r.sku}: สต๊อกไม่ถูกต้อง (${r.stock ?? "ไม่รู้"})`); continue; }
      if (!priceOk(r.price)) { errors.push(`${r.sku}: ราคาไม่ถูกต้อง`); continue; }
      out.push({ seller_sku: r.sku, price: money(r.price), inventory: [{ warehouse_id: opts.warehouseId, quantity: r.stock }], sales_attributes: r.attrs.map((x) => ({ ...x })) });
    }
  }
  return { skus: out, errors: [...new Set(errors)] };
}
