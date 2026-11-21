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

export type DriftKey = "images" | "description" | "options" | "price";
export const DRIFT_KEYS: readonly DriftKey[] = ["images", "description", "options", "price"];
export const DRIFT_LABEL: Record<DriftKey, string> = { images: "รูป", description: "รายละเอียด", options: "ชื่อตัวเลือก (สี/ไซซ์)", price: "ราคา" };

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
};

// ───────── ค่ากลาง 2 ฝั่ง ─────────
export type SysVariant = { code: string; values: string[]; price: number | null; special?: number | null; pay?: number | null };
export type SystemValues = { description: string; imageRefs: string[]; variants: SysVariant[] };
export type ShopVariant = { code: string | null; label: string; values?: string[]; price: number | null; special?: number | null; pay?: number | null };
export type ShopValues = { description: string; imageCount: number; imageSig: string; variants: ShopVariant[]; /** ลิงก์รูปบนร้านตามลำดับ (ไว้โชว์) */ imageUrls?: string[] };
/** ref รูปฝั่งระบบ → ลิงก์รูปย่อ ("r2:<key>" = คลังรูปเรา · http = ลิงก์ตรง) */
export function refImageUrl(ref: string, w = 400): string {
  return ref.startsWith("r2:") ? `/api/r2-image?key=${encodeURIComponent(ref.slice(3))}&w=${w}` : ref;
}
/** จำตอนส่งรูปจากระบบสำเร็จ (raw.sys_sync) */
export type SysSync = { images_sys?: string | null; images_shop?: string | null; images_at?: string | null };

// ───────── ตัวช่วย ─────────
const ENT: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
/** ข้อความล้วนสำหรับเทียบ: ตัดแท็ก + แปลงอักขระ HTML + ตัดช่องว่าง/ขึ้นบรรทัดทั้งหมด · ตัวพิมพ์เล็ก */
export function normText(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (m, k: string) => ENT[k.toLowerCase()] ?? (k.startsWith("#") && /^#\d+$/.test(k) ? String.fromCharCode(Number(k.slice(1))) : m))
    .replace(/[\s​ ]+/g, "").toLowerCase();
}
/** ข้อความอ่านง่าย (ตัดแท็ก ย่อช่องว่าง) ไว้โชว์ */
export function plainText(s: string | null | undefined): string {
  return String(s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n+/g, "\n").trim();
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
  if (shop.imageCount !== sys.imageRefs.length) return { key: "images", state: "diff", summary: `รูป: บนร้าน ${shop.imageCount} · ระบบ ${sys.imageRefs.length}`, before, after, note: "ยังไม่เคยส่งรูปจากระบบ — จำนวนรูปไม่เท่ากัน" };
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
export function compareAll(sys: SystemValues, shop: ShopValues, sync: SysSync | null | undefined): Omit<DriftItem, "sendable" | "cannot">[] {
  return [compareImages(sys, shop, sync), compareDescription(sys, shop), compareOptions(sys, shop), comparePrice(sys, shop)];
}

/** เรื่องที่ไม่ตรง (ป้าย) */
export const driftIssues = (items: readonly Pick<DriftItem, "key" | "state">[]): DriftKey[] => items.filter((i) => i.state === "diff").map((i) => i.key);
/** ข้อความป้าย "ไม่ตรงระบบ: รูป · ราคา" */
export function driftBadgeText(issues: readonly DriftKey[]): string {
  return issues.length ? `ไม่ตรงระบบ: ${issues.map((k) => DRIFT_LABEL[k].replace(/\s*\(.*\)$/, "")).join(" · ")}` : "ตรงกับระบบ";
}
// ───────── เทียบรายละเอียดทีละบรรทัด (หน้าเทียบก่อนส่ง) ─────────
export type DiffLine = { text: string; changed: boolean };
/** แบ่งเป็นบรรทัดอ่านง่าย (ตัดแท็ก · ตัดบรรทัดว่าง) */
export const descLines = (s: string | null | undefined): string[] => plainText(s).split(/\n/).map((l) => l.trim()).filter(Boolean);
/**
 * เทียบบรรทัดซ้าย (บนร้าน) กับขวา (หลังส่ง) — LCS ตามข้อความล้วน (ไม่สนช่องว่าง/ตัวพิมพ์)
 * left.changed = บรรทัดนี้จะหายจากร้าน · right.changed = บรรทัดนี้จะเพิ่มเข้าไป
 */
export function lineDiff(a: string[], b: string[]): { left: DiffLine[]; right: DiffLine[]; changes: number } {
  const na = a.map(normText), nb = b.map(normText);
  const n = a.length, m = b.length;
  // ตาราง LCS (รายละเอียดสินค้าไม่กี่ร้อยบรรทัด — n·m เล็ก)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keepA = new Set<number>(), keepB = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (na[i] === nb[j]) { keepA.add(i); keepB.add(j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const left = a.map((t, i) => ({ text: t, changed: !keepA.has(i) }));
  const right = b.map((t, j) => ({ text: t, changed: !keepB.has(j) }));
  return { left, right, changes: left.filter((l) => l.changed).length + right.filter((r) => r.changed).length };
}
/** ลิงก์รูปในรายละเอียด (HTML) */
export const descImages = (html: string | null | undefined): string[] =>
  [...String(html ?? "").matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
/** มีแท็ก HTML ไหม */
export const looksHtml = (s: string | null | undefined): boolean => /<(p|br|div|ul|ol|li|img|h\d|strong|b|span)\b/i.test(String(s ?? ""));

/** ตรวจไว้นานแค่ไหนถึงควรตรวจใหม่ (ชม.) */
export const DRIFT_STALE_HOURS = 20;
