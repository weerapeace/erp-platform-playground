/**
 * computed-text.ts — สูตร "ข้อความสำเร็จรูป" สำหรับ computed field ที่ผลลัพธ์เป็นข้อความ
 *
 * ระบบ computed ปกติ (lib/formula) คำนวณได้แค่ตัวเลข — ไฟล์นี้รองรับสูตรที่ให้ผลเป็น "ข้อความ"
 * (มีเงื่อนไข/ต่อสตริง) โดยเก็บเป็น "สูตรตั้งชื่อ" ในโค้ด แล้วให้ field อ้างผ่าน
 *   relation_config = { kind:"computed", text_compute:"<name>" }
 *
 * แต่ละตัวมี describe (คำอธิบายภาษาคน) ไว้โชว์เป็น tooltip
 * บางสูตรตั้งค่าได้ (configurable) — ค่าตั้งอยู่ใน relation_config ของฟิลด์นั้น ส่งเข้ามาเป็น cfg
 */
import { buildNameFromParts, describeNameParts } from "@/lib/name-parts";
import { buildDescription, describeDescBlocks } from "@/lib/desc-blocks";

export type TextComputeDef = {
  label: string;
  describe: string;
  /** cfg = relation_config ของฟิลด์ (สำหรับสูตรที่ตั้งค่าได้) */
  fn: (row: Record<string, unknown>, cfg?: Record<string, unknown> | null) => string;
  /** สูตรที่ตั้งค่าได้: "name_parts" = เลือกชิ้นของชื่อ + เรียงลำดับ (components/name-parts-editor)
   *  "desc_blocks" = คำอธิบายเป็นบล็อก เปิด/ปิด/เรียง/แก้ข้อความ (components/desc-blocks-editor) */
  configurable?: "name_parts" | "desc_blocks";
  /** คำอธิบายตามค่าที่ตั้งจริง (แทน describe) */
  describeCfg?: (cfg?: Record<string, unknown> | null) => string;
};

// ตัดเลข 0 ท้าย (เหมือน Python :g) — 12.0 → "12", 9.7 → "9.7", 2.50 → "2.5"
const g = (v: unknown): string => {
  const n = Number(v);
  return isFinite(n) ? String(parseFloat(n.toFixed(4))) : "0";
};

export const TEXT_COMPUTES: Record<string, TextComputeDef> = {
  // Parent SKU — สรุปขนาด (แปลงจากสูตร Odoo x_studio_parent_sku_size)
  size_summary: {
    label: "สรุปขนาด",
    describe: "รวมขนาดอัตโนมัติจาก กว้าง/สูง/หนา — ถ้ามีความหนา: \"กว้าง x สูง x หนา cm.\" / ถ้าไม่มีความหนา: \"กว้าง x สูง cm.\" (ตัดเลข 0 ท้ายออก)",
    fn: (r) => {
      const k = g(r.size_length_cm);
      const y = g(r.size_height_cm);
      const s = Number(r.size_thickness_cm) || 0;
      return s
        ? `${k} x ${y} x ${g(s)} cm. (กว้าง x สูง x หนา)`
        : `${k} x ${y} cm. (กว้าง x ยาว)`;
    },
  },
};

const trim = (v: unknown): string => String(v ?? "").trim();

