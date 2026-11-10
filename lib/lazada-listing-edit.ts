/**
 * สินค้าบน Lazada ในลิ้นชักสินค้าบนร้าน (ของกลาง · pure) — /master/platform-catalog
 *
 *   ข้อมูลเต็มจาก GET /product/item/get → มุมมองที่ลิ้นชักโชว์ (lazadaListingView)
 *
 * เฟส 1 (2026-11-10) = ดูอย่างเดียว: ชื่อ · แบรนด์ · หมวด · รายละเอียด HTML · จุดเด่น · รูป · ชื่อตัวเลือก (สี/ไซซ์)
 *   · ราคาปกติ/ราคาลด+ช่วงวัน · สต๊อก · สถานะต่อตัวเลือก · น้ำหนัก/ขนาดกล่อง · เหตุผลที่ Lazada ปัดตก
 * เฟสถัดไป (แตะร้านจริง ต้องให้เจ้าของอนุมัติทีละเฟส): แก้ชื่อ/รายละเอียด + เปิดปิดขาย → ราคา → รูป/กล่อง
 *   แผน + กติกา Lazada ที่ต้องระวัง: docs/lazada-connector.md
 *
 * ไม่เก็บข้อมูลเต็มในระบบ (raw.lazada เก็บแค่ย่อ — รูป/HTML บวม) → ลิ้นชักดึงสดทุกครั้งที่เปิด
 * ไฟล์นี้ใช้ได้ทั้งหน้าเว็บและหลังบ้าน — ห้าม import lib/lazada (มีโค้ดเซ็นคำขอ/กุญแจ) · lib/lazada import จากที่นี่แทน
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const str = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

// ชื่อชั้นตัวเลือกที่พบบ่อย (Lazada ส่งเป็นชื่อช่อง เช่น color_family) → ภาษาคน
const SALE_PROP_TH: Record<string, string> = { color_family: "สี", color: "สี", size: "ไซซ์", length: "ความยาว", material: "วัสดุ", style: "แบบ", pattern: "ลาย" };
/**
 * ชื่อตัวเลือกที่ลูกค้าเห็น เช่น "สี: Black · ไซซ์: M" (pure · มี test)
 * saleProp ของ SKU ({color_family: "Black"}) + ป้ายชื่อชั้นจาก variation ของสินค้า (ถ้ามี) · ไม่มี = null (ใช้รหัสแทน)
 * ใช้ทั้งตอนดึงทั้งร้าน (lazProductToCatalogItem เก็บ label ใน raw.lazada) และลิ้นชัก
 */
export function lazSkuLabel(sku: Obj, variation?: unknown): string | null {
  const props = obj(sku.saleProp ?? sku.sale_prop);
  if (!props) return null;
  const labelOf = new Map<string, string>();
  const vars = obj(variation);
  if (vars) {
    for (const v of Object.values(vars)) {
      const o = obj(v);
      const name = str(o?.name); const label = str(o?.label);
      if (name && label) labelOf.set(name, label);
    }
  }
  const parts = Object.entries(props).map(([k, v]) => {
    const val = str(v); if (!val) return null;
    return `${SALE_PROP_TH[k.toLowerCase()] ?? labelOf.get(k) ?? k}: ${val}`;
  }).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Lazada รับรูปได้ไม่เกิน 8 รูป (ทั้งรูปสินค้า และรูปต่อตัวเลือก) */
export const MAX_LAZADA_IMAGES = 8;

/** รายการรูป — Lazada ส่งได้ทั้ง array และ "ข้อความ JSON" · ตัดช่องว่าง (รูปต่อตัวเลือกเติม "" ให้ครบ 8) */
export function lazImageList(v: unknown): string[] {
  let list: unknown = v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("[")) { try { list = JSON.parse(t); } catch { list = []; } }
    else list = t ? [t] : [];
  }
  return (Array.isArray(list) ? list : []).map((u) => str(u)).filter((u): u is string => !!u && /^https?:\/\//i.test(u));
}

export type LazadaSkuView = {
  skuId: string;
  sellerSku: string | null;
  /** ชื่อตัวเลือก เช่น "สี: Black · ไซซ์: M" · ไม่มี = รหัส */
  label: string;
  price: number | null;
  /** ราคาลด (ต่ำกว่าราคาปกติเท่านั้น) */
  specialPrice: number | null;
  /** ช่วงวันของราคาลด (ข้อความจาก Lazada เช่น "2026-11-01 00:00") */
  specialFrom: string | null;
  specialTo: string | null;
  /** สต๊อกรวม / ขายได้ */
  quantity: number | null;
  available: number | null;
  /** active / inactive */
  status: string | null;
  images: string[];
  /** กก. · ซม. */
  weight: number | null; length: number | null; width: number | null; height: number | null;
  /** ลิงก์หน้าสินค้าบน Lazada */
  url: string | null;
  /** ค่าของชั้นตัวเลือกที่มีรูป (ชั้นแรก เช่น สี "Black") — ตัวเลือกสีเดียวกันควรใช้รูปชุดเดียวกัน */
  groupValue: string | null;
};
export type LazadaListingView = {
  itemId: string;
  name: string;
  brand: string | null;
  categoryId: string | null;
  /** HTML */
  description: string;
  /** HTML หัวข้อย่อย (<ul><li>) */
  shortDescription: string;
  images: string[];
  /** Active / InActive / Pending QC / Suspended / Deleted */
  status: string | null;
  subStatus: string | null;
  /** เหตุผลที่ Lazada ปัดตก/ระงับ (ถ้ามี) */
  rejectReasons: string[];
  skus: LazadaSkuView[];
  /** รูปส่งเสริมการขาย (attributes.promotion_square_image 1:1 พื้นขาว · promotion_long_image 3:4) — ไม่มี = null */
  promoSquare: string | null;
  promoLong: string | null;
  /** ชั้นตัวเลือกที่ใส่รูปได้ (Lazada: เฉพาะชั้นแรก และต้องไม่ใช่ไซซ์) · null = ไม่มีข้อมูลชั้นตัวเลือก */
  imageVariation: { name: string; label: string; isSize: boolean } | null;
};

/** วันที่ราคาลด — Lazada ส่งทั้งข้อความวันที่ และเลขมิลลิวินาที → ข้อความสั้น "YYYY-MM-DD HH:mm" (เวลาไทย) */
export function lazDateText(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^\d{12,14}$/.test(s)) {
    const d = new Date(Number(s) + 7 * 3600_000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 16).replace("T", " ");
  }
  return s.slice(0, 16);
}

function rejectReasonsOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : v == null || v === "" ? [] : [v];
  return list.map((x) => {
    const o = obj(x);
    if (!o) return str(x);
    return [str(o.violationDetail ?? o.violation_detail ?? o.reason), str(o.suggestion)].filter(Boolean).join(" — ") || null;
  }).filter((x): x is string => !!x);
}

