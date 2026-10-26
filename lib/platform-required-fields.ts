// ============================================================
// ฟิลด์จำเป็นต่อแพลตฟอร์ม (ของกลาง) — ใช้ทำ checklist "พร้อมส่งขึ้นแพลตฟอร์มนี้ไหม"
// LINE SHOPPING (ตามที่ API จริงบังคับ) · LAZADA (เกณฑ์ทั่วไปของ Lazada — ยืนยันกับระบบจริงตอนเชื่อมร้าน)
// แพลตฟอร์มที่ยังไม่นิยาม → ใช้ชุดทั่วไป · อนาคต: ย้ายเป็นตั้งค่าได้เอง (เก็บ DB)
// ============================================================

export type ReqCtx = {
  title: string;
  description: string;
  category: string;       // หมวดหมู่ปลายทางที่กรอก
  imagesToSend: number;   // จำนวนรูปที่เลือกส่ง
  variantCount: number;   // จำนวน SKU/สี
  allHavePrice: boolean;  // ทุก SKU มีราคา
  allHaveImage: boolean;  // ทุก SKU มีรูป
  // ช่องเสริม (ไม่บังคับส่ง — ใช้กับแพลตฟอร์มที่ต้องการ เช่น Lazada)
  weightKg?: number | null;       // น้ำหนักพัสดุ (กก.)
  boxComplete?: boolean;          // มีกว้าง/ยาว/สูง ครบ
  brand?: string;                 // แบรนด์บนร้าน
  duplicateVariants?: string[];   // ชื่อตัวเลือกที่ซ้ำกัน (ลูกค้าแยกไม่ออก)
  oddSkuCodes?: string[];         // รหัส SKU ที่มีเครื่องหมายพิเศษ (เช่น * / #)
};
/** required=true ไม่ผ่าน = ลงไม่ได้ · required=false ไม่ผ่าน = แนะนำให้แก้ · note = รายละเอียดภาษาคน */
export type ReqCheck = { ok: boolean; label: string; required: boolean; note?: string };

type Spec = { label: string; maxImages: number; maxTitle?: number; build: (c: ReqCtx) => ReqCheck[] };

const sample = (list: string[] | undefined, n = 3) => (list ?? []).slice(0, n).join(", ") + ((list?.length ?? 0) > n ? ` และอีก ${(list?.length ?? 0) - n}` : "");

// LINE SHOPPING — required ตาม Product API (name, category, image, ราคา/ตัวเลือก)
const LINE: Spec = {
  label: "LINE SHOPPING",
  maxImages: 7,
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

// LAZADA — เกณฑ์ทั่วไปของ Lazada (ชื่อ ≤ 255 · รูป 1–8 · หมวดต้องเป็นรหัสหมวด · พัสดุบังคับ)
const LAZADA: Spec = {
  label: "Lazada",
  maxImages: 8,
  maxTitle: 255,
  build: (c) => {
    const title = c.title.trim();
    const dup = c.duplicateVariants ?? [];
    const odd = c.oddSkuCodes ?? [];
    return [
      { ok: !!title && title.length <= 255, label: "ชื่อสินค้า", required: true,
        note: !title ? "ยังไม่มีชื่อ" : title.length > 255 ? `ยาว ${title.length} ตัวอักษร (Lazada รับไม่เกิน 255)` : undefined },
      { ok: /^\s*\d+/.test(c.category), label: "หมวด Lazada", required: true,
        note: c.category.trim() ? (/^\s*\d+/.test(c.category) ? undefined : "ต้องเป็นหมวดจากรายการของ Lazada (มีรหัสหมวด)") : "ยังไม่ได้เลือก — ตั้งหมวดกลางแล้วจับคู่กับ Lazada" },
      { ok: c.imagesToSend >= 1 && c.imagesToSend <= 8, label: "รูปสินค้า 1–8 รูป", required: true,
        note: c.imagesToSend === 0 ? "ยังไม่มีรูป" : c.imagesToSend > 8 ? `เลือกไว้ ${c.imagesToSend} รูป (Lazada รับไม่เกิน 8)` : undefined },
      { ok: c.variantCount > 0, label: "มีตัวเลือก/SKU ≥ 1", required: true },
      { ok: dup.length === 0, label: "ชื่อตัวเลือกไม่ซ้ำกัน", required: true,
        note: dup.length ? `ซ้ำ ${dup.length} ชื่อ: ${sample(dup)} — เพิ่มมิติที่ 2 (ปุ่ม 🧬 หลายชั้น)` : undefined },
      { ok: c.allHavePrice, label: "ทุกตัวเลือกมีราคา", required: true },
      { ok: (c.weightKg ?? 0) > 0, label: "น้ำหนักพัสดุ", required: true, note: (c.weightKg ?? 0) > 0 ? undefined : "ยังไม่ได้ใส่น้ำหนัก (แก้ที่หน้าสินค้า)" },
      { ok: !!c.boxComplete, label: "ขนาดกล่องพัสดุ", required: true, note: c.boxComplete ? undefined : "ยังไม่ได้เลือกขนาดกล่อง (แก้ที่หน้าสินค้า)" },
      { ok: !!(c.brand ?? "").trim(), label: "แบรนด์", required: false, note: (c.brand ?? "").trim() ? undefined : "ไม่ระบุ = ใช้ No Brand" },
      { ok: !!c.description.trim(), label: "รายละเอียดสินค้า", required: false },
      { ok: c.allHaveImage, label: "ทุกตัวเลือกมีรูป", required: false },
      { ok: odd.length === 0, label: "รหัส SKU ไม่มีเครื่องหมายพิเศษ", required: false,
        note: odd.length ? `${odd.length} รหัสมีเครื่องหมาย เช่น ${sample(odd, 2)} — ต้องทดสอบว่า Lazada รับไหม` : undefined },
    ];
  },
};

// ชุดทั่วไป (แพลตฟอร์มที่ยังไม่ได้นิยามเฉพาะ) — เท่าพฤติกรรมเดิม
const GENERIC: Spec = {
  label: "ทั่วไป",
  maxImages: 9,
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

const SPECS: Record<string, Spec> = { line_shopping: LINE, lazada: LAZADA };

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