// Parent SKU — รายละเอียดแพลตฟอร์ม (แปลงจากสูตร Odoo x_studio_description_platform)
//   ⚙ ตั้งเป็นบล็อกได้ (relation_config.desc_blocks — lib/desc-blocks) · ยังไม่ตั้ง = สูตรเดิมด้านล่างทุกตัวอักษร
TEXT_COMPUTES.platform_description = {
  label: "รายละเอียดแพลตฟอร์ม",
  configurable: "desc_blocks",
  describeCfg: (cfg) => (cfg?.desc_blocks ? `ประกอบจากบล็อก (ตั้งที่ ⚙): ${describeDescBlocks(cfg.desc_blocks)}` : TEXT_COMPUTES.platform_description.describe),
  describe: "ประกอบข้อความขายอัตโนมัติ: บทนำ + รายละเอียดสินค้า + คำอธิบายขนาด/วิธีวัด + ขนาด/น้ำหนัก + คำอธิบายพิเศษ + Notes (รับประกัน) + เงื่อนไขการสั่งซื้อ (ใส่ชื่อแบรนด์ให้) — ดึงจากช่องบนใบ + ตารางเชื่อม (คำอธิบายขนาด/พิเศษ/แบรนด์)",
  fn: (r, cfg) => {
    if (cfg?.desc_blocks) return buildDescription(r, cfg.desc_blocks, "th");
    const intro       = String(r.introduction ?? "");
    const detail      = String(r.description ?? "");
    const customSize  = trim(r.custom_size);
    const productSize = trim(TEXT_COMPUTES.size_summary.fn(r));
    const warranty    = trim(r.warranty);
    const relSizeDesc = trim(r.size_description);
    const howToSize   = trim(r.how_to_size);
    const specialDesc = trim(r.special_description);

    const weightVal  = Number(r.weight_g) || 0;
    const weightShow = !!r.show_weight;
    const weightText = (weightShow && weightVal > 0) ? ` | น้ำหนัก: ${g(weightVal)} กรัม` : "";

    const brand     = trim(r.brand_name) || trim(r.brand_label);
    const brandText = brand ? `${brand} ` : "";

    const width  = Number(r.size_length_cm) || 0;
    const height = Number(r.size_height_cm) || 0;
    const prefix = "\n- ขนาดสินค้า: ";

    let sizeLine = "";
    if (!(width === 0 && height === 0)) sizeLine = `${prefix}${productSize}${weightText}`;
    else if (customSize)               sizeLine = `${prefix}${customSize}${weightText}`;
    else if (weightShow && weightVal > 0) sizeLine = `\n- น้ำหนัก: ${g(weightVal)} กรัม`;

    const warrantyText = (warranty && warranty !== "ไม่มีรับประกัน")
      ? `\n**ระยะเวลารับประกันสินค้า ${warranty}**` : "";

    let extraDesc = "";
    if (relSizeDesc) extraDesc += `\n\n${relSizeDesc}`;
    if (howToSize)   extraDesc += `\n\n${howToSize}`;

    const specialBlock = specialDesc ? `\n\n${specialDesc}` : "";

    return (
      `  ${intro}\n\n` +
      `รายละเอียดสินค้า\n${detail}` +
      `${extraDesc}` +
      `${sizeLine}` +
      `${specialBlock}\n` +
      `\nNotes:` +
      `${warrantyText}\n` +
      `ลูกค้าสามารถเปลี่ยนสินค้าได้ ภายใน 7 วัน หากสินค้าเสียหายโดยเกิดจากกระบวนการผลิต โดยไม่เสียค่าใช้จ่ายเพิ่มเติม\n\n` +
      `.... การสั่งซื้อสินค้าผ่าน ${brandText}Official\n` +
      `1. การจัดส่งสินค้าจะจัดส่ง ทุกวันจันทร์ - วันเสาร์ โดยทางร้านจะตัดยอด ณ.เวลา 08.00 น.ของทุกวัน (หากสั่งสินค้า หลัง 08.00 น. ทางร้านจะจัดส่งให้ในวันถัดไปค่ะ (ไม่รวมวันอาทิตย์))\n` +
      `2. หลังจากลูกค้าโอนเงินจะใช้เวลาในการจัดเตรียมสินค้าประมาณ 1-3 วัน และใช้ระยะเวลาจัดส่ง 2-5 วัน ขึ้นอยู่กับแต่ละบริษัทขนส่ง\n` +
      `3. หากลูกค้ากรอกที่อยู่ผิดหรือเบอร์โทรศัพท์ผิด ทางเราจะไม่สามารถแก้ไขข้อมูลของคุณลูกค้าได้ ต้องรบกวนคุณลูกค้ากดยกเลิกแล้วสั่งเข้ามาใหม่\n` +
      `4. หากสั่งไซส์ผิด ลูกค้าสามารถเปลี่ยนไซส์ได้ (แต่เปลี่ยนแบบไม่ได้) แต่จะมีค่าขนส่งสินค้ากลับไป 50 บาท (ค่าส่งลูกค้าเป็นคนออกเอง)\n\n` +
      `....• อย่าลืม! กดติดตามร้านค้าเพื่อรับโปรโมชั่น และเห็นสินค้าใหม่ก่อนใคร\n` +
      `....• หากมีข้อสงสัยสามารถ ติดต่อสอบถามผ่านช่องทางแชทได้ ทุกวันจันทร์ - เสาร์ ตั้งแต่ 8.00 - 22.00 น. และวันอาทิตย์ 11.00 – 22.00 น.`
    );
  },
};

