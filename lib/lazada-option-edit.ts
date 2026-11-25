/**
 * แท็บตัวเลือกของสินค้าบน Lazada — แก้ชื่อตัวเลือก (เช่น ชื่อสี) + เพิ่มสีจากระบบ (pure · ไม่เรียก API · หน้าเว็บกับหลังบ้านใช้ตัวเดียวกัน + เทสต์)
 * เจ้าของเลือก 2026-11-24 "แบบ A + ข้อเสนอ 1, 2, 3, 5, 6" · ปิดขายทีละสี (ข้อ 2) มีอยู่แล้วที่คอลัมน์ "ขาย" · รูปตัวเลือกแก้ที่โหมด "รูป · น้ำหนัก · กล่อง"
 *
 * คู่มือ Lazada (Custom sales attributes + UpdateProduct · อ่าน 2026-11-25):
 *   - แก้ชื่อค่า: /product/update ส่ง SkuId + saleProp ใหม่ (CASE2: Red → Green · ชั้นมาตรฐานไม่ต้องประกาศ variation)
 *     ชั้นกำหนดเอง (customize) ต้องประกาศ variation พร้อม options ทั้งชุด (CASE3) · ค่ายาวได้ 20 ตัวอักษร · ≤ 50 ค่าต่อชั้น
 *   - เพิ่ม SKU: /product/update ใส่ AssociatedSku = SellerSku ของ SKU ที่มีอยู่ในสินค้านี้ + Sku ใหม่ (ไม่มี SkuId) พร้อม saleProp/ราคา/สต๊อก/กล่อง (CASE1)
 *     ⚠️ คู่มือเขียนสองแบบ (SellerSku / SKU id) → ใช้ SellerSku ตามตัวอย่าง · ยังไม่เคยลองกับร้านจริง
 *   - SKU ต้องมี saleProp ครบทุกชั้นเหมือนกัน · มีรูปตัวเลือก = SKU ใหม่ต้องมีรูปด้วย (ลิงก์ Lazada เท่านั้น — ผู้เรียกฝากรูปก่อน)
 *   - ส่ง Status ของทุก SKU ที่ส่งไปด้วยเสมอ (ไม่ส่ง = Lazada ถือเป็น active)
 * สต๊อกสีใหม่ = 0 (เหมือน Shopee · BigSeller เติมให้ถ้าผูกรหัส — ไม่ส่งสต๊อกขณะ BigSeller ซิงค์)
 */
import { pickColorTier } from "@/lib/listing-option-sync";
import type { LazadaListingView, LazadaSkuView } from "@/lib/lazada-listing-edit";

export const LAZ_OPT_NAME_MAX = 20;
export const LAZ_OPT_VALUES_MAX = 50;

export type LazOptValue = { value: string; skuIds: string[] };
export type LazOptGroup = { name: string; label: string; customize: boolean; hasImage: boolean; values: LazOptValue[] };
export type LazOptAddSize = { value: string; sku: string; price: number | null };
/** สีใหม่จากระบบ · code = รหัสสีในระบบ (= SellerSku ของสินค้าชั้นเดียว) · special = ราคาลด (ไม่มีวันหมด) */
export type LazOptAdd = { code: string; name: string; image: string | null; price: number | null; special: number | null; sizes?: LazOptAddSize[] };
/** names["ชั้น|ค่าเดิม"] = ชื่อใหม่ · colorGroup = ชื่อชั้นที่เป็นสี (ชั้นที่เพิ่มค่าใหม่) */
export type LazOptForm = { names: Record<string, string>; adds: LazOptAdd[]; colorGroup: string | null };
export type LazOptChange = { label: string; before: string; after: string };
export type LazOptPlan = {
  changed: boolean; renamesChanged: boolean; addsChanged: boolean;
  /** SKU ที่ค่าตัวเลือกเปลี่ยน (ส่งรอบแก้ชื่อ) */
  renamedSkuIds: string[];
  newSkuCount: number;
  /** รูปของสีใหม่ที่ต้องฝากกับ Lazada ก่อน ("r2:<key>") */
  newImages: string[];
  changes: LazOptChange[]; errors: string[]; warnings: string[];
};

const s = (v: unknown): string => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();
export const lazOptNameKey = (group: string, value: string): string => `${group}|${value}`;
const PROP_TH: Record<string, string> = { color_family: "สี", color: "สี", size: "ไซซ์" };
const groupLabel = (g: { name: string; label: string }) => PROP_TH[g.name.toLowerCase()] ?? g.label ?? g.name;

