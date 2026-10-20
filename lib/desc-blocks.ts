/**
 * คำอธิบายประกอบจากบล็อก (ของกลาง) — เช่น "Platform Description" ของ Parent SKU
 * (ไฟล์ pure ห้ามใส่ "use client" — API route / เทสต์ import ได้)
 *
 * เจ้าของขอ 2026-10-20 "อยากได้ popup แก้สูตรอันนี้ด้วย" (ต่อจาก ⚙ Name Platform — lib/name-parts)
 *   - บล็อกเรียงลำดับได้ · เปิด/ปิดได้ · ตั้งว่าเว้นบรรทัดหรือติดบรรทัดบน
 *   - บล็อกข้อมูลจากสินค้า (บทนำ/รายละเอียด/ขนาด/…) ว่าง = ข้ามเอง
 *   - บล็อกข้อความ (Notes/เปลี่ยนสินค้า/เงื่อนไขสั่งซื้อ/ติดตามร้าน + พิมพ์เองเพิ่มได้) แก้ข้อความไทย/อังกฤษได้
 *     ใส่ตัวแทนได้: {แบรนด์} {รับประกัน} {รหัส} {ชื่อสินค้า}
 * เก็บที่ทะเบียนฟิลด์ relation_config.desc_blocks · ยังไม่ตั้ง = ใช้สูตรเดิมในโค้ด (lib/computed-text) ไม่เปลี่ยนอะไร
 * ตัวตั้งค่า = components/desc-blocks-editor
 */

export type DescLang = "th" | "en";
export type DescBlockKey = "intro" | "details" | "size_desc" | "how_to_size" | "size_line" | "special" | "notes" | "warranty" | "exchange" | "ordering" | "follow" | "text";
export type DescGap = "blank" | "line";
export type DescBlock = { id: string; key: DescBlockKey; on: boolean; gap: DescGap; text?: string; text_en?: string };
export type DescBlocksConfig = { blocks: DescBlock[] };

