/**
 * "ร้านที่ลงขายแล้ว ตรงกับระบบไหม" — กติกาเทียบ (pure · ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์) — ของกลาง
 * เจ้าของขอ 2026-11-21: "ถ้าเราเปลี่ยนรูป แก้รายละเอียด แก้สี แก้ราคา แล้วมีร้านที่ไม่ตรง เช็คได้ไหม + มีปุ่มกดเปลี่ยนให้เลย"
 *
 * ค่าฝั่งระบบ = "ที่ระบบจะส่งถ้าลงร้านนี้วันนี้" (ตัวประกอบข้อมูลตัวเดียวกับตัวช่วยลงสินค้า · lib/<ร้าน>-create-plan)
 * ค่าฝั่งร้าน = ดึงสดจากร้าน (ตัวอ่านเดียวกับลิ้นชักสินค้าบนร้าน)
 * ตัวประกอบ/ส่ง = lib/platform-listing-drift-server · หน้าเทียบก่อนส่ง = components/platform-catalog/match-system-dialog
 *
 * 4 เรื่อง:
 *   images      รูปสินค้า — ที่อยู่รูปบนร้านไม่ใช่ที่อยู่ในระบบ เทียบตรงไม่ได้ → จำ "ชุดรูปที่ส่งจากระบบ" ไว้ตอนส่ง (sys_sync)
 *               ยังไม่เคยส่งจากระบบ = เทียบได้แค่จำนวน (เท่ากัน = "ไม่รู้" ไม่นับเป็นปัญหา)
 *   description รายละเอียด — ตัดแท็ก HTML/ช่องว่างทิ้งแล้วเทียบข้อความ
 *   options     ชื่อตัวเลือก (สี/ไซซ์) ต่อ SKU — จับคู่ด้วยรหัส SKU บนร้าน
 *   price       ราคาต่อตัวเลือก
 * ห้าม import "@/..." ที่นี่
 */

export type DriftKey = "title" | "images" | "description" | "desc_images" | "options" | "variant_images" | "price" | "attrs";
export const DRIFT_KEYS: readonly DriftKey[] = ["title", "images", "description", "desc_images", "options", "variant_images", "price", "attrs"];
export const DRIFT_LABEL: Record<DriftKey, string> = {
  title: "ชื่อสินค้า", images: "รูป", description: "รายละเอียด", desc_images: "รูปในรายละเอียด",
  options: "ชื่อตัวเลือก (สี/ไซซ์)", variant_images: "รูปตัวเลือก", price: "ราคา", attrs: "ข้อมูลจำเพาะ",
};

/** same = ตรง · diff = ไม่ตรง · unknown = บอกไม่ได้ (ไม่นับเป็นปัญหา) */
export type DriftState = "same" | "diff" | "unknown";
export type DriftRow = { label: string; before: string; after: string };
export type DriftItem = {
  key: DriftKey;
  state: DriftState;
  /** สรุปสั้น (ป้าย) */
  summary: string;
  before: string;
  after: string;
  rows?: DriftRow[];
  note?: string | null;
  /** กดส่งให้ตรงได้ไหม (ร้านรองรับ + ไม่ติดกฎ) · ไม่ได้ = cannot บอกเหตุผล */
  sendable: boolean;
  cannot?: string | null;
  /** รูป: ลิงก์รูปตามลำดับ บนร้าน / หลังส่ง (เฉพาะตอนตรวจสด · ไม่จดลงตาราง) */
  media?: { before: string[]; after: string[] };
  /** รายละเอียด: ข้อความเต็ม 2 ฝั่ง (HTML หรือข้อความล้วน · เฉพาะตอนตรวจสด · ไม่จดลงตาราง) */
  text?: { before: string; after: string };
  /** ตัวเลือก: ตารางรายตัวเลือก รูป · สี · ราคา 2 ฝั่ง (เฉพาะตอนตรวจสด · ไม่จดลงตาราง) */
  table?: VariantTableRow[];
  /** กด "ข้าม (ถือว่าตรง)" ไว้ — state เป็น same จนกว่าฝั่งใดเปลี่ยน (2026-11-24) */
  ignored?: boolean;
};
export type VariantTableRow = {
  code: string;
  shop: { label: string; image: string | null; price: number | null; pay?: number | null; special?: number | null } | null;
  sys: { label: string; image: string | null; price: number | null; pay?: number | null; special?: number | null };
  nameDiff: boolean; priceDiff: boolean; imageMissing: boolean;
};

