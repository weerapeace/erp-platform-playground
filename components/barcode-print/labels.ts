/**
 * ค่ากลางของระบบพิมพ์บาร์โค้ด/QR (ใช้ร่วมทั้ง modal ตั้งค่า + หน้าพิมพ์)
 * เฟส 1: เลย์เอาต์ A4 สำเร็จรูป (กระดาษ 210 × 297 mm) — ช่องขนาดคำนวณจาก cols/rows อัตโนมัติ
 */
export type LabelPreset = {
  key: string;
  label: string;      // ชื่อโชว์ใน dropdown
  cols: number;
  rows: number;
  gap: number;        // ระยะห่างระหว่างดวง (mm)
  margin: number;     // ขอบกระดาษ (mm)
  codeH: number;      // ความสูงของ QR/บาร์โค้ด (mm)
  font: number;       // ขนาดตัวอักษรใต้โค้ด (pt)
};

// A4 = 210 × 297 mm — ต่อแผ่นได้ cols × rows ดวง (ช่อง = พื้นที่กระดาษหารเท่า ๆ กัน)
export const LABEL_PRESETS: LabelPreset[] = [
  { key: "a4-2x7",  label: "A4 · 2×7 = 14 ดวง/แผ่น (ป้ายใหญ่ ~99×38mm)", cols: 2, rows: 7,  gap: 2,   margin: 8, codeH: 20, font: 8 },
  { key: "a4-3x8",  label: "A4 · 3×8 = 24 ดวง/แผ่น (~63×34mm)",           cols: 3, rows: 8,  gap: 2,   margin: 8, codeH: 16, font: 7 },
  { key: "a4-4x10", label: "A4 · 4×10 = 40 ดวง/แผ่น (~48×26mm)",          cols: 4, rows: 10, gap: 1.5, margin: 8, codeH: 12, font: 6 },
  { key: "a4-5x13", label: "A4 · 5×13 = 65 ดวง/แผ่น (ป้ายเล็ก ~38×20mm)", cols: 5, rows: 13, gap: 1,   margin: 6, codeH: 10, font: 5.5 },
];

export const getPreset = (key: string): LabelPreset =>
  LABEL_PRESETS.find((p) => p.key === key) ?? LABEL_PRESETS[1];

// เฟส 2: เลย์เอาต์กำหนดเอง — ขนาดสติ๊กเกอร์/ต่อแถว/ระยะขอบ + โหมด A4 หรือ Roll
export type CustomLayout = {
  mode: "a4" | "roll";
  labelW: number; labelH: number;                          // ขนาดสติ๊กเกอร์ (mm)
  cols: number;                                            // จำนวนต่อแถว
  gapX: number; gapY: number;                              // ช่องไฟระหว่างดวง (mm)
  mTop: number; mBottom: number; mLeft: number; mRight: number;  // ระยะขอบ (mm)
  rollWidth: number;                                       // ความกว้าง roll (mm) — ใช้เมื่อ mode = roll
};

export const DEFAULT_CUSTOM: CustomLayout = {
  mode: "a4", labelW: 50, labelH: 30, cols: 3, gapX: 2, gapY: 2,
  mTop: 8, mBottom: 8, mLeft: 8, mRight: 8, rollWidth: 100,
};

// ขนาด QR/บาร์โค้ด + ฟอนต์ อัตโนมัติจากความสูงสติ๊กเกอร์ (เลย์เอาต์กำหนดเอง)
export function autoCodeMetrics(labelH: number): { codeH: number; font: number } {
  return {
    codeH: Math.max(6, Math.min(labelH * 0.55, 32)),
    font: Math.max(4, Math.min(labelH * 0.20, 10)),
  };
}

export type SavedTemplate = { name: string; layout: CustomLayout };
export const LAYOUT_TEMPLATES_KEY = "barcode_layout_templates";   // localStorage — แม่แบบเลย์เอาต์ที่บันทึกไว้

export type PrintOpts = {
  showQR: boolean;
  showBarcode: boolean;    // Code128 (สแกนรหัส SKU ที่เป็นตัวอักษรได้)
  showCode: boolean;
  showName: boolean;
  showPrice: boolean;
  preset: string;
  custom: CustomLayout | null;   // ถ้าไม่ null = ใช้เลย์เอาต์กำหนดเอง (แทน preset)
  // เฟส 3
  logoMode: "none" | "single" | "brand";   // ไม่มี / อัปโหลดเดียว / ตามแบรนด์อัตโนมัติ
  logo: string | null;     // data URL โลโก้กลาง QR (ใช้เมื่อ logoMode = single)
  codeColor: string;       // สีของ QR + บาร์โค้ด (default ดำ)
  showBorder: boolean;     // แสดงเส้นตัด (ขอบดวง)
};

export type PrintItem = { code: string; barcode: string; name: string; price: number | null; qty: number; brandLogo?: string | null };
export type PrintPayload = { items: PrintItem[]; opts: PrintOpts };

export const PRINT_PAYLOAD_KEY = "barcode_print_payload";   // sessionStorage — ส่ง payload ไปหน้าพิมพ์
export const QR_LOGO_KEY = "barcode_qr_logo";                // localStorage — จำโลโก้ล่าสุด
export const MAX_LABELS = 2000;                              // เพดานกันพิมพ์เยอะเกินจนค้าง
