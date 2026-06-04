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

export function computedTextValue(name: string | undefined | null, row: Record<string, unknown>): string | null {
  if (!name) return null;
  const def = TEXT_COMPUTES[name];
  return def ? def.fn(row) : null;
}

export function textComputeDescribe(name: string | undefined | null): string | null {
  if (!name) return null;
  return TEXT_COMPUTES[name]?.describe ?? null;
}