/** ชั้นตัวเลือก + ค่า (เรียงตาม Variation1… แล้วตามลำดับ options) · ไม่มี variation = เดาจาก saleProp ของ SKU */
export function lazOptionGroups(v: Pick<LazadaListingView, "skus" | "variations">): LazOptGroup[] {
  const vars = v.variations ?? [];
  const names = vars.length ? vars.map((x) => x.name) : Object.keys(v.skus.find((x) => x.saleProp && Object.keys(x.saleProp).length)?.saleProp ?? {});
  return names.map((name) => {
    const def = vars.find((x) => x.name === name);
    const values: LazOptValue[] = (def?.options ?? []).map((o) => ({ value: o, skuIds: [] }));
    for (const sku of v.skus) {
      const val = s(sku.saleProp?.[name]);
      if (!val) continue;
      let row = values.find((x) => x.value === val);
      if (!row) { row = { value: val, skuIds: [] }; values.push(row); }
      row.skuIds.push(sku.skuId);
    }
    return { name, label: groupLabel({ name, label: def?.label ?? name }), customize: !!def?.customize, hasImage: !!def?.hasImage, values: values.filter((x) => x.skuIds.length) };
  }).filter((g) => g.values.length);
}

/**
 * ชั้นไหนคือ "สี" — ชั้นที่แต่ละค่าตรงกับสีในระบบตัวเดียวมากที่สุด (ไซซ์ = ค่าเดียวกระจายหลายสี) · เสมอ = ชื่อ color/สี → ชั้นแรก
 * (Lazada บางสินค้าเรียง "จำนวน · สี" — สีไม่ได้อยู่ชั้นแรกเสมอ)
 */
export function lazColorGroup(groups: LazOptGroup[], skus: Pick<LazadaSkuView, "skuId" | "sellerSku">[], sysCodes: readonly string[]): string | null {
  const skuOf = new Map(skus.map((x) => [x.skuId, x.sellerSku]));
  const i = pickColorTier(groups.map((g) => ({ name: `${g.name} ${g.label}`, values: g.values.map((val) => ({ skus: val.skuIds.map((id) => skuOf.get(id)) })) })), sysCodes);
  return i < 0 ? null : groups[i].name;
}

/** แบบย่อให้ lib/listing-option-sync (tierIndex = [ตำแหน่งในชั้นสี, ตำแหน่งในชั้นอื่น]) */
export function lazModelsLite(groups: LazOptGroup[], colorGroup: string | null, skus: Pick<LazadaSkuView, "skuId" | "sellerSku" | "price">[]): { sku: string | null; tierIndex: number[]; price: number | null }[] {
  const color = groups.find((g) => g.name === colorGroup) ?? groups[0];
  const other = groups.find((g) => g !== color) ?? null;
  return skus.map((x) => ({
    sku: x.sellerSku, price: x.price,
    tierIndex: [color ? color.values.findIndex((v) => v.skuIds.includes(x.skuId)) : -1, ...(other ? [other.values.findIndex((v) => v.skuIds.includes(x.skuId))] : [])],
  }));
}

/** ลายเซ็นตัวเลือกบนร้าน (กันส่งทับ) — SKU + ค่าทุกชั้น */
export function lazOptionSignature(v: Pick<LazadaListingView, "skus">): string {
  return JSON.stringify(v.skus.map((x) => [x.skuId, x.sellerSku ?? "", Object.entries(x.saleProp ?? {}).sort(([a], [b]) => a.localeCompare(b))]));
}

const priceOk = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0 && n <= 10_000_000;
const skuCodeErr = (code: string): string | null => (!code ? "ยังไม่มีรหัส SKU" : code.length > 200 ? "รหัสยาวเกิน 200 ตัวอักษร" : null);
/** ชื่อใหม่ของค่า (หลังแก้) */
const nameAfter = (form: LazOptForm, g: string, value: string) => s(form.names[lazOptNameKey(g, value)] ?? value);