// Parent SKU — Name Platform = ประกอบจากชิ้นที่ตั้งไว้ (ค่าตั้งต้น ชื่อสินค้า + Code เช่น "Louis Montini (Burning Sand) กระเป๋า... TTM089")
//   ตั้งชิ้น/ลำดับ/ตัวคั่นได้ที่ ⚙ ข้างหัวข้อ (แอดมิน) → relation_config.name_parts · กฎอยู่ที่ lib/name-parts
TEXT_COMPUTES.name_platform_code = {
  label: "ชื่อแพลตฟอร์ม + รหัส",
  describe: "ชื่อสินค้า + รหัส (Code) ต่อท้าย — ใช้ Name Platform ถ้ามี ไม่งั้นใช้ Name Th",
  configurable: "name_parts",
  describeCfg: (cfg) => `ประกอบจาก: ${describeNameParts(cfg?.name_parts)}`,
  fn: (r, cfg) => buildNameFromParts(r, cfg?.name_parts, "th"),
};

// Parent SKU — Name Platform (EN) = ชิ้นชุดเดียวกับฝั่งไทย แต่ชื่อใช้ Name En (ไม่ใช้ AI แปล)
TEXT_COMPUTES.name_platform_code_en = {
  label: "ชื่อแพลตฟอร์ม + รหัส (EN)",
  describe: "Name En + รหัส (Code) ต่อท้าย — เวอร์ชันอังกฤษของ Name Platform (ไม่ต้องแปลด้วย AI)",
  configurable: "name_parts",
  describeCfg: (cfg) => `ประกอบจาก (อังกฤษ): ${describeNameParts(cfg?.name_parts)}`,
  fn: (r, cfg) => buildNameFromParts(r, cfg?.name_parts, "en"),
};

