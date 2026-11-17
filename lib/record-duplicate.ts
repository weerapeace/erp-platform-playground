// ============================================================
// record-duplicate — "ทำสำเนา" รายการ (ของกลาง MasterCRUD · pure เทสต์ได้)
// คัดลอกค่าในฟอร์มไปเป็นรายการใหม่ แต่ "เว้นว่าง" ช่องที่ต้องไม่ซ้ำ/เป็นของเฉพาะตัว:
//   id · วันที่สร้าง/แก้ · ผู้สร้าง · รหัส (uniqueKey / code / sku / barcode / employee_code ฯลฯ)
//   ช่องที่ตั้งว่าห้ามซ้ำ (validations "unique") · ช่องคำนวณ · ช่องหลายรายการ (แท็ก — ต้องผูกหลังบันทึก)
//   + excludeKeys ของโมดูล (config.duplicateExcludeKeys)
// ผู้ใช้เห็นฟอร์มก่อนเสมอ ยังไม่บันทึกจนกด "บันทึก" เอง
// ============================================================

export const DUPLICATE_NEVER_COPY = [
  "id", "code", "sku", "sku_code", "barcode", "employee_code", "doc_no", "number", "running_no",
  "created_at", "updated_at", "created_by", "updated_by", "deleted_at", "archived_at",
];

export type DuplicateField = { key: string; type: string; validations?: string[] };

export function buildDuplicateValues(
  form: Record<string, unknown>,
  fields: DuplicateField[],
  opts: { uniqueKey?: string; excludeKeys?: string[] } = {},
): { values: Record<string, unknown>; cleared: string[] } {
  const skip = new Set<string>([...DUPLICATE_NEVER_COPY, ...(opts.excludeKeys ?? [])]);
  if (opts.uniqueKey) skip.add(opts.uniqueKey);
  for (const f of fields) {
    if (f.type === "computed" || f.type === "many2many" || f.type === "one2many") skip.add(f.key);
    if (f.validations?.some((v) => /unique/i.test(v))) skip.add(f.key);
  }
  const fieldKeys = new Set(fields.map((f) => f.key));
  const values: Record<string, unknown> = {};
  const cleared: string[] = [];
  for (const [k, v] of Object.entries(form)) {
    if (skip.has(k)) { if (fieldKeys.has(k) && v != null && v !== "") cleared.push(k); continue; }
    values[k] = v;
  }
  return { values, cleared };
}
