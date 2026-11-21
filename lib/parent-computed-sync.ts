/**
 * ช่องคำนวณของ Parent SKU ที่ "เขียนค่าล่าสุดลงคอลัมน์" — ส่วนคิด (ไม่แตะฐานข้อมูล · เทสต์ได้)
 *
 * ทำไม (เจ้าของสั่ง "แก้ที่ต้นทาง" 2026-11-21):
 *   ป๊อป Parent SKU คำนวณ Platform Description / สรุปขนาด "สด" (lib/computed-text + บล็อก ⚙) แต่ไม่เคยเขียนกลับคอลัมน์
 *   → คอลัมน์เป็นข้อความเก่าจาก Odoo (LY22 ยังมีข้อความของ Larkspur #21) · หน้าลง LINE/TikTok · ตัวเตรียมร่าง · เช็กข้ามร้าน · เว็บร้าน อ่านคอลัมน์ = ได้ของเก่า
 *   แก้: ระบบเขียนค่าที่คำนวณได้ลงคอลัมน์ให้ตรงกับป๊อปเสมอ (ตอนบันทึก Parent SKU + รอบทุกคืน + เติมย้อนหลัง) — lib/parent-computed-sync-server
 *
 * กติกา:
 *   - ค่าที่คำนวณได้ "ว่าง" → ไม่ลบข้อความเดิม (ไม่ทำให้หน้าไหนรายละเอียดหาย) แค่นับไว้
 *     "ว่างแบบมีตัวอักษร" ก็นับว่าว่าง: สรุปขนาดของสินค้าที่ไม่มีขนาด = "0 x 0 cm." (ลองดูจริง 2026-11-21: 149 รุ่น · 111 รุ่นคอลัมน์มีขนาดจาก Odoo อยู่ → ห้ามทับ)
 *   - ตัดช่องว่าง/บรรทัดว่างหัว-ท้าย (สูตรขึ้นต้นด้วย "  " ทุกรุ่น — Odoo เก็บแบบตัดแล้ว) · เทียบแบบไม่สนขึ้นบรรทัด \r\n/\n · ช่องว่างล้วน = ว่าง
 *   - ชื่อบนแพลตฟอร์ม (name_platform) / ช่อง EN ยังไม่เขียน: คอลัมน์ว่างเกือบทุกตัว (ไม่มีค่าเก่าค้าง) และถ้าเขียน = ชื่อ/ข้อความ EN บนร้าน/เว็บเปลี่ยน → ต้องให้เจ้าของตัดสินก่อน
 */

/** ชื่อสูตรคำนวณที่เขียนลงคอลัมน์ (ทะเบียนช่อง: relation_config.text_compute) — คอลัมน์ไทยของช่องนั้นเท่านั้น */
export const SYNCED_PARENT_COMPUTES = ["platform_description", "size_summary"] as const;

export type ComputedSyncField = { column: string; old: string | null; new: string };
export type ComputedSyncChange = { id: string; code: string; fields: ComputedSyncField[] };
export type ComputedSyncPlan = {
  /** จำนวน Parent ที่คำนวณได้และเทียบแล้ว */
  checked: number;
  changes: ComputedSyncChange[];
  /** คำนวณได้ค่าว่างแต่คอลัมน์มีข้อความ → คงข้อความเดิมไว้ (นับเป็นช่อง) */
  keptBlank: number;
  /** จำนวน Parent ที่เปลี่ยน แยกตามคอลัมน์ */
  byField: Record<string, number>;
};

/** ค่าที่ใช้เทียบ + ค่าที่เขียน: null/ช่องว่างล้วน = null · \r\n → \n · ตัดช่องว่างหัว-ท้าย */
export function canonText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\r\n?/g, "\n").trim();
  return s ? s : null;
}

/** ค่าคำนวณที่ "มีตัวอักษรแต่ไม่มีข้อมูลจริง" ต่อคอลัมน์ → ถือว่าว่าง (ไม่เขียน · ไม่ลบของเดิม) */
const BLANK_LIKE: Record<string, RegExp> = {
  size_summary: /^0 x 0 cm\./,   // ไม่มีกว้าง/สูง → สูตรได้ "0 x 0 cm. (กว้าง x ยาว)"
};
export function computedValueOf(column: string, v: unknown): string | null {
  const s = canonText(v);
  return s !== null && BLANK_LIKE[column]?.test(s) ? null : s;
}

/**
 * เทียบคอลัมน์ที่เก็บไว้ (stored) กับค่าที่คำนวณได้ (computed[id][column]) → รายการที่ต้องเขียน
 * Parent ที่ไม่มีใน computed (คำนวณไม่ได้) = ข้าม ไม่นับ
 */
export function planParentComputedSync(
  stored: ReadonlyArray<Record<string, unknown> & { id: string; code?: unknown }>,
  computed: Record<string, Record<string, string | null>>,
  columns: readonly string[],
): ComputedSyncPlan {
  const plan: ComputedSyncPlan = { checked: 0, changes: [], keptBlank: 0, byField: {} };
  for (const row of stored) {
    const comp = computed[row.id];
    if (!comp) continue;
    plan.checked++;
    const fields: ComputedSyncField[] = [];
    for (const col of columns) {
      if (!(col in comp)) continue;
      const next = computedValueOf(col, comp[col]);
      const prev = canonText(row[col]);
      if (next === null) { if (prev !== null) plan.keptBlank++; continue; }
      if (next === prev) continue;
      fields.push({ column: col, old: prev, new: next });
      plan.byField[col] = (plan.byField[col] ?? 0) + 1;
    }
    if (fields.length) plan.changes.push({ id: row.id, code: String(row.code ?? ""), fields });
  }
  return plan;
}

/** ตัดข้อความยาวไว้โชว์ตัวอย่าง (ผลลองดูก่อนเขียน) */
export function previewText(s: string | null, max = 160): string | null {
  if (s === null) return null;
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}