/** ข้อมูลเต็มจาก /product/item/get → มุมมองในลิ้นชัก · null = ข้อมูลใช้ไม่ได้ (ไม่มี item_id) */
export function lazadaListingView(item: unknown): LazadaListingView | null {
  const p = obj(item);
  const itemId = str(p?.item_id);
  if (!p || !itemId) return null;
  const a = obj(p.attributes) ?? {};
  // ชั้นตัวเลือกแรก (Variation1) = ชั้นเดียวที่ Lazada ให้มีรูป
  const vars = obj(p.variation);
  const v1 = obj(vars?.Variation1 ?? vars?.variation1) ?? (vars ? Object.values(vars).map(obj).find((x) => !!x) ?? null : null);
  const v1Name = str(v1?.name);
  const imageVariation = v1Name ? { name: v1Name, label: str(v1?.label) ?? v1Name, isSize: /size|ไซซ์|ขนาด/i.test(`${v1Name} ${str(v1?.label) ?? ""}`) } : null;
  const skus = (Array.isArray(p.skus) ? p.skus : []).map(obj).filter((s): s is Obj => !!s).map((s, i): LazadaSkuView => {
    const sellerSku = str(s.SellerSku ?? s.seller_sku);
    const price = num(s.price); const sp = num(s.special_price);
    return {
      skuId: str(s.SkuId ?? s.sku_id) ?? `#${i + 1}`,
      sellerSku,
      label: lazSkuLabel(s, p.variation) ?? sellerSku ?? `ตัวเลือก ${i + 1}`,
      price,
      specialPrice: sp != null && sp > 0 && (price == null || sp < price) ? sp : null,
      specialFrom: lazDateText(s.special_from_time ?? s.special_from_date),
      specialTo: lazDateText(s.special_to_time ?? s.special_to_date),
      quantity: num(s.quantity), available: num(s.Available ?? s.available),
      status: str(s.Status ?? s.status)?.toLowerCase() ?? null,
      images: lazImageList(s.Images ?? s.images),
      weight: num(s.package_weight), length: num(s.package_length), width: num(s.package_width), height: num(s.package_height),
      url: str(s.Url ?? s.url),
      groupValue: v1Name ? str(obj(s.saleProp ?? s.sale_prop)?.[v1Name]) : null,
    };
  });
  return {
    itemId,
    name: str(a.name) ?? "",
    brand: str(a.brand),
    categoryId: str(p.primary_category),
    description: String(a.description ?? ""),
    shortDescription: String(a.short_description ?? ""),
    images: lazImageList(p.images),
    status: str(p.status),
    subStatus: str(p.subStatus ?? p.sub_status),
    rejectReasons: rejectReasonsOf(p.rejectReason ?? p.reject_reason),
    skus,
    promoSquare: lazImageList(a.promotion_square_image)[0] ?? null,
    promoLong: lazImageList(a.promotion_long_image)[0] ?? null,
    imageVariation,
  };
}