// ───────── ค่ากลาง 2 ฝั่ง ─────────
/** image = ref รูปตัวเลือกฝั่งระบบ ("r2:<key>") */
export type SysVariant = { code: string; values: string[]; price: number | null; special?: number | null; pay?: number | null; image?: string | null };
/** ข้อมูลจำเพาะ: รหัสช่อง → ค่า (ค่าในรายการ = id · พิมพ์เอง = name) — รูปแบบเดียวกับช่องกรอกกลาง lib/tiktok-attrs (ไม่ import) */
export type AttrValues = Record<string, { id?: string; name?: string }[]>;
export type SystemValues = {
  description: string; imageRefs: string[]; variants: SysVariant[]; /** ชื่อที่จะส่ง (lib/listing-title) */ title?: string;
  /** ข้อมูลจำเพาะที่ระบบจะส่ง (2026-11-23 · ตอนนี้ Shopee) + ชื่อช่อง · ไม่มี = ไม่เทียบเรื่องนี้ */ attrs?: AttrValues; attrNames?: Record<string, string>;
  /** รูปในรายละเอียด (รูป Description ของ Parent SKU · "r2:<key>") */ descImageRefs?: string[];
  /**
   * จำนวน "ชุดรูปหลัก" (รูปในร่าง + แกลเลอรีของสินค้า) ก่อนตัวช่วยลงสินค้าเติมรูปปกตัวสีจนครบที่ร้านรับ (2026-11-24 เจ้าของ "จริง ๆ ตรงกันแล้วมี 8 รูป")
   * ยังไม่เคยส่งรูป + บนร้านมีเท่าชุดรูปหลัก = ไม่นับว่าไม่ตรง · ไม่รู้ = undefined
   */
  imageCoreCount?: number;
};
/** image = ลิงก์รูปตัวเลือกบนร้าน */
export type ShopVariant = { code: string | null; label: string; values?: string[]; price: number | null; special?: number | null; pay?: number | null; image?: string | null };
export type ShopValues = {
  /** ชื่อบนร้าน */ title?: string; description: string; imageCount: number; imageSig: string; variants: ShopVariant[];
  /** ข้อมูลจำเพาะบนร้าน (2026-11-23) */ attrs?: AttrValues;
  /** ลิงก์รูปบนร้านตามลำดับ (ไว้โชว์) */ imageUrls?: string[];
  /** ลิงก์รูปในรายละเอียดบนร้าน (ไม่ส่ง = หาจาก <img> ในรายละเอียด) */ descImageUrls?: string[];
};
/** ref รูปฝั่งระบบ → ลิงก์รูปย่อ ("r2:<key>" = คลังรูปเรา · http = ลิงก์ตรง) */
export function refImageUrl(ref: string, w = 400): string {
  return ref.startsWith("r2:") ? `/api/r2-image?key=${encodeURIComponent(ref.slice(3))}&w=${w}` : ref;
}
/** จำตอนส่งรูปจากระบบสำเร็จ (raw.sys_sync) */
export type SysSync = {
  images_sys?: string | null; images_shop?: string | null; images_at?: string | null;
  desc_images_sys?: string | null; desc_images_shop?: string | null;
  vimg_sys?: string | null; vimg_shop?: string | null;
  /**
   * "ข้าม (ถือว่าตรง)" ต่อเรื่อง (เจ้าของเลือก 2026-11-24 หน้าอัปเดตให้ตรง ข้อ 1) — sig = ลายเซ็นค่าทั้ง 2 ฝั่งตอนกดข้าม (driftValueSig)
   * ฝั่งร้านหรือระบบเปลี่ยน = ลายเซ็นไม่ตรง = เตือนใหม่เอง · ลบ = เลิกข้าม
   */
  ignore?: Record<string, { sig: string; at: string | null; by?: string | null }>;
};

// ───────── ตัวช่วย ─────────
const ENT: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
/** ข้อความล้วนสำหรับเทียบ: ตัดแท็ก + แปลงอักขระ HTML + ตัดช่องว่าง/ขึ้นบรรทัดทั้งหมด · ตัวพิมพ์เล็ก */
export function normText(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (m, k: string) => ENT[k.toLowerCase()] ?? (k.startsWith("#") && /^#\d+$/.test(k) ? String.fromCharCode(Number(k.slice(1))) : m))
    .replace(/[\s​ ]+/g, "").toLowerCase();
}
/** ข้อความอ่านง่าย (ตัดแท็ก ย่อช่องว่าง) ไว้โชว์ · หัวข้อย่อย (<li>) ขึ้นต้นด้วย "• " ให้เห็นว่าเป็นข้อ ๆ */
export function plainText(s: string | null | undefined, opts: { keepBlank?: boolean } = {}): string {
  const t = String(s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<li\b[^>]*>/gi, "\n• ").replace(opts.keepBlank ? /<\/(p|div|h\d)>/gi : /<\/(p|li|div|h\d)>/gi, "\n").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n");
  // keepBlank = เว้นบรรทัด/ย่อหน้าตามจริง (บรรทัดว่างติดกันหลายบรรทัดเหลือ 1) — หน้าเทียบก่อนส่ง (เจ้าของ 2026-11-21 "อยากให้ preview เว้นบรรทัด")
  // หัวข้อย่อยต่อจากย่อหน้า (</p><ul><li>) ไม่ใช่บรรทัดว่างที่ตั้งใจเว้น
  return (opts.keepBlank ? t.replace(/\n{3,}/g, "\n\n").replace(/\n\n• /g, "\n• ") : t.replace(/\n+/g, "\n")).trim();
}
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);
/** ลายเซ็นสั้นของรายการ (FNV-1a 32 บิต) */
export function listSig(xs: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const ch of xs.join("\n")) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
const normCode = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();
const normVal = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const money = (n: number | null | undefined) => (n == null ? "—" : `฿${Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`);
const samePrice = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? a == b : Math.abs(a - b) < 0.005);

