/**
 * computed-text.ts — สูตร "ข้อความสำเร็จรูป" สำหรับ computed field ที่ผลลัพธ์เป็นข้อความ
 *
 * ระบบ computed ปกติ (lib/formula) คำนวณได้แค่ตัวเลข — ไฟล์นี้รองรับสูตรที่ให้ผลเป็น "ข้อความ"
 * (มีเงื่อนไข/ต่อสตริง) โดยเก็บเป็น "สูตรตั้งชื่อ" ในโค้ด แล้วให้ field อ้างผ่าน
 *   relation_config = { kind:"computed", text_compute:"<name>" }
 *
 * แต่ละตัวมี describe (คำอธิบายภาษาคน) ไว้โชว์เป็น tooltip
 */

export type TextComputeDef = {
  label: string;
  describe: string;
  fn: (row: Record<string, unknown>) => string;
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
TEXT_COMPUTES.platform_description = {
  label: "รายละเอียดแพลตฟอร์ม",
  describe: "ประกอบข้อความขายอัตโนมัติ: บทนำ + รายละเอียดสินค้า + คำอธิบายขนาด/วิธีวัด + ขนาด/น้ำหนัก + คำอธิบายพิเศษ + Notes (รับประกัน) + เงื่อนไขการสั่งซื้อ (ใส่ชื่อแบรนด์ให้) — ดึงจากช่องบนใบ + ตารางเชื่อม (คำอธิบายขนาด/พิเศษ/แบรนด์)",
  fn: (r) => {
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

// Parent SKU — Name Platform = ชื่อสินค้า + Code  (เช่น "Louis Montini (Burning Sand) กระเป๋า... TTM089")
TEXT_COMPUTES.name_platform_code = {
  label: "ชื่อแพลตฟอร์ม + รหัส",
  describe: "ชื่อสินค้า + รหัส (Code) ต่อท้าย — ใช้ Name Platform ถ้ามี ไม่งั้นใช้ Name Th",
  fn: (r) => {
    const base = trim(r.name_platform) || trim(r.name_th);
    const code = trim(r.code);
    return [base, code].filter(Boolean).join(" ");
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

export function computedTextValue(name: string | undefined | null, row: Record<string, unknown>): string | null {
  if (!name) return null;
  const def = TEXT_COMPUTES[name];
  return def ? def.fn(row) : null;
}

export function textComputeDescribe(name: string | undefined | null): string | null {
  if (!name) return null;
  return TEXT_COMPUTES[name]?.describe ?? null;
}
