// ============================================================
// ฟิลด์จำเป็นต่อแพลตฟอร์ม (ของกลาง) — ใช้ทำ checklist "พร้อมส่งขึ้นแพลตฟอร์มนี้ไหม"
// เริ่มจาก LINE SHOPPING (ตามที่ API จริงบังคับ) · แพลตฟอร์มที่ยังไม่นิยาม → ใช้ชุดทั่วไป
// อนาคต: ย้ายเป็นตั้งค่าได้เอง (เก็บ DB) — โครงนี้ทำให้ต่อยอดง่าย
// ============================================================

export type ReqCtx = {
  title: string;
  description: string;
  category: string;       // หมวดหมู่ปลายทางที่กรอก
  imagesToSend: number;   // จำนวนรูปที่เลือกส่ง
  variantCount: number;   // จำนวน SKU/สี
  allHavePrice: boolean;  // ทุก SKU มีราคา
  allHaveImage: boolean;  // ทุก SKU มีรูป
};
export type ReqCheck = { ok: boolean; label: string; required: boolean };

type Spec = { label: string; build: (c: ReqCtx) => ReqCheck[] };

// LINE SHOPPING — required ตาม Product API (name, category, image, ราคา/ตัวเลือก)
const LINE: Spec = {
  label: "LINE SHOPPING",
  build: (c) => [
    { ok: !!c.title.trim(), label: "ชื่อสินค้า", required: true },
    { ok: !!c.category.trim(), label: "หมวดหมู่ปลายทาง", required: true },
    { ok: c.imagesToSend > 0, label: "รูปสินค้า ≥ 1 (ภาพปก)", required: true },
    { ok: c.variantCount > 0, label: "มีตัวเลือก/SKU ≥ 1", required: true },
    { ok: c.allHavePrice, label: "ทุก SKU มีราคา", required: true },
    { ok: !!c.description.trim(), label: "รายละเอียดสินค้า", required: false },
    { ok: c.allHaveImage, label: "ทุก SKU มีรูป", required: false },
  ],
};

// ชุดทั่วไป (แพลตฟอร์มที่ยังไม่ได้นิยามเฉพาะ) — เท่าพฤติกรรมเดิม
const GENERIC: Spec = {
  label: "ทั่วไป",
  build: (c) => [
    { ok: !!c.title.trim(), label: "มีชื่อสินค้าบนแพลตฟอร์มนี้", required: true },
    { ok: !!c.description.trim(), label: "มีรายละเอียดสินค้า", required: true },
    { ok: c.variantCount > 0, label: "มี SKU/สี อย่างน้อย 1 รายการ", required: true },
    { ok: c.allHavePrice, label: "SKU ทุกตัวมีราคา", required: true },
    { ok: c.allHaveImage, label: "SKU ทุกตัวมีรูป", required: true },
    { ok: !!c.category.trim(), label: "เลือกหมวดหมู่ปลายทาง", required: true },
    { ok: c.imagesToSend > 0, label: "เลือกรูปส่งไปแพลตฟอร์ม ≥ 1", required: true },
  ],
};

const SPECS: Record<string, Spec> = { line_shopping: LINE };

export function requiredSpec(platformCode: string): Spec {
  return SPECS[platformCode] ?? GENERIC;
}
// รายการเช็ก (ทั้งบังคับ + แนะนำ)
export function requiredChecks(platformCode: string, c: ReqCtx): ReqCheck[] {
  return requiredSpec(platformCode).build(c);
}
// พร้อมส่งไหม = ผ่านทุกข้อที่ "บังคับ"
export function isReadyForPlatform(platformCode: string, c: ReqCtx): boolean {
  return requiredChecks(platformCode, c).every((x) => !x.required || x.ok);
}