/** ตัวเลือกบนร้านของ SKU นี้ (จับคู่ด้วยรหัส) */
export function shopVariantOf(shop: ShopVariant[], code: string): ShopVariant | null {
  const c = normCode(code);
  return shop.find((v) => normCode(v.code) === c) ?? (shop.length === 1 && !shop[0].code ? shop[0] : null);
}

// ───────── เทียบทีละเรื่อง ─────────
export function compareImages(sys: SystemValues, shop: ShopValues, sync: SysSync | null | undefined): Omit<DriftItem, "sendable" | "cannot"> {
  return { ...compareImagesCore(sys, shop, sync), media: { before: shop.imageUrls ?? [], after: sys.imageRefs.map((r) => refImageUrl(r)) } };
}
function compareImagesCore(sys: SystemValues, shop: ShopValues, sync: SysSync | null | undefined): Omit<DriftItem, "sendable" | "cannot"> {
  const sysSig = listSig(sys.imageRefs);
  const before = `${shop.imageCount} รูป`, after = `${sys.imageRefs.length} รูป`;
  if (!sys.imageRefs.length) return { key: "images", state: "unknown", summary: "ระบบยังไม่มีรูป", before, after, note: "สินค้านี้ยังไม่มีรูปที่จะส่ง" };
  if (sync?.images_sys) {
    const sysChanged = sync.images_sys !== sysSig, shopChanged = !!sync.images_shop && sync.images_shop !== shop.imageSig;
    if (!sysChanged && !shopChanged) return { key: "images", state: "same", summary: "รูปตรง", before, after, note: sync.images_at ? `ส่งจากระบบล่าสุด ${sync.images_at.slice(0, 10)}` : null };
    return {
      key: "images", state: "diff", before, after,
      summary: sysChanged ? "รูปในระบบเปลี่ยนหลังส่งล่าสุด" : "รูปบนร้านถูกเปลี่ยน",
      note: sysChanged && shopChanged ? "ทั้งรูปในระบบและบนร้านเปลี่ยน" : sysChanged ? "เปลี่ยนรูปที่สินค้าหลังส่งขึ้นร้านครั้งล่าสุด" : "มีคนแก้รูปบนร้านหลังส่งจากระบบ",
    };
  }
  // บนร้านมีเท่าชุดรูปหลักของสินค้า — รูปที่เกินมาฝั่งระบบคือรูปปกตัวสีที่ตัวช่วยลงสินค้าเติมให้ครบตอนลงใหม่เท่านั้น
  const core = sys.imageCoreCount;
  if (core != null && core > 0 && core < sys.imageRefs.length && shop.imageCount === core) {
    return { key: "images", state: "unknown", summary: `เท่าชุดรูปหลัก (${core} รูป)`, before, after,
      note: `บนร้าน ${shop.imageCount} รูป = รูปหลักของสินค้า ${core} รูป · ระบบเติมรูปปกตัวสีให้ครบ ${sys.imageRefs.length} เฉพาะตอนลงใหม่ — ไม่นับว่าไม่ตรง (ถ้าอยากให้ครบ ${sys.imageRefs.length} รูป ติ๊กส่งได้)` };
  }
  if (shop.imageCount !== sys.imageRefs.length) return { key: "images", state: "diff", summary: `รูป: บนร้าน ${shop.imageCount} · ระบบ ${sys.imageRefs.length}`, before, after, note: `ระบบยังไม่เคยส่งรูปขึ้นร้านนี้ (เทียบได้แค่จำนวน) · กดส่ง = แทนรูปบนร้านทั้งชุดด้วย ${sys.imageRefs.length} รูปตามระบบ` };
  return { key: "images", state: "unknown", summary: "ยังไม่เคยส่งรูปจากระบบ", before, after, note: "จำนวนรูปเท่ากัน แต่ยังบอกไม่ได้ว่าเป็นรูปชุดเดียวกัน — กดส่งครั้งแรกแล้วระบบจะจำไว้เทียบรอบหน้า" };
}