// Parent SKU — รายละเอียดแพลตฟอร์ม (EN): โครงเดียวกับฝั่งไทย แต่หยิบช่องอังกฤษ + ข้อความประจำเป็นอังกฤษ
TEXT_COMPUTES.platform_description_en = {
  label: "รายละเอียดแพลตฟอร์ม (EN)",
  configurable: "desc_blocks",
  describeCfg: (cfg) => (cfg?.desc_blocks ? `ประกอบจากบล็อก (อังกฤษ · ตั้งที่ ⚙): ${describeDescBlocks(cfg.desc_blocks)}` : TEXT_COMPUTES.platform_description_en.describe),
  describe: "เวอร์ชันอังกฤษของ Platform Description — ใช้ Introduction En / English Description + เงื่อนไขการสั่งซื้อฉบับอังกฤษ (ไม่ต้องแปลด้วย AI)",
  fn: (r, cfg) => {
    if (cfg?.desc_blocks) return buildDescription(r, cfg.desc_blocks, "en");
    const intro  = String(r.introduction_en ?? "");
    const detail = String(r.english_description ?? "");
    const customSize  = trim(r.custom_size);
    // ขนาดฉบับอังกฤษ (สูตรไทยมีวงเล็บ "กว้าง x สูง x หนา" ติดมา จึงประกอบเอง)
    const sw = g(r.size_length_cm), sh = g(r.size_height_cm), st = Number(r.size_thickness_cm) || 0;
    const productSize = st
      ? `${sw} x ${sh} x ${g(st)} cm. (W x H x D)`
      : `${sw} x ${sh} cm. (W x H)`;
    // รับประกัน: แปลงหน่วยไทยที่พบบ่อยเป็นอังกฤษ (ข้อมูลกรอกเป็นไทย เช่น "1 ปี")
    const warranty = trim(r.warranty)
      .replace(/ปี/g, "year(s)").replace(/เดือน/g, "month(s)").replace(/วัน/g, "day(s)")
      .replace(/ตลอดอายุการใช้งาน/g, "lifetime").trim();

    const weightVal  = Number(r.weight_g) || 0;
    const weightShow = !!r.show_weight;
    const weightText = (weightShow && weightVal > 0) ? ` | Weight: ${g(weightVal)} g` : "";

    const brand     = trim(r.brand_name) || trim(r.brand_label);
    const brandText = brand ? `${brand} ` : "";

    const width  = Number(r.size_length_cm) || 0;
    const height = Number(r.size_height_cm) || 0;
    const prefix = "\n- Size: ";
    let sizeLine = "";
    if (!(width === 0 && height === 0)) sizeLine = `${prefix}${productSize}${weightText}`;
    else if (customSize)                sizeLine = `${prefix}${customSize}${weightText}`;
    else if (weightShow && weightVal > 0) sizeLine = `\n- Weight: ${g(weightVal)} g`;

    const warrantyText = (warranty && warranty !== "ไม่มีรับประกัน") ? `\n**Warranty: ${warranty}**` : "";

    return (
      `  ${intro}\n\n` +
      `Product details\n${detail}` +
      `${sizeLine}\n` +
      `\nNotes:` +
      `${warrantyText}\n` +
      `Items can be exchanged within 7 days at no extra cost if the defect is caused by the manufacturing process.\n\n` +
      `.... Ordering from ${brandText}Official\n` +
      `1. Orders are shipped Monday–Saturday. Daily cut-off is 08:00 (orders placed after 08:00 ship the next day, excluding Sundays).\n` +
      `2. After payment, please allow 1–3 days for preparation and 2–5 days for delivery, depending on the courier.\n` +
      `3. If the address or phone number is entered incorrectly, we cannot edit it for you — please cancel and place a new order.\n` +
      `4. Wrong size can be exchanged (style cannot be changed); a 50 THB return-shipping fee applies (paid by the customer).\n\n` +
      `....• Follow our shop for promotions and to see new arrivals first.\n` +
      `....• For any questions, chat with us Monday–Saturday 08:00–22:00, Sunday 11:00–22:00.`
    );
  },
};

// China bills — ประเภทบิล: ค่าส่ง / VAT (ISG/IG) / บิลร้านจีน
TEXT_COMPUTES.china_bill_type = {
  label: "ประเภทบิล",
  describe: "แสดง “ค่าส่ง” ถ้าเป็นบิลค่าส่ง · “VAT (ISG/IG)” ถ้าเป็นบิล VAT · ไม่งั้น “บิลร้านจีน”",
  fn: (r) => {
    if (r.is_shipping) return "ค่าส่ง";
    if (r.vat_type) return `VAT (${String(r.vat_type)})`;
    return String(r.supplier_label ?? "บิลร้านจีน");
  },
};

export function computedTextValue(name: string | undefined | null, row: Record<string, unknown>, cfg?: Record<string, unknown> | null): string | null {
  if (!name) return null;
  const def = TEXT_COMPUTES[name];
  return def ? def.fn(row, cfg) : null;
}

export function textComputeDescribe(name: string | undefined | null, cfg?: Record<string, unknown> | null): string | null {
  if (!name) return null;
  const def = TEXT_COMPUTES[name];
  if (!def) return null;
  return def.describeCfg ? def.describeCfg(cfg) : def.describe;
}

/** สูตรนี้ตั้ง "ชิ้นของชื่อ" ได้ไหม (โชว์ปุ่ม ⚙ ข้างหัวข้อ) */
export const isNamePartsCompute = (name: string | undefined | null): boolean => !!name && TEXT_COMPUTES[name]?.configurable === "name_parts";
/** สูตรนี้ตั้งค่าแบบไหนได้ (null = ตั้งไม่ได้) — ใช้เลือกป๊อป ⚙ ที่ตรงชนิด */
export const textComputeConfigKind = (name: string | undefined | null): TextComputeDef["configurable"] | null => (name ? TEXT_COMPUTES[name]?.configurable ?? null : null);
