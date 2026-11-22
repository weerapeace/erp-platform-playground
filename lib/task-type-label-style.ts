/**
 * สไตล์ป้ายประเภทงาน (ตัวหนา/ขนาด) — เก็บที่ erp_task_types.label_style (jsonb)
 * ใช้ร่วม: API /api/creative-options · ชิปประเภทงาน (app/tasks/task-type-chip) · หน้าตั้งค่าประเภทงาน
 * null / ค่าแปลก = หน้าตาเดิม (ตัวกลาง 10px) · pure ใช้ได้ทั้ง server/client
 */
export type LabelWeight = 400 | 500 | 600 | 700;
export type LabelSize = "sm" | "md" | "lg";
export type TaskTypeLabelStyle = { weight?: LabelWeight; size?: LabelSize };

const WEIGHTS: LabelWeight[] = [400, 500, 600, 700];
const SIZES: LabelSize[] = ["sm", "md", "lg"];

/** กรองค่าที่มาจากฐานข้อมูล/ฟอร์ม → เหลือเฉพาะค่าที่รู้จัก · ไม่มีอะไรเหลือ = null */
export function cleanLabelStyle(v: unknown): TaskTypeLabelStyle | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out: TaskTypeLabelStyle = {};
  const w = Number(o.weight);
  if (WEIGHTS.includes(w as LabelWeight)) out.weight = w as LabelWeight;
  if (SIZES.includes(o.size as LabelSize)) out.size = o.size as LabelSize;
  return Object.keys(out).length ? out : null;
}

/** ขนาดตัวอักษรของป้าย (px) — ค่าเริ่ม md = 10px ตามชิปเดิม */
export const LABEL_SIZE_PX: Record<LabelSize, number> = { sm: 9, md: 10, lg: 12 };

/** style สำหรับตัวหนังสือในชิป · null = ใช้ค่าเริ่มต้นของชิป */
export function labelTextStyle(s: TaskTypeLabelStyle | null | undefined): { fontWeight?: number; fontSize?: number } | undefined {
  if (!s) return undefined;
  const out: { fontWeight?: number; fontSize?: number } = {};
  if (s.weight) out.fontWeight = s.weight;
  if (s.size) out.fontSize = LABEL_SIZE_PX[s.size];
  return Object.keys(out).length ? out : undefined;
}

export const LABEL_WEIGHT_OPTIONS: { value: LabelWeight; th: string; en: string }[] = [
  { value: 400, th: "ปกติ", en: "Regular" }, { value: 500, th: "กลาง", en: "Medium" }, { value: 600, th: "หนา", en: "Semibold" }, { value: 700, th: "หนามาก", en: "Bold" },
];
export const LABEL_SIZE_OPTIONS: { value: LabelSize; th: string; en: string }[] = [
  { value: "sm", th: "เล็ก", en: "Small" }, { value: "md", th: "กลาง", en: "Medium" }, { value: "lg", th: "ใหญ่", en: "Large" },
];