export function compareDescription(sys: SystemValues, shop: ShopValues): Omit<DriftItem, "sendable" | "cannot"> {
  return { ...compareDescriptionCore(sys, shop), text: { before: shop.description ?? "", after: sys.description ?? "" } };
}
function compareDescriptionCore(sys: SystemValues, shop: ShopValues): Omit<DriftItem, "sendable" | "cannot"> {
  const a = normText(shop.description), b = normText(sys.description);
  const before = short(plainText(shop.description), 80) || "(ว่าง)", after = short(plainText(sys.description), 80) || "(ว่าง)";
  if (!b) return { key: "description", state: "unknown", summary: "ระบบยังไม่มีรายละเอียด", before, after };
  if (a === b) return { key: "description", state: "same", summary: "รายละเอียดตรง", before, after };
  return { key: "description", state: "diff", summary: "รายละเอียดต่าง", before, after, note: `บนร้าน ${plainText(shop.description).length.toLocaleString()} ตัวอักษร · ระบบ ${plainText(sys.description).length.toLocaleString()} ตัวอักษร` };
}

/** ตัวเลือกไม่ตรง = ค่าตัวเลือกในระบบ (สี/ไซซ์) ไม่อยู่ในชื่อตัวเลือกบนร้าน */
export function optionRows(sys: SystemValues, shop: ShopValues): DriftRow[] {
  const rows: DriftRow[] = [];
  for (const v of sys.variants) {
    const vals = v.values.map((x) => x.trim()).filter(Boolean);
    if (!vals.length) continue;
    const sv = shopVariantOf(shop.variants, v.code);
    if (!sv) continue;   // ไม่มีตัวเลือกนี้บนร้าน = เรื่องโครงตัวเลือก (เช็กข้ามร้าน "ตัวเลือก") ไม่ใช่ชื่อไม่ตรง
    const hay = sv.values?.length ? sv.values.map(normVal) : [normVal(sv.label)];
    // ชื่อในระบบบางร้านต่อรหัสไว้กันชื่อซ้ำ เช่น "ดำ (01)" → เทียบแค่ "ดำ"
    const ok = vals.every((x) => { const c = normVal(coreValue(x)); return hay.some((h) => (sv.values?.length ? h === c || h === normVal(x) : h.includes(c))); });
    if (!ok) rows.push({ label: v.code, before: sv.values?.length ? sv.values.join(" · ") : sv.label || "—", after: vals.join(" · ") });
  }
  return rows;
}
/** ค่าตัวเลือกแกนหลัก — ตัดวงเล็บท้าย (รหัสที่ระบบต่อไว้กันชื่อซ้ำ) */
export const coreValue = (x: string): string => x.replace(/\s*\([^()]*\)\s*$/, "").trim() || x.trim();
export function compareOptions(sys: SystemValues, shop: ShopValues): Omit<DriftItem, "sendable" | "cannot"> {
  const withVals = sys.variants.filter((v) => v.values.some((x) => x.trim()));
  if (!withVals.length) return { key: "options", state: "unknown", summary: "ไม่มีตัวเลือก", before: "—", after: "—" };
  const onShop = withVals.filter((v) => shopVariantOf(shop.variants, v.code));
  const missing = withVals.length - onShop.length;
  const missNote = missing ? `ไม่มีบนร้าน ${missing} ตัวเลือก (ดูเรื่อง "ตัวเลือก" ในเช็กข้ามร้าน)` : null;
  if (!onShop.length) return { key: "options", state: "unknown", summary: "รหัสตัวเลือกไม่ตรงกับร้าน", before: "—", after: "—", note: missNote };
  const rows = optionRows(sys, shop);
  if (!rows.length) return { key: "options", state: "same", summary: "ชื่อตัวเลือกตรง", before: `${onShop.length} ตัวเลือก`, after: `${onShop.length} ตัวเลือก`, note: missNote };
  return { key: "options", state: "diff", summary: `ชื่อตัวเลือกไม่ตรง ${rows.length}`, before: rows.map((r) => r.before).slice(0, 3).join(", "), after: rows.map((r) => r.after).slice(0, 3).join(", "), rows, note: missNote };
}