type Def = { label: string; hint: string; kind: "field" | "text" | "auto"; th?: string; en?: string };
export const DESC_BLOCK_DEFS: Record<DescBlockKey, Def> = {
  intro: { label: "บทนำ", hint: "ช่อง Introduction (อังกฤษ = Introduction En)", kind: "field" },
  details: { label: "รายละเอียดสินค้า", hint: "หัวข้อ + ช่อง Description (อังกฤษ = English Description) · แก้หัวข้อได้", kind: "field", th: "รายละเอียดสินค้า", en: "Product details" },
  size_desc: { label: "คำอธิบายขนาด", hint: "จากช่องคำอธิบายขนาด (มีแต่ภาษาไทย)", kind: "field" },
  how_to_size: { label: "วิธีวัดขนาด", hint: "จากช่อง How to size (มีแต่ภาษาไทย)", kind: "field" },
  size_line: { label: "ขนาดสินค้า / น้ำหนัก", hint: "คำนวณจาก กว้าง×สูง×หนา หรือขนาดพิมพ์เอง + น้ำหนัก (ถ้าติ๊กโชว์)", kind: "auto" },
  special: { label: "คำอธิบายพิเศษ", hint: "จากช่องคำอธิบายพิเศษ (มีแต่ภาษาไทย)", kind: "field" },
  notes: { label: "หัวข้อ Notes", hint: "ข้อความ", kind: "text", th: "Notes:", en: "Notes:" },
  warranty: { label: "รับประกัน", hint: "ข้ามเองถ้าไม่มีรับประกัน · ใส่ {รับประกัน} ตรงที่จะให้ระยะเวลาไปอยู่", kind: "text", th: "**ระยะเวลารับประกันสินค้า {รับประกัน}**", en: "**Warranty: {รับประกัน}**" },
  exchange: { label: "นโยบายเปลี่ยนสินค้า", hint: "ข้อความ", kind: "text",
    th: "ลูกค้าสามารถเปลี่ยนสินค้าได้ ภายใน 7 วัน หากสินค้าเสียหายโดยเกิดจากกระบวนการผลิต โดยไม่เสียค่าใช้จ่ายเพิ่มเติม",
    en: "Items can be exchanged within 7 days at no extra cost if the defect is caused by the manufacturing process." },
  ordering: { label: "เงื่อนไขการสั่งซื้อ", hint: "ข้อความหลายบรรทัด · {แบรนด์} = ชื่อแบรนด์ของสินค้า", kind: "text",
    th: [
      ".... การสั่งซื้อสินค้าผ่าน {แบรนด์} Official",
      "1. การจัดส่งสินค้าจะจัดส่ง ทุกวันจันทร์ - วันเสาร์ โดยทางร้านจะตัดยอด ณ.เวลา 08.00 น.ของทุกวัน (หากสั่งสินค้า หลัง 08.00 น. ทางร้านจะจัดส่งให้ในวันถัดไปค่ะ (ไม่รวมวันอาทิตย์))",
      "2. หลังจากลูกค้าโอนเงินจะใช้เวลาในการจัดเตรียมสินค้าประมาณ 1-3 วัน และใช้ระยะเวลาจัดส่ง 2-5 วัน ขึ้นอยู่กับแต่ละบริษัทขนส่ง",
      "3. หากลูกค้ากรอกที่อยู่ผิดหรือเบอร์โทรศัพท์ผิด ทางเราจะไม่สามารถแก้ไขข้อมูลของคุณลูกค้าได้ ต้องรบกวนคุณลูกค้ากดยกเลิกแล้วสั่งเข้ามาใหม่",
      "4. หากสั่งไซส์ผิด ลูกค้าสามารถเปลี่ยนไซส์ได้ (แต่เปลี่ยนแบบไม่ได้) แต่จะมีค่าขนส่งสินค้ากลับไป 50 บาท (ค่าส่งลูกค้าเป็นคนออกเอง)",
    ].join("\n"),
    en: [
      ".... Ordering from {แบรนด์} Official",
      "1. Orders are shipped Monday–Saturday. Daily cut-off is 08:00 (orders placed after 08:00 ship the next day, excluding Sundays).",
      "2. After payment, please allow 1–3 days for preparation and 2–5 days for delivery, depending on the courier.",
      "3. If the address or phone number is entered incorrectly, we cannot edit it for you — please cancel and place a new order.",
      "4. Wrong size can be exchanged (style cannot be changed); a 50 THB return-shipping fee applies (paid by the customer).",
    ].join("\n") },
  follow: { label: "ติดตามร้าน / ติดต่อ", hint: "ข้อความ", kind: "text",
    th: "....• อย่าลืม! กดติดตามร้านค้าเพื่อรับโปรโมชั่น และเห็นสินค้าใหม่ก่อนใคร\n....• หากมีข้อสงสัยสามารถ ติดต่อสอบถามผ่านช่องทางแชทได้ ทุกวันจันทร์ - เสาร์ ตั้งแต่ 8.00 - 22.00 น. และวันอาทิตย์ 11.00 – 22.00 น.",
    en: "....• Follow our shop for promotions and to see new arrivals first.\n....• For any questions, chat with us Monday–Saturday 08:00–22:00, Sunday 11:00–22:00." },
  text: { label: "ข้อความพิมพ์เอง", hint: "เพิ่มได้หลายอัน · อังกฤษว่าง = ไม่ใส่ในฉบับอังกฤษ", kind: "text" },
};

/** ตัวแทนที่ใส่ในบล็อกข้อความได้ (โชว์เป็นปุ่มแทรกในตัวตั้งค่า) */
export const DESC_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: "{แบรนด์}", label: "แบรนด์" }, { token: "{รับประกัน}", label: "รับประกัน" },
  { token: "{รหัส}", label: "รหัสสินค้า" }, { token: "{ชื่อสินค้า}", label: "ชื่อสินค้า" },
];