/** สถานะสินค้าบน Lazada → ป้ายภาษาคน + โทนสี (ใช้ในหัวลิ้นชัก) */
export function lazStatusBadge(status: string | null | undefined): { label: string; tone: "ok" | "off" | "wait" | "bad" | "none" } {
  const s = String(status ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (s === "active") return { label: "เปิดขายอยู่", tone: "ok" };
  if (s === "inactive") return { label: "ปิดขาย", tone: "off" };
  if (s === "pendingqc" || s === "pending") return { label: "รอ Lazada ตรวจ", tone: "wait" };
  if (s === "suspended") return { label: "ถูก Lazada ระงับ", tone: "bad" };
  if (s === "deleted") return { label: "ถูกลบแล้ว", tone: "bad" };
  return { label: status ? String(status) : "ไม่รู้สถานะ", tone: "none" };
}

/** คำตอบของ GET/POST /api/lazada/listing-detail */
export type LazadaListingDetailResponse = { view: LazadaListingView | null; fetched_at: string | null; saved?: boolean; error: string | null };

// ═════════════════════════════ เฟส 2: แก้ชื่อ / รายละเอียด / จุดเด่น + เปิดปิดขาย (แตะร้านจริง) ═════════════════════════════
//
// กติกา Lazada ที่ต้องระวัง (คู่มือ open.lazada.com สำรวจ 2026-11-10 · รายละเอียด docs/lazada-connector.md):
//  - /product/update ต้องมี SkuId ทุก SKU · สถานะ SKU "ค่าเริ่ม = active" → ส่งสถานะเดิมของทุก SKU ไปด้วยเสมอ (ไม่งั้นตัวที่ปิดอยู่อาจเปิดเอง)
//  - ส่ง SKU ครบตามลำดับเดิม (ส่งสลับ = Lazada เรียงตัวเลือกใหม่) · ชื่อ ≤ 255 · รายละเอียด HTML ≤ 25,000 ตัวอักษร รูปต้องเป็นของ Lazada
//  - จุดเด่น = ข้อความล้วนแบบหัวข้อย่อย (<ul><li>) — Lazada ตัดรูป/ลิงก์ทิ้ง
//  - ปิดขาย = /product/deactivate (ทั้งสินค้า หรือระบุ SKU) · ไม่มี API เปิดขาย → /product/update ตั้ง Status active

export const LAZADA_NAME_MAX = 255;
export const LAZADA_DESC_MAX = 25_000;
/** โดเมนรูปของ Lazada (รูปในรายละเอียดต้องอยู่บน Lazada แล้ว — รูปภายนอกโดนปฏิเสธ error 4138) */
const LAZADA_IMG_HOST = /(^|\.)(slatic\.net|lazcdn\.com|alicdn\.com)$/i;

/**
 * ค่าที่แก้ได้ในเฟส 2 + 4 · จุดเด่นเก็บเป็น "บรรทัดละข้อ" (คนทั่วไปแก้ง่ายกว่า HTML)
 * images (เฟส 4) = รูปสินค้าตามลำดับ (รูปแรก = ปก) — ลิงก์ Lazada หรือ "r2:<key>" (รูปจากคลังรูปในระบบ → API ฝากกับ Lazada ก่อนส่ง)
 */
export type LazadaEditState = { name: string; description: string; highlights: string; images: string[]; /** รูปส่งเสริม (เฟส A) */ promoSquare?: string | null; promoLong?: string | null };

const decodeEntities = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** จุดเด่น HTML (<ul><li>…) → บรรทัดละข้อ · ไม่มี <li> = แยกตามขึ้นบรรทัด/<br>/<p> */
export function highlightsToLines(html: string | null | undefined): string {
  const h = String(html ?? "");
  if (!h.trim()) return "";
  const items = /<li\b/i.test(h)
    ? [...h.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1])
    : h.split(/<br\s*\/?>|<\/p>|\n/i);
  return items.map((x) => decodeEntities(x.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}
/** บรรทัดละข้อ → <ul><li>…</li></ul> (ข้อความล้วน ตามกติกา Lazada) */
export function linesToHighlights(lines: string): string {
  const items = String(lines ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  return items.length ? `<ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "";
}

export function lazadaEditStateFromView(v: LazadaListingView): LazadaEditState {
  return { name: v.name, description: v.description, highlights: highlightsToLines(v.shortDescription), images: [...v.images], promoSquare: v.promoSquare, promoLong: v.promoLong };
}

/** รูป "r2:<key>" = จากคลังรูปในระบบ (ชื่อเดียวกับ systemImageRef ของ LINE — lib/line-listing-edit) */
export const lazSystemImageKey = (ref: string | null | undefined): string | null => (ref && ref.startsWith("r2:") ? ref.slice(3) : null);
/** รูปที่ส่งให้ Lazada ได้: ลิงก์ของ Lazada อยู่แล้ว หรือรูปจากระบบ (ฝากก่อนส่ง) */
export function lazImageRefOk(ref: string): boolean {
  if (lazSystemImageKey(ref)) return true;
  try { return LAZADA_IMG_HOST.test(new URL(ref).hostname); } catch { return false; }
}
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
function imageListChange(before: string[], after: string[]): string {
  const added = after.filter((x) => !before.includes(x)).length;
  const removed = before.filter((x) => !after.includes(x)).length;
  const notes = [added ? `เพิ่ม ${added}` : "", removed ? `ลบ ${removed}` : "", after[0] !== before[0] ? "เปลี่ยนปก" : "", !added && !removed && after[0] === before[0] ? "เรียงใหม่" : ""].filter(Boolean);
  return `${after.length} รูป${notes.length ? ` (${notes.join(" · ")})` : ""}`;
}

export type LazadaEditChange = { label: string; before: string; after: string };
export type LazadaEditPlan = {
  /** ช่องที่จะส่ง (เฉพาะที่เปลี่ยน) · shortDescription เป็น HTML แล้ว */
  fields: { name?: string; description?: string; shortDescription?: string; /** เฟส 4: รูปสินค้าทั้งชุดตามลำดับ (ref) */ images?: string[]; /** รูปส่งเสริม 1:1 / 3:4 (ref) */ promoSquare?: string; promoLong?: string };
  changes: LazadaEditChange[];
  errors: string[];
  warnings: string[];
};

const plain =(h: string) => decodeEntities(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const short = (h: string, n = 60) => { const t = plain(h); return t.length > n ? `${t.slice(0, n)}…` : t || "(ว่าง)"; };
const countTag = (h: string, tag: string) => (h.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length;
/** ลิงก์รูปในรายละเอียดที่ไม่ใช่ของ Lazada */
export function foreignDescImages(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).filter((src) => {
    try { return !LAZADA_IMG_HOST.test(new URL(src, "https://x.invalid").hostname); } catch { return true; }
  });
}

/** เทียบฟอร์มกับของบนร้าน → ส่งอะไร / ตรวจไม่ผ่านตรงไหน / ก่อน → หลัง (หน้าเว็บกับ API ใช้ตัวเดียวกัน) */
export function planLazadaEdit(before: LazadaEditState, after: LazadaEditState): LazadaEditPlan {
  const fields: LazadaEditPlan["fields"] = {};
  const changes: LazadaEditChange[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = after.name.replace(/\s+/g, " ").trim();
  if (name !== before.name.replace(/\s+/g, " ").trim()) {
    if (!name) errors.push("ชื่อสินค้าห้ามว่าง");
    else if (name.length > LAZADA_NAME_MAX) errors.push(`ชื่อสินค้ายาวเกิน ${LAZADA_NAME_MAX} ตัวอักษร (ตอนนี้ ${name.length})`);
    else { fields.name = name; changes.push({ label: "ชื่อ", before: before.name || "(ว่าง)", after: name }); }
  }

  if (after.description !== before.description) {
    const foreign = foreignDescImages(after.description);
    if (!plain(after.description) && countTag(after.description, "img") === 0) errors.push("รายละเอียดสินค้าห้ามว่าง");
    else if (after.description.length > LAZADA_DESC_MAX) errors.push(`รายละเอียดยาวเกิน ${LAZADA_DESC_MAX.toLocaleString()} ตัวอักษร (ตอนนี้ ${after.description.length.toLocaleString()})`);
    else if (foreign.length) errors.push(`รูปในรายละเอียดต้องเป็นรูปที่อยู่บน Lazada แล้ว — มีรูปจากที่อื่น ${foreign.length} รูป (เพิ่มรูปใหม่ได้ในเฟสรูป)`);
    else {
      fields.description = after.description;
      changes.push({ label: "รายละเอียด", before: short(before.description), after: short(after.description) });
      const bi = countTag(before.description, "img"), ai = countTag(after.description, "img");
      if (ai < bi) warnings.push(`รูปในรายละเอียดลดลง ${bi} → ${ai} รูป — ตรวจว่าตั้งใจลบไหม`);
      const bt = countTag(before.description, "table"), at = countTag(after.description, "table");
      if (at < bt) warnings.push(`ตารางในรายละเอียดหายไป ${bt - at} ตาราง (กล่องแก้ของระบบอาจไม่รองรับตารางแบบเดิม) — ตรวจก่อนส่ง`);
      // กล่องแก้จัดรูป HTML ใหม่เองได้ แม้คนไม่ได้พิมพ์อะไร → บอกให้รู้ จะได้ยกเลิกถ้าไม่ได้ตั้งใจ
      if (plain(before.description) === plain(after.description) && ai === bi) warnings.push("ข้อความรายละเอียดเหมือนเดิม (เปลี่ยนแค่รูปแบบ) — ถ้าไม่ได้ตั้งใจแก้รายละเอียด กด \"ยกเลิกที่แก้\"");
    }
  }

  const bl = before.highlights.split("\n").map((x) => x.trim()).filter(Boolean);
  const al = after.highlights.split("\n").map((x) => x.trim()).filter(Boolean);
  if (bl.join("\n") !== al.join("\n")) {
    if (!al.length) errors.push("ล้างจุดเด่นทั้งหมดยังไม่รองรับ — ต้องเหลืออย่างน้อย 1 ข้อ");
    else {
      fields.shortDescription = linesToHighlights(al.join("\n"));
      changes.push({ label: "จุดเด่นสินค้า", before: bl.length ? `${bl.length} ข้อ: ${short(bl.join(" · "), 50)}` : "(ไม่มี)", after: `${al.length} ข้อ: ${short(al.join(" · "), 50)}` });
      if (/https?:\/\/|www\./i.test(al.join(" "))) warnings.push("จุดเด่นมีลิงก์ — Lazada จะตัดลิงก์ทิ้ง");
    }
  }
  // เฟส 4: รูปสินค้า — ส่งทั้งชุดตามลำดับ (รูปแรก = ปก) · 1–8 รูป
  const bImgs = before.images ?? []; const aImgs = after.images ?? bImgs;
  if (!sameList(aImgs, bImgs)) {
    const bad = aImgs.filter((r) => !lazImageRefOk(r));
    if (aImgs.length < 1) errors.push("ต้องมีรูปสินค้าอย่างน้อย 1 รูป");
    else if (aImgs.length > MAX_LAZADA_IMAGES) errors.push(`Lazada รับรูปสินค้าได้ไม่เกิน ${MAX_LAZADA_IMAGES} รูป`);
    else if (bad.length) errors.push(`รูปต้องเป็นรูปบน Lazada หรือรูปจากคลังรูปในระบบ (${bad.length} รูปใช้ไม่ได้)`);
    else {
      fields.images = [...aImgs];
      changes.push({ label: "รูปสินค้า", before: `${bImgs.length} รูป`, after: imageListChange(bImgs, aImgs) });
      // ลบรูป: คู่มือ Lazada บอก "แทนได้ ลบไม่ได้" แต่ทดสอบจริง 2026-11-10 (LB-01 5→4) ส่งชุดที่สั้นลง = ลบได้ → ไม่เตือนแล้ว (route ยังเทียบจำนวน/ลำดับหลังส่ง)
      if (aImgs.some((r) => lazSystemImageKey(r))) warnings.push("รูปจากคลังรูปในระบบจะถูกฝากกับ Lazada ก่อน (แปลงเป็น JPG สี่เหลี่ยมจัตุรัสพื้นขาว 1500px) — รูปไหนไม่ผ่านกติกา Lazada ระบบจะหยุดและบอก");
    }
  }
  // เฟส A: รูปส่งเสริมการขาย — 1 รูปต่อชนิด · ต้องเป็นรูปบน Lazada หรือรูปจากระบบ (ฝาก + ทำสัดส่วนให้) · ล้างยังไม่รองรับ
  for (const [k, label, ratio] of [["promoSquare", "รูปส่งเสริม (จัตุรัส 1:1)", "1:1"], ["promoLong", "รูปส่งเสริม (แนวตั้ง 3:4)", "3:4"]] as const) {
    const b = before[k] ?? null; const a = after[k] === undefined ? b : after[k] ?? null;
    if (a === b) continue;
    if (!a) { errors.push(`ล้าง${label}ยังไม่รองรับ — เลือกรูปใหม่แทน หรือแก้ใน Seller Center`); continue; }
    if (!lazImageRefOk(a)) { errors.push(`${label}: ต้องเป็นรูปบน Lazada หรือรูปจากคลังรูปในระบบ`); continue; }
    fields[k] = a;
    changes.push({ label, before: b ? "มีรูป" : "ไม่มี", after: "รูปใหม่" });
    if (!lazSystemImageKey(a)) warnings.push(`${label}: ใช้รูปที่อยู่บน Lazada ตรง ๆ — ถ้าสัดส่วนไม่ใช่ ${ratio} Lazada จะทิ้งเงียบ ๆ (ระบบดึงกลับมาเช็กให้) · รูปจากระบบจะถูกทำเป็น ${ratio} พื้นขาวให้`);
  }
  if (fields.promoSquare || fields.promoLong) warnings.push("รูปส่งเสริมต้องเป็นสินค้าบนพื้นขาว ไม่มีตัวหนังสือ/กรอบ — ระบบเติมขอบขาวให้ได้สัดส่วน แต่ไม่ได้ลบพื้นหลังเดิม");
  if (Object.keys(fields).length) warnings.push("Lazada อาจส่งสินค้าไปตรวจใหม่ (ไม่เกิน 24 ชม.) หลังแก้ข้อมูล — ช่วงแคมเปญใหญ่ควรเลี่ยง");
  return { fields, changes, errors, warnings };
}

// ═════════════════════════════ เฟส 4: รูปตัวเลือก + น้ำหนัก/ขนาดกล่อง (แตะร้านจริง) ═════════════════════════════
//  - รูปตัวเลือก: คู่มือ Lazada — "มีครบทุกตัวหรือไม่มีเลย" → แก้ตัวไหนก็ส่งรูปของทุกตัว และทุกตัวต้องมีรูป ≥ 1
//  - กล่อง: package_weight (กก.) · package_length/width/height (ซม.) ทศนิยม 2 ตำแหน่ง
export const LAZADA_PKG_MAX = { weight: 300, side: 300 };

export type LazadaSkuMediaRow = {
  skuId: string; sellerSku: string | null; label: string;
  /** รูปของตัวเลือก (ลิงก์ Lazada หรือ "r2:<key>") — ในระบบแก้ได้แค่ "รูปแรก" ที่เหลือคงเดิม */
  images: string[];
  weight: number | null; length: number | null; width: number | null; height: number | null;
};
export function lazadaSkuMediaFromView(v: LazadaListingView): LazadaSkuMediaRow[] {
  return v.skus.map((s) => ({ skuId: s.skuId, sellerSku: s.sellerSku, label: s.label, images: [...s.images], weight: s.weight, length: s.length, width: s.width, height: s.height }));
}
export type LazSkuExtra = { images?: string[]; weight?: number; length?: number; width?: number; height?: number };
export type LazadaSkuMediaPlan = {
  /** ส่วนที่จะส่งต่อ SKU (รวม "รูปของทุกตัว" เมื่อมีตัวไหนเปลี่ยนรูป) */
  extras: Map<string, LazSkuExtra>;
  changes: LazadaEditChange[];
  errors: string[];
  warnings: string[];
};
const PKG_LABEL: Record<"weight" | "length" | "width" | "height", string> = { weight: "น้ำหนัก (กก.)", length: "ยาว (ซม.)", width: "กว้าง (ซม.)", height: "สูง (ซม.)" };

/** เทียบรูปตัวเลือก/กล่องในฟอร์มกับของบนร้าน → ส่งอะไร / ตรวจไม่ผ่าน / ก่อน → หลัง (หน้าเว็บกับ API ใช้ตัวเดียวกัน) */
export function planLazadaSkuMedia(before: LazadaSkuMediaRow[], after: LazadaSkuMediaRow[], imageVariation?: { label: string; isSize: boolean } | null): LazadaSkuMediaPlan {
  const extras = new Map<string, LazSkuExtra>(); const changes: LazadaEditChange[] = []; const errors: string[] = []; const warnings: string[] = [];
  const byId = new Map(before.map((b) => [b.skuId, b]));
  let imgChanged = false;
  for (const a of after) {
    const b = byId.get(a.skuId); if (!b) continue;
    const ex: LazSkuExtra = {}; const was: string[] = []; const now: string[] = [];
    if (!sameList(a.images, b.images)) {
      imgChanged = true;
      if (a.images.length > MAX_LAZADA_IMAGES) errors.push(`${a.label}: รูปตัวเลือกได้ไม่เกิน ${MAX_LAZADA_IMAGES} รูป`);
      else if (a.images.some((r) => !lazImageRefOk(r))) errors.push(`${a.label}: รูปต้องเป็นรูปบน Lazada หรือรูปจากคลังรูปในระบบ`);
      else { was.push(b.images.length ? "รูปเดิม" : "ไม่มีรูป"); now.push("รูปใหม่"); }
    }
    for (const k of ["weight", "length", "width", "height"] as const) {
      if (a[k] === b[k]) continue;
      const v = a[k]; const max = k === "weight" ? LAZADA_PKG_MAX.weight : LAZADA_PKG_MAX.side;
      if (v == null || !(v > 0)) { errors.push(`${a.label}: ${PKG_LABEL[k]} ต้องมากกว่า 0`); continue; }
      if (v > max) { errors.push(`${a.label}: ${PKG_LABEL[k]} เกิน ${max}`); continue; }
      ex[k] = r2(v); was.push(`${PKG_LABEL[k]} ${b[k] ?? "—"}`); now.push(`${PKG_LABEL[k]} ${r2(v)}`);
    }
    if (was.length) changes.push({ label: `ตัวเลือก ${a.label}`, before: was.join(" · "), after: now.join(" · ") });
    if (Object.keys(ex).length) extras.set(a.skuId, ex);
  }
  if (imgChanged && imageVariation?.isSize) errors.push(`Lazada ไม่ให้ใส่รูปตามชั้น "${imageVariation.label}" (ไซซ์) — รูปตัวเลือกใส่ได้เฉพาะชั้นแรกที่ไม่ใช่ไซซ์ เช่น สี`);
  else if (imgChanged) {
    // รูปตัวเลือกต้องครบทุกตัว → ส่งรูปของทุกตัว (ตัวที่ไม่ได้แก้ = รูปเดิม)
    const missing = after.filter((a) => a.images.length === 0);
    if (missing.length) errors.push(`Lazada ให้รูปตัวเลือกมีครบทุกตัว — ยังไม่มีรูป ${missing.length} ตัว: ${missing.slice(0, 4).map((m) => m.label).join(", ")}${missing.length > 4 ? " …" : ""}`);
    else for (const a of after) extras.set(a.skuId, { ...(extras.get(a.skuId) ?? {}), images: [...a.images] });
  }
  return { extras, changes, errors, warnings };
}

/** ใช้รูปชุดนี้กับทุกตัวเลือกที่ค่าชั้นแรกเดียวกัน (เช่น สีดำทุกไซซ์) — groupOf = skuId → ค่าชั้นแรก (pure · มี test) */
export function lazApplyImagesToGroup(rows: LazadaSkuMediaRow[], skuId: string, images: string[], groupOf: Map<string, string | null>): { rows: LazadaSkuMediaRow[]; count: number } {
  const g = groupOf.get(skuId) ?? null;
  let count = 0;
  const next = rows.map((r) => {
    const same = r.skuId === skuId || (g != null && groupOf.get(r.skuId) === g);
    if (!same) return r;
    count++;
    return { ...r, images: [...images] };
  });
  return { rows: next, count };
}

/** /image/migrate (payload) — ฝากรูปจากลิงก์ภายนอกให้ Lazada · ลิงก์มี & → CDATA (คู่มือ) */
export function lazMigrateImageXml(url: string): string {
  return `<?xml version="1.0" encoding="UTF-8" ?><Request><Image><Url>${cdata(url)}</Url></Image></Request>`;
}
/** แทน ref "r2:<key>" ด้วยลิงก์ Lazada ที่ฝากแล้ว (ไม่เจอ = คงเดิม → ผู้เรียกต้องฝากให้ครบก่อน) */
export const lazResolveRefs = (refs: string[], migrated: Map<string, string>): string[] => refs.map((r) => migrated.get(r) ?? r);

// ───────── ประกอบคำขอ XML (pure · มี test) ─────────
const xmlText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** HTML ใส่ใน CDATA — แตก "]]>" กัน CDATA ปิดก่อน */
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
export type LazSkuRef = { skuId: string; sellerSku: string | null; status: string | null };

/**
 * /product/update (payload) — แก้ข้อมูลสินค้า และ/หรือ สถานะ SKU
 * ส่ง SKU ครบตามลำดับเดิม พร้อม "สถานะ" ทุกตัว (statusOverride = ตัวที่จะเปลี่ยน · ที่เหลือ = สถานะเดิม)
 */
export function lazUpdateProductXml(itemId: string, skus: LazSkuRef[], fields: LazadaEditPlan["fields"], statusOverride?: Map<string, "active" | "inactive">, skuExtras?: Map<string, LazSkuExtra>): string {
  const attrs = [
    fields.name != null ? `<name>${xmlText(fields.name)}</name>` : "",
    fields.description != null ? `<description>${cdata(fields.description)}</description>` : "",
    fields.shortDescription != null ? `<short_description>${cdata(fields.shortDescription)}</short_description>` : "",
    // รูปส่งเสริม: คู่มือเขียนเป็น JSON array (≤ 1 รูป) แต่ไม่บอกรูปแบบ XML → ส่งลิงก์เดียว · route ดึงกลับเช็กว่าติดจริง
    fields.promoSquare != null ? `<promotion_square_image>${cdata(fields.promoSquare)}</promotion_square_image>` : "",
    fields.promoLong != null ? `<promotion_long_image>${cdata(fields.promoLong)}</promotion_long_image>` : "",
  ].join("");
  const imgs = (list: string[]) => `<Images>${list.map((u) => `<Image>${cdata(u)}</Image>`).join("")}</Images>`;
  // รูปสินค้า (เฟส 4) อยู่นอก Skus · ต้องเป็นลิงก์ Lazada แล้ว (ผู้เรียกฝากรูป r2: ก่อน)
  const productImages = fields.images && fields.images.length ? imgs(fields.images) : "";
  const skuXml = skus.map((s) => {
    const st = statusOverride?.get(s.skuId) ?? (s.status === "inactive" ? "inactive" : "active");
    const ex = skuExtras?.get(s.skuId);
    const extra = ex ? [
      ex.images && ex.images.length ? imgs(ex.images) : "",
      ex.weight != null ? `<package_weight>${ex.weight}</package_weight>` : "",
      ex.length != null ? `<package_length>${ex.length}</package_length>` : "",
      ex.width != null ? `<package_width>${ex.width}</package_width>` : "",
      ex.height != null ? `<package_height>${ex.height}</package_height>` : "",
    ].join("") : "";
    return `<Sku><SkuId>${xmlText(s.skuId)}</SkuId>${s.sellerSku ? `<SellerSku>${xmlText(s.sellerSku)}</SellerSku>` : ""}<Status>${st}</Status>${extra}</Sku>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Request><Product><ItemId>${xmlText(itemId)}</ItemId>${productImages}<Attributes>${attrs}</Attributes><Skus>${skuXml}</Skus></Product></Request>`;
}
/** /product/deactivate (apiRequestBody) — ไม่ระบุ SKU = ปิดทั้งสินค้า */
export function lazDeactivateXml(itemId: string, skuIds?: string[]): string {
  const skus = skuIds && skuIds.length ? `<Skus>${skuIds.map((id) => `<SkuId>${xmlText(id)}</SkuId>`).join("")}</Skus>` : "";
  return `<Request><Product><ItemId>${xmlText(itemId)}</ItemId>${skus}</Product></Request>`;
}

// ───────── เปิด / ปิดขาย ─────────
export type LazadaDisplayAction = { open: boolean; /** ว่าง/ไม่ส่ง = ทั้งสินค้า */ skuIds?: string[] };
export type LazadaDisplayPlan = {
  /** deactivate = ปิด · update = เปิด (ตั้ง Status active) · none = ไม่มีอะไรต้องทำ */
  api: "deactivate" | "update" | "none";
  /** ทั้งสินค้า (ปิด) — ไม่ระบุ SKU ใน deactivate */
  wholeItem: boolean;
  /** SKU ที่จะเปลี่ยนจริง (ข้ามตัวที่อยู่สถานะนั้นแล้ว) */
  targets: LazadaSkuView[];
  statusOverride: Map<string, "active" | "inactive">;
  summary: string;
  errors: string[];
};
// ═════════════════════════════ เฟส 3: ราคา / ราคาลด ต่อตัวเลือก (แตะร้านจริง) ═════════════════════════════
//  - /product/price_quantity/update ครั้งละ ≤ 50 SKU (แนะนำ 20) · ไม่ส่ง Quantity (สต๊อก = BigSeller ซิงค์อยู่)
//  - ราคาขยับ ≥ 80% = Lazada ส่งไปตรวจใหม่ (คู่มือรุ่นเก่า) → ไม่ยอมส่ง · ≥ 50% = เตือน
//  - ราคาลดต้องต่ำกว่าราคาปกติ + มีช่วงวัน · ล้างราคาลดยังไม่รองรับ (ไม่รู้วิธีที่ Lazada รับแน่นอน)

export const LAZADA_PRICE_BATCH = 20;
const PRICE_JUMP_BLOCK = 0.8;
const PRICE_JUMP_WARN = 0.5;

/** ราคา 1 ตัวเลือกในฟอร์ม · from/to = "YYYY-MM-DD" (DateInput) · fromRaw/toRaw = ค่าเดิมเต็มจาก Lazada (กันเวลาเดิมหาย) */
export type LazadaPriceRow = {
  skuId: string; sellerSku: string | null; label: string;
  price: number | null; special: number | null;
  from: string | null; to: string | null;
  fromRaw?: string | null; toRaw?: string | null;
};
export function lazadaPriceRowsFromView(v: LazadaListingView): LazadaPriceRow[] {
  return v.skus.map((s) => ({
    skuId: s.skuId, sellerSku: s.sellerSku, label: s.label, price: s.price, special: s.specialPrice,
    from: s.specialFrom ? s.specialFrom.slice(0, 10) : null, to: s.specialTo ? s.specialTo.slice(0, 10) : null,
    fromRaw: s.specialFrom, toRaw: s.specialTo,
  }));
}

/**
 * วันที่ราคาลดที่ส่งให้ Lazada — "YYYY-MM-DD HH:mm" (เวลาไทย · รูปแบบเดียวกับ special_from_time ที่ Lazada ส่งมา)
 * คู่มือรุ่นเก่า: รับเวลาเป็นช่วง 15 นาที · ตัวอย่างปัจจุบันใช้แค่วันที่ — ส่งเวลาด้วยกันวันสุดท้ายหาย
 * วันเดิมไม่เปลี่ยน = ใช้เวลาเดิม · วันใหม่ = เริ่ม 00:00 / สิ้นสุด 23:59
 */
export function lazSaleDateText(dateIso: string, kind: "from" | "to", raw?: string | null): string {
  const r = (raw ?? "").trim();
  if (r && r.slice(0, 10) === dateIso && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(r)) return r.slice(0, 16);
  return `${dateIso} ${kind === "to" ? "23:59" : "00:00"}`;
}

export type LazPriceSku = { skuId: string; sellerSku: string | null; price?: number; salePrice?: number; saleStart?: string; saleEnd?: string };
export type LazadaPricePlan = { skus: LazPriceSku[]; changes: LazadaEditChange[]; errors: string[]; warnings: string[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const jump = (a: number, b: number) => (a > 0 ? Math.abs(b - a) / a : 0);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const todayTh = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** เทียบราคาในฟอร์มกับของบนร้าน → ส่งอะไร (เฉพาะตัว+ช่องที่เปลี่ยน) / ตรวจไม่ผ่าน / ก่อน → หลัง (หน้าเว็บกับ API ใช้ตัวเดียวกัน) */
export function planLazadaPrices(before: LazadaPriceRow[], after: LazadaPriceRow[], today = todayTh()): LazadaPricePlan {
  const skus: LazPriceSku[] = []; const changes: LazadaEditChange[] = []; const errors: string[] = []; const warnings: string[] = [];
  const byId = new Map(before.map((b) => [b.skuId, b]));
  for (const a of after) {
    const b = byId.get(a.skuId);
    if (!b) continue;
    const priceChanged = a.price !== b.price;
    const specialChanged = a.special !== b.special;
    const datesChanged = a.special != null && (a.from !== b.from || a.to !== b.to);
    if (!priceChanged && !specialChanged && !datesChanged) continue;
    const name = a.label;
    const out: LazPriceSku = { skuId: a.skuId, sellerSku: a.sellerSku };
    let bad = false;
    const price = a.price;
    if (priceChanged) {
      if (price == null || !(price > 0)) { errors.push(`${name}: ราคาปกติต้องมากกว่า 0`); bad = true; }
      else if (b.price != null && b.price > 0 && jump(b.price, price) >= PRICE_JUMP_BLOCK) { errors.push(`${name}: ราคาปกติขยับ ${pct(jump(b.price, price))} (${b.price}→${price}) — ตั้งแต่ 80% Lazada จะส่งไปตรวจใหม่ แก้ทีละขั้นหรือแก้ใน Seller Center`); bad = true; }
      else { out.price = r2(price); if (b.price != null && jump(b.price, price) >= PRICE_JUMP_WARN) warnings.push(`${name}: ราคาปกติขยับ ${pct(jump(b.price, price))}`); }
    }
    if (specialChanged || datesChanged) {
      const sp = a.special;
      if (sp == null) { errors.push(`${name}: ล้างราคาลดยังไม่รองรับ — แก้ใน Lazada Seller Center`); bad = true; }
      else if (!(sp > 0)) { errors.push(`${name}: ราคาลดต้องมากกว่า 0`); bad = true; }
      else if (price != null && sp >= price) { errors.push(`${name}: ราคาลด (${sp}) ต้องต่ำกว่าราคาปกติ (${price})`); bad = true; }
      else if (price != null && price > 0 && 1 - sp / price >= PRICE_JUMP_BLOCK) { errors.push(`${name}: ลด ${pct(1 - sp / price)} จากราคาปกติ — ตั้งแต่ 80% เสี่ยงโดน Lazada ตรวจ/ปัดตก`); bad = true; }
      else if (b.special != null && b.special > 0 && jump(b.special, sp) >= PRICE_JUMP_BLOCK) { errors.push(`${name}: ราคาลดขยับ ${pct(jump(b.special, sp))} (${b.special}→${sp}) — ตั้งแต่ 80% Lazada จะส่งไปตรวจใหม่`); bad = true; }
      // ช่วงวันไม่บังคับ: ว่างทั้งคู่ = ไม่มีกำหนด (Lazada: ราคาลดไม่มีวัน = ใช้ตลอด) · มีแต่วันเริ่ม = ไม่มีวันสิ้นสุด · มีแต่วันสิ้นสุด = เริ่มวันนี้
      else if (a.from && a.to && a.to < a.from) { errors.push(`${name}: วันสิ้นสุดราคาลดต้องไม่ก่อนวันเริ่ม`); bad = true; }
      else if (a.to && a.to < today) { errors.push(`${name}: วันสิ้นสุดราคาลด (${a.to}) ผ่านไปแล้ว`); bad = true; }
      else {
        out.salePrice = r2(sp);
        // ตัวอย่างทางการส่ง Price คู่ SalePrice เสมอ → แนบราคาปกติ (ค่าปัจจุบัน/ใหม่) ไปด้วย
        if (out.price == null && price != null && price > 0) out.price = r2(price);
        const from = a.from ?? (a.to ? today : null);
        out.saleStart = from ? lazSaleDateText(from, "from", from === b.from ? b.fromRaw : null) : "";
        out.saleEnd = a.to ? lazSaleDateText(a.to, "to", a.to === b.to ? b.toRaw : null) : "";
        if (b.special != null && jump(b.special, sp) >= PRICE_JUMP_WARN) warnings.push(`${name}: ราคาลดขยับ ${pct(jump(b.special, sp))}`);
        if ((b.from || b.to) && !a.from && !a.to) warnings.push(`${name}: เปลี่ยนราคาลดเป็น "ไม่มีกำหนด" (ล้างวันเดิม) — ถ้าหลังส่งยังเห็นวันเดิม ให้แก้วันใน Seller Center`);
      }
    } else if (priceChanged && b.special != null && price != null && b.special >= price) {
      errors.push(`${name}: ราคาปกติใหม่ (${price}) ต่ำกว่า/เท่าราคาลดเดิม (${b.special}) — แก้ราคาลดด้วย`); bad = true;
    }
    const fmt = (p: number | null, s: number | null, f: string | null, t: string | null) => `${p ?? "—"}฿${s != null ? ` → ลด ${s}฿ (${f || t ? `${f ?? "วันนี้"}–${t ?? "ไม่มีกำหนด"}` : "ไม่มีกำหนด"})` : ""}`;
    changes.push({ label: `ราคา ${name}`, before: fmt(b.price, b.special, b.from, b.to), after: fmt(a.price, a.special, a.special != null ? a.from : null, a.special != null ? a.to : null) });
    if (!bad && (out.price != null || out.salePrice != null)) skus.push(out);
  }
  return { skus, changes, errors, warnings };
}

/**
 * /product/price_quantity/update (payload) 1 ชุด — ไม่มี Quantity เสมอ (สต๊อก = ระบบอื่นดูแล)
 * ราคาลดส่งแท็กวันคู่เสมอ — ว่าง = ไม่มีกำหนด (ตัวอย่างในคู่มือรุ่นเก่าก็ส่ง SalePrice กับแท็กวันว่าง)
 */
export function lazPriceQuantityXml(itemId: string, skus: LazPriceSku[]): string {
  const rows = skus.map((s) => [
    "<Sku>", `<ItemId>${xmlText(itemId)}</ItemId>`, `<SkuId>${xmlText(s.skuId)}</SkuId>`, s.sellerSku ? `<SellerSku>${xmlText(s.sellerSku)}</SellerSku>` : "",
    s.price != null ? `<Price>${s.price}</Price>` : "",
    s.salePrice != null ? `<SalePrice>${s.salePrice}</SalePrice><SaleStartDate>${xmlText(s.saleStart ?? "")}</SaleStartDate><SaleEndDate>${xmlText(s.saleEnd ?? "")}</SaleEndDate>` : "",
    "</Sku>",
  ].join("")).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Request><Product><Skus>${rows}</Skus></Product></Request>`;
}

/**
 * แก้ราคาหลายตัวเลือกพร้อมกัน (แถบในแท็บราคา) — เติมฟอร์มอย่างเดียว ยังไม่ส่ง
 * ids ว่าง = ทุกตัว · ช่องที่ไม่กรอก = ไม่เปลี่ยน · ลด % = ราคาลดจากราคาปกติ (ปัดเป็นบาทเต็ม) · ช่วงวันใส่ให้ทุกตัวที่มีราคาลด
 * noEnd = ราคาลด "ไม่มีกำหนด" (ล้างวันทุกตัวที่มีราคาลด)
 */
export function applyLazadaBulkPrice(rows: LazadaPriceRow[], ids: Set<string> | null, opt: { price?: number | null; special?: number | null; pct?: number | null; from?: string | null; to?: string | null; noEnd?: boolean }): { rows: LazadaPriceRow[]; changed: number; error: string | null } {
  const { price = null, special = null, pct: dp = null, from = null, to = null, noEnd = false } = opt;
  if (price == null && special == null && dp == null && !from && !to && !noEnd) return { rows, changed: 0, error: "กรอกราคาปกติ ราคาลด % ส่วนลด ช่วงวัน หรือติ๊กไม่มีกำหนด" };
  if (price != null && !(price > 0)) return { rows, changed: 0, error: "ราคาปกติต้องมากกว่า 0" };
  if (special != null && !(special > 0)) return { rows, changed: 0, error: "ราคาลดต้องมากกว่า 0" };
  if (special == null && dp != null && !(dp > 0 && dp < 100)) return { rows, changed: 0, error: "% ส่วนลดต้องอยู่ระหว่าง 1–99" };
  if (from && to && to < from) return { rows, changed: 0, error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" };
  const all = !ids || ids.size === 0;
  let changed = 0;
  const next = rows.map((r) => {
    if (!all && !ids!.has(r.skuId)) return r;
    const p = price ?? r.price;
    const sp = special != null ? special : dp != null && p != null ? Math.round(p * (1 - dp / 100)) : r.special;
    const f = sp != null ? (noEnd ? null : (from || r.from)) : r.from;
    const t = sp != null ? (noEnd ? null : (to || r.to)) : r.to;
    if (p === r.price && sp === r.special && f === r.from && t === r.to) return r;
    changed++;
    return { ...r, price: p, special: sp, from: f, to: t };
  });
  return { rows: next, changed, error: null };
}

/**
 * ส่งสำเร็จแต่ดึงกลับมาเช็กไม่ได้ (Lazada ตอบช้า/จำกัดความถี่) → มุมมองตามที่สั่งไว้ (ไม่โชว์ของเก่าให้คนเข้าใจผิดว่าไม่สำเร็จ)
 * ใช้คู่กับคำเตือนให้กด "ดึงตัวนี้จาก Lazada" ยืนยันภายหลังเสมอ (pure · มี test)
 */
export function lazViewAfterWrite(view: LazadaListingView, w: { fields?: LazadaEditPlan["fields"]; statusOverride?: Map<string, "active" | "inactive">; prices?: LazPriceSku[]; skuExtras?: Map<string, LazSkuExtra> }): LazadaListingView {
  const f = w.fields ?? {};
  const priceOf = new Map((w.prices ?? []).map((p) => [p.skuId, p]));
  let skus = w.statusOverride && w.statusOverride.size ? view.skus.map((s) => (w.statusOverride!.has(s.skuId) ? { ...s, status: w.statusOverride!.get(s.skuId)! } : s)) : view.skus;
  if (w.skuExtras && w.skuExtras.size) skus = skus.map((s) => {
    const e = w.skuExtras!.get(s.skuId); if (!e) return s;
    return { ...s, images: e.images ?? s.images, weight: e.weight ?? s.weight, length: e.length ?? s.length, width: e.width ?? s.width, height: e.height ?? s.height };
  });
  if (priceOf.size) skus = skus.map((s) => {
    const p = priceOf.get(s.skuId); if (!p) return s;
    return { ...s, price: p.price ?? s.price, ...(p.salePrice != null ? { specialPrice: p.salePrice, specialFrom: p.saleStart ? p.saleStart.slice(0, 16) : null, specialTo: p.saleEnd ? p.saleEnd.slice(0, 16) : null } : {}) };
  });
  const anyOpen = skus.some((s) => s.status !== "inactive");
  return {
    ...view,
    name: f.name ?? view.name, description: f.description ?? view.description, shortDescription: f.shortDescription ?? view.shortDescription,
    images: f.images ?? view.images,
    promoSquare: f.promoSquare ?? view.promoSquare, promoLong: f.promoLong ?? view.promoLong,
    skus, status: w.statusOverride && w.statusOverride.size ? (anyOpen ? "Active" : "InActive") : view.status,
  };
}
/** สำเนาย่อในระบบ (raw.lazada) แบบเดียวกัน — สถานะ SKU ตามที่สั่ง + สถานะสินค้า (เปิดอยู่ ≥ 1 ตัว = active) */
export function lazRawAfterStatus(rawLazada: unknown, statusOverride: Map<string, "active" | "inactive">): { lazada: Obj; status: "active" | "inactive" } {
  const l = { ...(obj(rawLazada) ?? {}) };
  const skus = (Array.isArray(l.skus) ? l.skus : []).map((s) => {
    const o = obj(s); if (!o) return s;
    const id = str(o.sku_id ?? o.SkuId);
    return id && statusOverride.has(id) ? { ...o, status: statusOverride.get(id) } : o;
  });
  const status = skus.some((s) => str(obj(s)?.status) !== "inactive") ? "active" : "inactive";
  return { lazada: { ...l, skus, status: status === "active" ? "Active" : "InActive" }, status };
}

/** คำตอบของ POST /api/lazada/listing-edit และ /listing-display */
export type LazadaWriteResponse = {
  ok: boolean;
  /** ข้อมูลล่าสุดหลังส่ง (ดึงจาก Lazada ใหม่) — null = ดึงไม่ได้ */
  view: LazadaListingView | null;
  changes?: LazadaEditChange[];
  summary?: string;
  /** Lazada ส่งไปรอตรวจ (Pending QC) */
  qc?: boolean;
  warnings?: string[];
  error: string | null;
};

export function planLazadaDisplay(view: LazadaListingView, action: LazadaDisplayAction): LazadaDisplayPlan {
  const ids = new Set((action.skuIds ?? []).map(String));
  const whole = ids.size === 0;
  const unknown = [...ids].filter((id) => !view.skus.some((s) => s.skuId === id));
  const errors = unknown.length ? [`ไม่พบตัวเลือก ${unknown.join(", ")} บน Lazada (อาจถูกลบ/เปลี่ยนแล้ว — โหลดใหม่)`] : [];
  const scope = whole ? view.skus : view.skus.filter((s) => ids.has(s.skuId));
  const want = action.open ? "active" : "inactive";
  const targets = scope.filter((s) => (s.status === "inactive" ? "inactive" : "active") !== want);
  const statusOverride = new Map(targets.map((s) => [s.skuId, want] as [string, "active" | "inactive"]));
  const verb = action.open ? "เปิดขาย" : "ปิดขาย";
  const api = errors.length || targets.length === 0 ? "none" : action.open ? "update" : "deactivate";
  const summary = targets.length === 0
    ? `${whole ? "ทุกตัวเลือก" : "ตัวเลือกที่เลือก"}${action.open ? "เปิดขาย" : "ปิดขาย"}อยู่แล้ว`
    : whole && targets.length === view.skus.length ? `${verb}ทั้งสินค้า (${targets.length} ตัวเลือก)` : `${verb} ${targets.length} ตัวเลือก`;
  // ปิดทั้งสินค้าเมื่อเลือกทั้งหมด → deactivate ระดับสินค้า (ไม่ต้องระบุ SKU)
  return { api, wholeItem: !action.open && whole, targets, statusOverride, summary, errors };
}