/** ราคาไม่ตรงต่อตัวเลือก — เทียบเฉพาะช่องที่ทั้ง 2 ฝั่งมี (price · special · pay) */
export function priceRows(sys: SystemValues, shop: ShopValues): DriftRow[] {
  const rows: DriftRow[] = [];
  const fmt = (x: { price: number | null; special?: number | null; pay?: number | null }) =>
    [money(x.price), x.special != null ? `ลด ${money(x.special)}` : "", x.pay != null && !samePrice(x.pay, x.price) ? `จ่าย ${money(x.pay)}` : ""].filter(Boolean).join(" · ");
  for (const v of sys.variants) {
    if (v.price == null) continue;
    const sv = shopVariantOf(shop.variants, v.code);
    if (!sv) continue;
    const diff = !samePrice(sv.price, v.price)
      || (v.special !== undefined && sv.special !== undefined && !samePrice(sv.special ?? null, v.special ?? null))
      || (v.pay !== undefined && sv.pay !== undefined && !samePrice(sv.pay ?? null, v.pay ?? null));
    if (diff) rows.push({ label: v.code, before: fmt(sv), after: fmt(v) });
  }
  return rows;
}
export function comparePrice(sys: SystemValues, shop: ShopValues): Omit<DriftItem, "sendable" | "cannot"> {
  const priced = sys.variants.filter((v) => v.price != null && shopVariantOf(shop.variants, v.code));
  if (!priced.length) return { key: "price", state: "unknown", summary: "เทียบราคาไม่ได้", before: "—", after: "—", note: "ไม่มีตัวเลือกที่รหัสตรงกัน หรือระบบยังไม่มีราคา" };
  const rows = priceRows(sys, shop);
  if (!rows.length) return { key: "price", state: "same", summary: "ราคาตรง", before: `${priced.length} ตัวเลือก`, after: `${priced.length} ตัวเลือก` };
  return { key: "price", state: "diff", summary: rows.length === 1 ? `ราคา ${rows[0].before} → ${rows[0].after}` : `ราคาไม่ตรง ${rows.length} ตัวเลือก`, before: rows[0].before, after: rows[0].after, rows, note: priceWarning(sys, shop) };
}
/**
 * คำเตือนก่อนส่งราคา (หน้าเทียบไม่ติ๊กราคาไว้ให้ก่อน — ร้านมักตั้งราคาเต็มสูงไว้ทำโปร)
 * ลูกค้าจ่ายแพงขึ้น · ราคาขีดฆ่า/ส่วนลดจะหาย · ราคาเปลี่ยนเกิน 30%
 */
export function priceWarning(sys: SystemValues, shop: ShopValues): string | null {
  const w = new Set<string>();
  for (const v of sys.variants) {
    const sv = v.price != null ? shopVariantOf(shop.variants, v.code) : null;
    if (!sv || sv.price == null || v.price == null) continue;
    const shopPay = sv.pay ?? sv.special ?? sv.price, sysPay = v.pay ?? v.special ?? v.price;
    if (sysPay > shopPay + 0.005) w.add("ลูกค้าจะจ่ายแพงขึ้น");
    if (shopPay < sv.price - 0.005 && !(sysPay < v.price - 0.005)) w.add("ราคาขีดฆ่า/ส่วนลดบนร้านจะหาย");
    if (Math.abs(v.price - sv.price) / sv.price > 0.3) w.add("ราคาเปลี่ยนเกิน 30%");
  }
  return w.size ? `ตรวจก่อนส่ง: ${[...w].join(" · ")} (ร้านอาจตั้งราคาเต็มไว้ทำโปร)` : null;
}

/** เทียบครบ 4 เรื่อง (ยังไม่ตัดสินว่าส่งได้ไหม — ฝั่ง server ใส่ sendable/cannot ตามร้าน) */
/** ชื่อสินค้า — เทียบตรงตัว (ย่อช่องว่างซ้ำ) · ระบบไม่มีชื่อ/ร้านไม่ส่งชื่อมา = บอกไม่ได้ */
export function compareTitle(sys: SystemValues, shop: ShopValues): Omit<DriftItem, "sendable" | "cannot"> {
  const a = String(shop.title ?? "").replace(/\s+/g, " ").trim(), b = String(sys.title ?? "").replace(/\s+/g, " ").trim();
  if (!b || shop.title == null) return { key: "title", state: "unknown", summary: "เทียบชื่อไม่ได้", before: a || "—", after: b || "—" };
  if (a === b) return { key: "title", state: "same", summary: "ชื่อตรง", before: a, after: b };
  return { key: "title", state: "diff", summary: "ชื่อไม่ตรง", before: a || "(ว่าง)", after: b };
}

/**
 * รูปในรายละเอียด (รูป Description ของ Parent SKU) — ที่อยู่รูปบนร้านเทียบกับในระบบตรง ๆ ไม่ได้ (เหมือนรูปสินค้า)
 * จำชุดที่ส่งจากระบบ (sys_sync.desc_images_*) · ยังไม่เคยส่ง = เทียบจำนวน
 */