const b = (key: DescBlockKey, gap: DescGap): DescBlock => ({ id: key, key, on: true, gap });
/** ค่าตั้งต้น = โครงเดียวกับสูตรเดิม (บทนำ · รายละเอียด · ขนาด · พิเศษ · Notes · รับประกัน · เปลี่ยนสินค้า · สั่งซื้อ · ติดตามร้าน) */
export const DEFAULT_DESC_BLOCKS: DescBlock[] = [
  b("intro", "blank"), b("details", "blank"), b("size_desc", "blank"), b("how_to_size", "blank"), b("size_line", "line"),
  b("special", "blank"), b("notes", "blank"), b("warranty", "line"), b("exchange", "line"), b("ordering", "blank"), b("follow", "blank"),
];

const KEYS = new Set(Object.keys(DESC_BLOCK_DEFS));
const MAX_TEXT = 3000;
const s = (v: unknown): string => (v == null ? "" : String(v));
const trim = (v: unknown): string => s(v).trim();

/** ล้างค่า → ใช้ได้เสมอ (บล็อกระบบอย่างละ 1 · ข้อความพิมพ์เองหลายอัน · ไม่มีอะไร = ค่าตั้งต้น) */
export function cleanDescBlocks(raw: unknown): DescBlocksConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as { blocks?: unknown };
  const seen = new Set<string>();
  const blocks: DescBlock[] = [];
  for (const x of Array.isArray(r.blocks) ? r.blocks : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const key = o.key as DescBlockKey;
    if (!KEYS.has(key)) continue;
    let id = trim(o.id) || key;
    if (key !== "text") id = key;            // บล็อกระบบ id = ชื่อบล็อก
    if (seen.has(id)) { if (key !== "text") continue; id = `${id}_${blocks.length}`; }
    seen.add(id);
    const def = DESC_BLOCK_DEFS[key];
    const blk: DescBlock = { id, key, on: o.on !== false, gap: o.gap === "line" ? "line" : "blank" };
    if (def.kind === "text" || key === "details") {
      const t = s(o.text).slice(0, MAX_TEXT), te = s(o.text_en).slice(0, MAX_TEXT);
      if (t) blk.text = t;
      if (te) blk.text_en = te;
      if (key === "text" && !t.trim() && !te.trim()) continue;   // ข้อความพิมพ์เองว่าง = ไม่มีบล็อกนี้
    }
    blocks.push(blk);
  }
  return { blocks: blocks.length ? blocks : DEFAULT_DESC_BLOCKS.map((x) => ({ ...x })) };
}

// ── ข้อมูลจากสินค้า ──
const g = (v: unknown): string => { const n = Number(v); return isFinite(n) ? String(parseFloat(n.toFixed(4))) : "0"; };

function warrantyOf(row: Record<string, unknown>, lang: DescLang): string {
  const w = trim(row.warranty);
  if (!w || w === "ไม่มีรับประกัน") return "";
  return lang === "en"
    ? w.replace(/ปี/g, "year(s)").replace(/เดือน/g, "month(s)").replace(/วัน/g, "day(s)").replace(/ตลอดอายุการใช้งาน/g, "lifetime").trim()
    : w;
}

/** บรรทัดขนาด/น้ำหนัก — ตรรกะเดียวกับสูตรเดิม */
export function sizeLineOf(row: Record<string, unknown>, lang: DescLang): string {
  const width = Number(row.size_length_cm) || 0, height = Number(row.size_height_cm) || 0, thick = Number(row.size_thickness_cm) || 0;
  const customSize = trim(row.custom_size);
  const weightVal = Number(row.weight_g) || 0;
  const weightShow = !!row.show_weight && weightVal > 0;
  const en = lang === "en";
  const productSize = en
    ? (thick ? `${g(width)} x ${g(height)} x ${g(thick)} cm. (W x H x D)` : `${g(width)} x ${g(height)} cm. (W x H)`)
    : (thick ? `${g(width)} x ${g(height)} x ${g(thick)} cm. (กว้าง x สูง x หนา)` : `${g(width)} x ${g(height)} cm. (กว้าง x ยาว)`);
  const weightText = weightShow ? (en ? ` | Weight: ${g(weightVal)} g` : ` | น้ำหนัก: ${g(weightVal)} กรัม`) : "";
  const prefix = en ? "- Size: " : "- ขนาดสินค้า: ";
  if (!(width === 0 && height === 0)) return `${prefix}${productSize}${weightText}`;
  if (customSize) return `${prefix}${customSize}${weightText}`;
  if (weightShow) return en ? `- Weight: ${g(weightVal)} g` : `- น้ำหนัก: ${g(weightVal)} กรัม`;
  return "";
}