/** เทียบตัวเลือกบนร้านกับฟอร์ม → แผน (ชื่อห้ามว่าง/ซ้ำ · ชั้นกำหนดเองยาว ≤ 20 · สีใหม่: ชื่อ/รหัส/ราคา/รูป/ไซซ์) */
export function planLazadaOptions(v: Pick<LazadaListingView, "skus" | "variations" | "imageVariation">, groups: LazOptGroup[], form: LazOptForm): LazOptPlan {
  const changes: LazOptChange[] = []; const errors: string[] = []; const warnings: string[] = []; const newImages: string[] = [];
  const renamed = new Set<string>();
  for (const g of groups) {
    const seen = new Map<string, number>();
    for (const val of g.values) {
      const next = nameAfter(form, g.name, val.value);
      seen.set(next.toLowerCase(), (seen.get(next.toLowerCase()) ?? 0) + 1);
      if (next === val.value) continue;
      val.skuIds.forEach((id) => renamed.add(id));
      changes.push({ label: `ชื่อตัวเลือก ${g.label}`, before: val.value, after: next || "(ว่าง)" });
      if (!next) errors.push(`${g.label}: ชื่อตัวเลือกว่างไม่ได้`);
      else if (next.length > LAZ_OPT_NAME_MAX) (g.customize ? errors : warnings).push(`${g.label}: "${next}" ยาวเกิน ${LAZ_OPT_NAME_MAX} ตัวอักษร${g.customize ? " — Lazada ไม่รับ" : " — Lazada อาจไม่รับ"}`);
    }
    // สีใหม่ต้องไม่ชนชื่อเดิม
    if (g.name === form.colorGroup) for (const a of form.adds) { const n = s(a.name); if (n) seen.set(n.toLowerCase(), (seen.get(n.toLowerCase()) ?? 0) + 1); }
    const dup = [...seen.entries()].filter(([n, c]) => n && c > 1).map(([n]) => n);
    if (dup.length) errors.push(`${g.label}: ชื่อตัวเลือกซ้ำกัน (${dup.slice(0, 3).join(", ")}) — Lazada ไม่ให้ซ้ำในชั้นเดียวกัน`);
  }
  // สีใหม่
  let newSkuCount = 0;
  const adds = form.adds ?? [];
  if (adds.length) {
    const color = groups.find((g) => g.name === form.colorGroup) ?? null;
    const other = color ? groups.find((g) => g !== color) ?? null : null;
    if (!color) errors.push("สินค้านี้ไม่มีตัวเลือก — Lazada เพิ่มสีให้สินค้าที่ไม่มีตัวเลือกไม่ได้");
    else if (groups.length > 2) errors.push("สินค้าที่มีตัวเลือกเกิน 2 ชั้น ยังเพิ่มสีจากระบบไม่ได้ — เพิ่มใน Seller Center");
    else {
      const needImage = v.skus.some((x) => x.images.length > 0) || color.hasImage;
      const skuTaken = new Set(v.skus.map((x) => s(x.sellerSku).toUpperCase()).filter(Boolean));
      if (color.values.length + adds.length > LAZ_OPT_VALUES_MAX) errors.push(`${color.label}รวมแล้ว ${color.values.length + adds.length} ค่า เกินที่ Lazada รับ (${LAZ_OPT_VALUES_MAX})`);
      for (const a of adds) {
        const name = s(a.name); const tag = name || a.code;
        if (!name) errors.push(`สีใหม่ ${a.code}: ยังไม่มีชื่อ`);
        else if (name.length > LAZ_OPT_NAME_MAX) (color.customize ? errors : warnings).push(`สีใหม่ "${name}" ยาวเกิน ${LAZ_OPT_NAME_MAX} ตัวอักษร${color.customize ? " — Lazada ไม่รับ" : " — Lazada อาจไม่รับ"}`);
        if (needImage && !a.image) errors.push(`สีใหม่ "${tag}": ต้องใส่รูป (ตัวเลือกเดิมมีรูป — Lazada ให้มีรูปครบทุกตัว)`);
        if (needImage && a.image?.startsWith("r2:") && !newImages.includes(a.image)) newImages.push(a.image);
        if (needImage && a.image && !a.image.startsWith("r2:") && !/^https?:\/\//i.test(a.image)) errors.push(`สีใหม่ "${tag}": รูปที่เลือกใช้ไม่ได้ — เลือกรูปจากระบบใหม่`);
        const rows = other
          ? (a.sizes ?? []).map((z) => ({ sku: s(z.sku), price: z.price, label: `${tag} · ${nameAfter(form, other.name, z.value)}`, ok: other.values.some((x) => x.value === z.value) }))
          : [{ sku: s(a.code), price: a.price, label: tag, ok: true }];
        if (other && !rows.length) errors.push(`สีใหม่ "${tag}": ติ๊ก${other.label}ที่จะเพิ่มอย่างน้อย 1 ค่า`);
        for (const r of rows) {
          if (!r.ok) { errors.push(`${r.label}: ไม่มีค่านี้บนร้านแล้ว — ปิดแล้วเปิดลิ้นชักใหม่`); continue; }
          const ce = skuCodeErr(r.sku);
          if (ce) errors.push(`${r.label}: ${ce}`);
          else if (skuTaken.has(r.sku.toUpperCase())) errors.push(`${r.label}: รหัส ${r.sku} มีบนร้านแล้ว`);
          else skuTaken.add(r.sku.toUpperCase());
          if (!priceOk(r.price)) errors.push(`${r.label}: ใส่ราคา`);
          else if (a.special != null && (a.special <= 0 || a.special >= r.price)) errors.push(`${r.label}: ราคาลดต้องต่ำกว่าราคาปกติ`);
          newSkuCount++;
        }
        changes.push({ label: `เพิ่มสี ${color.label}`, before: "—", after: `${tag} (${other ? rows.map((r) => r.sku).join(", ") : a.code}) · ฿${[...new Set(rows.map((r) => r.price ?? 0))].join("/")}${a.special != null ? ` ลดเหลือ ฿${a.special}` : ""} · สต๊อก 0` });
      }
      if (!v.skus.some((x) => x.weight != null && x.length != null && x.width != null && x.height != null)) errors.push("ตัวเลือกเดิมไม่มีน้ำหนัก/ขนาดกล่อง — ใส่ที่โหมด \"รูป · น้ำหนัก · กล่อง\" ก่อน (สีใหม่ใช้ค่าเดียวกัน)");
      warnings.push(`เพิ่มสีใหม่ ${adds.length} สี (${newSkuCount} ตัวเลือก) ด้วยสต๊อก 0 — BigSeller เติมสต๊อกให้ถ้าผูกรหัสไว้ · น้ำหนัก/กล่องใช้ค่าเดียวกับตัวเลือกเดิม`);
    }
  }
  if (renamed.size) {
    warnings.push("เปลี่ยนชื่อตัวเลือกแล้ว รหัส SKU บน Lazada ยังเหมือนเดิม (BigSeller/ออเดอร์ไม่กระทบ)");
    if (groups.some((g) => g.customize && g.values.some((val) => nameAfter(form, g.name, val.value) !== val.value))) warnings.push("ชั้นนี้เป็นชั้นที่ร้านตั้งเอง — ระบบส่งรายการค่าทั้งชั้นไปด้วย");
  }
  const renamesChanged = renamed.size > 0; const addsChanged = adds.length > 0;
  return { changed: renamesChanged || addsChanged, renamesChanged, addsChanged, renamedSkuIds: [...renamed], newSkuCount, newImages, changes, errors: [...new Set(errors)], warnings };
}

// ───────── XML ที่ส่ง /product/update (หลังบ้าน) ─────────
const xmlText = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cdata = (x: string) => `<![CDATA[${x.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
const tagOk = (k: string) => /^[A-Za-z][A-Za-z0-9_]*$/.test(k);
const salePropXml = (props: [string, string][]) => `<saleProp>${props.filter(([k]) => tagOk(k)).map(([k, x]) => `<${k}>${cdata(x)}</${k}>`).join("")}</saleProp>`;

/** ประกาศชั้นตัวเลือก (เฉพาะเมื่อมีชั้นที่ร้านตั้งเอง) — options ทั้งชุดหลังแก้ชื่อ + สีใหม่ */
function variationXml(groups: LazOptGroup[], form: LazOptForm): string {
  if (!groups.some((g) => g.customize)) return "";
  const body = groups.map((g, i) => {
    const opts = [...g.values.map((val) => nameAfter(form, g.name, val.value)), ...(g.name === form.colorGroup ? form.adds.map((a) => s(a.name)) : [])];
    return `<variation${i + 1}><name>${xmlText(g.name)}</name><hasImage>${g.hasImage}</hasImage><customize>${g.customize}</customize><options>${[...new Set(opts)].map((o) => `<option>${cdata(o)}</option>`).join("")}</options></variation${i + 1}>`;
  }).join("");
  return `<variation>${body}</variation>`;
}

/** รอบแก้ชื่อ: เฉพาะ SKU ที่ค่าเปลี่ยน · saleProp ครบทุกชั้น (ชื่อใหม่) · สถานะเดิม · null = ไม่มีอะไรเปลี่ยน */
export function lazRenameXml(itemId: string, v: Pick<LazadaListingView, "skus">, groups: LazOptGroup[], form: LazOptForm): string | null {
  const touched = v.skus.filter((x) => groups.some((g) => { const val = s(x.saleProp?.[g.name]); return !!val && nameAfter(form, g.name, val) !== val; }));
  if (!touched.length) return null;
  const skus = touched.map((x) => {
    const props = groups.map((g): [string, string] => { const val = s(x.saleProp?.[g.name]); return [g.name, val ? nameAfter(form, g.name, val) : ""]; }).filter(([, val]) => !!val);
    return `<Sku><SkuId>${xmlText(x.skuId)}</SkuId>${x.sellerSku ? `<SellerSku>${xmlText(x.sellerSku)}</SellerSku>` : ""}<Status>${x.status === "inactive" ? "inactive" : "active"}</Status>${salePropXml(props)}</Sku>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Request><Product><ItemId>${xmlText(itemId)}</ItemId>${variationXml(groups, form)}<Attributes></Attributes><Skus>${skus}</Skus></Product></Request>`;
}

/**
 * รอบเพิ่มสี: AssociatedSku (SellerSku ที่มีอยู่) + SKU ใหม่ (ไม่มี SkuId) · saleProp ครบทุกชั้น (ชั้นอื่นใช้ชื่อหลังแก้) · สต๊อก 0
 * กล่อง = ตัวเลือกเดิมตัวแรกที่มีครบ · imageUrlOf(ref) = ลิงก์ Lazada ของรูป (ฝากแล้ว) · ไม่มีรูปตัวเลือก = ไม่ส่งรูป
 */
export function lazAddSkusXml(itemId: string, v: Pick<LazadaListingView, "skus">, groups: LazOptGroup[], form: LazOptForm, imageUrlOf: (ref: string) => string | null): { xml: string | null; sellerSkus: string[]; errors: string[] } {
  const errors: string[] = [];
  const color = groups.find((g) => g.name === form.colorGroup) ?? null;
  if (!form.adds.length || !color) return { xml: null, sellerSkus: [], errors: form.adds.length ? ["ไม่รู้ว่าชั้นไหนคือสี"] : [] };
  const other = groups.find((g) => g !== color) ?? null;
  const assoc = v.skus.find((x) => s(x.sellerSku))?.sellerSku ?? null;
  if (!assoc) return { xml: null, sellerSkus: [], errors: ["ตัวเลือกเดิมไม่มีรหัส SKU — Lazada ต้องใช้ผูกสีใหม่"] };
  const pkg = v.skus.find((x) => x.weight != null && x.length != null && x.width != null && x.height != null);
  if (!pkg) return { xml: null, sellerSkus: [], errors: ["ตัวเลือกเดิมไม่มีน้ำหนัก/ขนาดกล่อง"] };
  const needImage = v.skus.some((x) => x.images.length > 0) || color.hasImage;
  const sellerSkus: string[] = [];
  const skus = form.adds.flatMap((a) => {
    const name = s(a.name);
    let img = "";
    if (needImage) { const url = a.image ? imageUrlOf(a.image) : null; if (url) img = `<Images><Image>${cdata(url)}</Image></Images>`; else errors.push(`ไม่รู้ลิงก์รูปของสีใหม่ "${name}"`); }
    const rows = other ? (a.sizes ?? []).map((z) => ({ sku: s(z.sku), price: z.price, props: [[color.name, name], [other.name, nameAfter(form, other.name, z.value)]] as [string, string][] }))
      : [{ sku: s(a.code), price: a.price, props: [[color.name, name]] as [string, string][] }];
    return rows.map((r) => {
      sellerSkus.push(r.sku);
      const sp = a.special != null && r.price != null && a.special < r.price ? `<special_price>${a.special}</special_price>` : "";
      return `<Sku><SellerSku>${xmlText(r.sku)}</SellerSku>${salePropXml(r.props)}<quantity>0</quantity><price>${r.price ?? ""}</price>${sp}<package_weight>${pkg.weight}</package_weight><package_length>${pkg.length}</package_length><package_width>${pkg.width}</package_width><package_height>${pkg.height}</package_height><Status>active</Status>${img}</Sku>`;
    });
  }).join("");
  return { xml: `<?xml version="1.0" encoding="UTF-8"?><Request><Product><ItemId>${xmlText(itemId)}</ItemId><AssociatedSku>${xmlText(assoc)}</AssociatedSku>${variationXml(groups, form)}<Attributes></Attributes><Skus>${skus}</Skus></Product></Request>`, sellerSkus, errors: [...new Set(errors)] };
}