export function compareDescImages(sys: SystemValues, shop: ShopValues, sync: SysSync | null | undefined): Omit<DriftItem, "sendable" | "cannot"> {
  const refs = sys.descImageRefs ?? [];
  const urls = shop.descImageUrls ?? descImages(shop.description);
  const base = { key: "desc_images" as const, before: `${urls.length} รูป`, after: `${refs.length} รูป`, media: { before: urls, after: refs.map((r) => refImageUrl(r)) } };
  if (!refs.length && !urls.length) return { ...base, state: "same", summary: "ไม่มีรูปในรายละเอียด" };
  if (!refs.length) return { ...base, state: "unknown", summary: "ระบบไม่มีรูปในรายละเอียด", note: "เพิ่มรูป Description ที่ Parent SKU ถ้าอยากให้ทุกร้านมีรูปชุดเดียวกัน" };
  const sysSig = listSig(refs), shopSig = listSig(urls);
  if (sync?.desc_images_sys) {
    const same = sync.desc_images_sys === sysSig && (!sync.desc_images_shop || sync.desc_images_shop === shopSig);
    return same ? { ...base, state: "same", summary: "รูปในรายละเอียดตรง" } : { ...base, state: "diff", summary: "รูปในรายละเอียดเปลี่ยนหลังส่งล่าสุด" };
  }
  if (urls.length !== refs.length) return { ...base, state: "diff", summary: `รูปในรายละเอียด: บนร้าน ${urls.length} · ระบบ ${refs.length}`, note: "ยังไม่เคยส่งรูปในรายละเอียดจากระบบ (เทียบได้แค่จำนวน)" };
  return { ...base, state: "unknown", summary: "ยังไม่เคยส่งรูปในรายละเอียดจากระบบ", note: "จำนวนรูปเท่ากัน แต่ยังบอกไม่ได้ว่าเป็นชุดเดียวกัน" };
}

/** ลายเซ็นรูปตัวเลือกฝั่งระบบ / ฝั่งร้าน (รหัส:รูป ตามลำดับรหัส) */
export const sysVariantImageSig = (sys: SystemValues) => listSig(sys.variants.filter((v) => v.image).map((v) => `${v.code.trim().toUpperCase()}:${v.image}`).sort());
export const shopVariantImageSig = (shop: ShopValues) => listSig(shop.variants.filter((v) => v.image).map((v) => `${String(v.code ?? "").trim().toUpperCase()}:${v.image}`).sort());
/**
 * รูปตัวเลือก — เทียบที่อยู่รูปตรง ๆ ไม่ได้ · จำชุดที่ส่งจากระบบ (sys_sync.vimg_*)
 * ยังไม่เคยส่ง: ตัวเลือกบนร้านที่ "ไม่มีรูป" ทั้งที่ระบบมี = ไม่ตรง · ไม่งั้นบอกไม่ได้
 */
export function compareVariantImages(sys: SystemValues, shop: ShopValues, sync: SysSync | null | undefined): Omit<DriftItem, "sendable" | "cannot"> {
  const withImg = sys.variants.filter((v) => v.image && shopVariantOf(shop.variants, v.code));
  const base = { key: "variant_images" as const, before: `${shop.variants.filter((v) => v.image).length} รูป`, after: `${withImg.length} รูป` };
  if (!withImg.length) return { ...base, state: "unknown", summary: "ระบบไม่มีรูปตัวเลือก" };
  if (sync?.vimg_sys) {
    const same = sync.vimg_sys === sysVariantImageSig(sys) && (!sync.vimg_shop || sync.vimg_shop === shopVariantImageSig(shop));
    return same ? { ...base, state: "same", summary: "รูปตัวเลือกตรง" } : { ...base, state: "diff", summary: "รูปตัวเลือกเปลี่ยนหลังส่งล่าสุด" };
  }
  const missing = withImg.filter((v) => !shopVariantOf(shop.variants, v.code)?.image);
  if (missing.length) return { ...base, state: "diff", summary: `ตัวเลือกบนร้านไม่มีรูป ${missing.length}`, rows: missing.map((v) => ({ label: v.code, before: "(ไม่มีรูป)", after: "รูปตามระบบ" })) };
  return { ...base, state: "unknown", summary: "ยังไม่เคยส่งรูปตัวเลือกจากระบบ", note: "ดูรูปเทียบในตารางตัวเลือก — กดส่งครั้งแรกแล้วระบบจะจำไว้เทียบรอบหน้า" };
}