/** แทนตัวแทนในข้อความ · ช่องว่างซ้อนในบรรทัดยุบเหลือช่องเดียว (แบรนด์ว่าง) */
export function fillDescText(text: string, row: Record<string, unknown>, lang: DescLang): string {
  const brand = trim(row.brand_name) || trim(row.brand_label);
  const name = lang === "en" ? trim(row.name_en) || trim(row.name_th) : trim(row.name_th);
  return text
    .replace(/\{แบรนด์\}/g, brand).replace(/\{รับประกัน\}/g, warrantyOf(row, lang))
    .replace(/\{รหัส\}/g, trim(row.code)).replace(/\{ชื่อสินค้า\}/g, name)
    .split("\n").map((l) => l.replace(/ {2,}/g, " ").replace(/\s+$/, "")).join("\n");
}

/** ข้อความของบล็อกเดียว ("" = ข้าม) */
export function renderDescBlock(blk: DescBlock, row: Record<string, unknown>, lang: DescLang): string {
  const def = DESC_BLOCK_DEFS[blk.key];
  const en = lang === "en";
  switch (blk.key) {
    case "intro": return s(en ? row.introduction_en : row.introduction).trim();
    case "details": {
      const body = s(en ? row.english_description : row.description).trim();
      if (!body) return "";
      const head = (en ? blk.text_en || def.en : blk.text || def.th) ?? "";
      return head.trim() ? `${head.trim()}\n${body}` : body;
    }
    case "size_desc": return en ? "" : trim(row.size_description);
    case "how_to_size": return en ? "" : trim(row.how_to_size);
    case "special": return en ? "" : trim(row.special_description);
    case "size_line": return sizeLineOf(row, lang);
    case "warranty": if (!warrantyOf(row, lang)) return ""; break;
    default: break;
  }
  // บล็อกข้อความ: ไม่ได้แก้ = ข้อความตั้งต้น · พิมพ์เองที่อังกฤษว่าง = ไม่ใส่ฉบับอังกฤษ
  const raw = en ? (blk.text_en ?? (blk.key === "text" ? "" : def.en ?? "")) : (blk.text ?? def.th ?? "");
  return fillDescText(raw, row, lang).trim();
}

/** ประกอบคำอธิบายตามบล็อก (ไทย/อังกฤษ) */
export function buildDescription(row: Record<string, unknown>, cfg: unknown, lang: DescLang = "th"): string {
  const c = cleanDescBlocks(cfg);
  let out = "";
  for (const blk of c.blocks) {
    if (!blk.on) continue;
    const part = renderDescBlock(blk, row, lang);
    if (!part) continue;
    out = out ? out + (blk.gap === "line" ? "\n" : "\n\n") + part : part;
  }
  return out;
}

/** สรุปสั้น ๆ เช่น "บทนำ → รายละเอียดสินค้า → … (9 บล็อก)" */
export function describeDescBlocks(cfg: unknown): string {
  const on = cleanDescBlocks(cfg).blocks.filter((x) => x.on);
  const names = on.map((x) => DESC_BLOCK_DEFS[x.key].label);
  return `${names.slice(0, 4).join(" → ")}${names.length > 4 ? " → …" : ""} (${on.length} บล็อก)`;
}