/** ตารางตัวเลือก รูป · สี · ราคา 2 ฝั่ง (เรียงตามระบบ) — แสดงใต้เรื่อง "ชื่อตัวเลือก" */
export function variantTable(sys: SystemValues, shop: ShopValues): VariantTableRow[] {
  const bad = new Set(optionRows(sys, shop).map((r) => r.label));
  const badPrice = new Set(priceRows(sys, shop).map((r) => r.label));
  return sys.variants.map((v) => {
    const sv = shopVariantOf(shop.variants, v.code);
    return {
      code: v.code,
      shop: sv ? { label: sv.values?.length ? sv.values.join(" · ") : sv.label, image: sv.image ?? null, price: sv.price, pay: sv.pay, special: sv.special } : null,
      sys: { label: v.values.filter((x) => x.trim()).join(" · ") || v.code, image: v.image ? refImageUrl(v.image, 200) : null, price: v.price, pay: v.pay, special: v.special },
      nameDiff: bad.has(v.code), priceDiff: badPrice.has(v.code), imageMissing: !!v.image && !!sv && !sv.image,
    };
  });
}

/** ลายเซ็นค่าของช่อง (ไม่สนลำดับ · id ก่อนชื่อ) */
export const attrValSig = (vals: readonly { id?: string; name?: string }[] | undefined): string =>
  (vals ?? []).map((v) => (v.id && Number(v.id) > 0 ? `#${v.id}` : `"${String(v.name ?? "").trim().toLowerCase()}`)).sort().join("|");
export const attrValText = (vals: readonly { id?: string; name?: string }[] | undefined): string => (vals ?? []).map((v) => v.name || v.id || "").filter(Boolean).join(", ") || "(ว่าง)";
/**
 * ข้อมูลจำเพาะ (2026-11-23 เจ้าของ "เช็กกับระบบ") — เทียบเฉพาะช่องที่ระบบมีค่า (ระบบว่าง = ไม่นับ ไม่บังคับให้ร้านลบ)
 * ร้านไม่ส่งข้อมูลมา / ระบบไม่มีค่าเลย = บอกไม่ได้
 */
export function compareAttrs(sys: SystemValues, shop: ShopValues): Omit<DriftItem, "sendable" | "cannot"> {
  const want = Object.entries(sys.attrs ?? {}).filter(([, v]) => v.length);
  const base = { key: "attrs" as const, before: `${Object.keys(shop.attrs ?? {}).length} ช่อง`, after: `${want.length} ช่อง` };
  if (!shop.attrs || !want.length) return { ...base, state: "unknown", summary: "เทียบข้อมูลจำเพาะไม่ได้" };
  const rows: DriftRow[] = want.filter(([id, v]) => attrValSig(v) !== attrValSig(shop.attrs![id]))
    .map(([id, v]) => ({ label: sys.attrNames?.[id] ?? id, before: attrValText(shop.attrs![id]), after: attrValText(v) }));
  return rows.length ? { ...base, state: "diff", summary: `ข้อมูลจำเพาะไม่ตรง ${rows.length} ช่อง`, rows } : { ...base, state: "same", summary: "ข้อมูลจำเพาะตรง" };
}

export function compareAll(sys: SystemValues, shop: ShopValues, sync: SysSync | null | undefined): Omit<DriftItem, "sendable" | "cannot">[] {
  const options = compareOptions(sys, shop);
  const items = [
    compareTitle(sys, shop), compareImages(sys, shop, sync), compareDescription(sys, shop), compareDescImages(sys, shop, sync),
    { ...options, table: variantTable(sys, shop) }, compareVariantImages(sys, shop, sync), comparePrice(sys, shop),
    ...(sys.attrs ? [compareAttrs(sys, shop)] : []),
  ];
  return items.map((it) => applyDriftIgnore(it, sys, shop, sync));
}

/**
 * ลายเซ็นค่าทั้ง 2 ฝั่งของเรื่องนี้ (ไว้จำตอนกด "ข้าม" — ค่าใดเปลี่ยน = ลายเซ็นเปลี่ยน = เตือนใหม่)
 * ข้อความเทียบแบบเดียวกับตัวเทียบ (ตัดช่องว่าง/แท็ก) — แก้แค่การเว้นบรรทัดไม่นับว่าเปลี่ยน
 */
export function driftValueSig(key: DriftKey, sys: SystemValues, shop: ShopValues): string {
  const vs = (xs: readonly { code?: string | null; label?: string; values?: readonly string[]; price?: number | null; special?: number | null; pay?: number | null; image?: string | null }[]) =>
    xs.map((v) => [normCode(v.code), normVal(v.label ?? ""), (v.values ?? []).map(normVal).join("/"), v.price ?? "", v.special ?? "", v.pay ?? "", v.image ?? ""].join("~"));
  const tt = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();
  const parts: string[] = key === "title" ? [tt(shop.title), tt(sys.title)]
    : key === "description" ? [normText(shop.description), normText(sys.description)]
    : key === "images" ? [shop.imageSig, String(shop.imageCount), listSig(sys.imageRefs)]
    : key === "desc_images" ? [listSig(shop.descImageUrls ?? descImages(shop.description)), listSig(sys.descImageRefs ?? [])]
    : key === "attrs" ? [JSON.stringify(shop.attrs ?? {}), JSON.stringify(sys.attrs ?? {})]
    : [listSig(vs(shop.variants)), listSig(vs(sys.variants))];
  return listSig([key, ...parts]);
}
/** กดข้ามไว้ + ค่ายังเหมือนตอนกด → ถือว่าตรง (ป้ายบอกว่าข้ามไว้) */
function applyDriftIgnore<T extends Omit<DriftItem, "sendable" | "cannot">>(it: T, sys: SystemValues, shop: ShopValues, sync: SysSync | null | undefined): T {
  const ig = sync?.ignore?.[it.key];
  if (!ig || (it.state !== "diff" && it.state !== "unknown")) return it;
  if (ig.sig !== driftValueSig(it.key, sys, shop)) return it;
  return { ...it, state: "same", ignored: true, summary: "ข้ามไว้ (ถือว่าตรง)", note: `กดข้ามไว้${ig.at ? ` เมื่อ ${ig.at.slice(0, 10)}` : ""} · ถ้าบนร้านหรือในระบบเปลี่ยนอีกจะเตือนใหม่` };
}

/** เรื่องที่ไม่ตรง (ป้าย) */
export const driftIssues = (items: readonly Pick<DriftItem, "key" | "state">[]): DriftKey[] => items.filter((i) => i.state === "diff").map((i) => i.key);
/** ข้อความป้าย "ไม่ตรงระบบ: รูป · ราคา" */
export function driftBadgeText(issues: readonly DriftKey[]): string {
  return issues.length ? `ไม่ตรงระบบ: ${issues.map((k) => DRIFT_LABEL[k].replace(/\s*\(.*\)$/, "")).join(" · ")}` : "ตรงกับระบบ";
}
// ───────── เทียบรายละเอียดทีละบรรทัด (หน้าเทียบก่อนส่ง) ─────────
export type DiffLine = { text: string; changed: boolean };
/** แบ่งเป็นบรรทัดอ่านง่าย (ตัดแท็ก) · เว้นบรรทัด/ย่อหน้าตามจริง ("" = บรรทัดว่าง · ว่างติดกันเหลือ 1) */
export const descLines = (s: string | null | undefined): string[] => plainText(s, { keepBlank: true }).split(/\n/).map((l) => l.trim());
/**
 * เทียบบรรทัดซ้าย (บนร้าน) กับขวา (หลังส่ง) — LCS ตามข้อความล้วน (ไม่สนช่องว่าง/ตัวพิมพ์)
 * left.changed = บรรทัดนี้จะหายจากร้าน · right.changed = บรรทัดนี้จะเพิ่มเข้าไป
 */
export function lineDiff(a: string[], b: string[]): { left: DiffLine[]; right: DiffLine[]; changes: number } {
  // ขีด/จุดหน้าบรรทัด ("- " ข้อความล้วน กับ "• " หัวข้อย่อย HTML) = ข้อเดียวกัน ไม่นับว่าต่าง
  const key = (l: string) => normText(l.replace(/^\s*[-•*·]\s*/, ""));
  const na = a.map(key), nb = b.map(key);
  const n = a.length, m = b.length;
  // ตาราง LCS (รายละเอียดสินค้าไม่กี่ร้อยบรรทัด — n·m เล็ก)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keepA = new Set<number>(), keepB = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (na[i] === nb[j]) { keepA.add(i); keepB.add(j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  // บรรทัดว่าง = เว้นวรรคเฉย ๆ ไม่นับว่าต่าง
  const left = a.map((t, i) => ({ text: t, changed: !!t.trim() && !keepA.has(i) }));
  const right = b.map((t, j) => ({ text: t, changed: !!t.trim() && !keepB.has(j) }));
  return { left, right, changes: left.filter((l) => l.changed).length + right.filter((r) => r.changed).length };
}
/** ลิงก์รูปในรายละเอียด (HTML) */
export const descImages = (html: string | null | undefined): string[] =>
  [...String(html ?? "").matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
/** มีแท็ก HTML ไหม */
export const looksHtml = (s: string | null | undefined): boolean => /<(p|br|div|ul|ol|li|img|h\d|strong|b|span)\b/i.test(String(s ?? ""));

/** ตรวจไว้นานแค่ไหนถึงควรตรวจใหม่ (ชม.) */
export const DRIFT_STALE_HOURS = 20;
