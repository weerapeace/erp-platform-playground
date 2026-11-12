/**
 * record-files — ของกลางสำหรับ "ไฟล์แนบราย record"
 *   ตัวไฟล์เก็บใน Supabase Storage (bucket 'record-files', private) · ทะเบียนไฟล์อยู่ตาราง erp_record_files
 *   ผูกกับ record ผ่าน (entity_type, entity_id) แบบเดียวกับ erp_playground_attachments
 *   ลบ record ถาวร → เรียก deleteRecordFilesFor() ลบไฟล์จริง + ทะเบียนตามไปด้วย (cascade)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const RECORD_FILES_BUCKET = "record-files";
export const RECORD_FILES_SIGNED_TTL = 60 * 60;   // signed URL อายุ 1 ชม.
export const RECORD_FILES_MAX = 50 * 1024 * 1024;  // 50MB/ไฟล์ (ตรงกับ file_size_limit ของ bucket) — อัปตรงเข้า Storage ข้ามลิมิต body ของ Vercel

/**
 * สิทธิ์ของไฟล์แนบ "ตามชนิดรายการ" (entity_type) — ต้องผ่านทุกตัวในลิสต์ (2026-11-07)
 *   ไม่อยู่ในรายการ = สิทธิ์สินค้า products.view / products.edit (แบบเดิม — สินค้า รุ่น สลิปจ่าย PO ฯลฯ)
 *   เอกสารพนักงานเป็นข้อมูลอ่อนไหว → ต้องมีสิทธิ์เข้าแอปเงินเดือนด้วย (กติกาเดียวกับ guardPayroll)
 *   เพิ่มชนิดรายการใหม่ที่ไม่ใช่สินค้า → เพิ่มแถวที่นี่ ไม่งั้นคนที่ทำเอกสารนั้นแต่ไม่มีสิทธิ์สินค้าจะอัปไม่ได้
 * ตรวจฝั่งเซิร์ฟเวอร์ด้วย guardRecordFiles() ใน lib/record-files-auth.ts
 */
export const RECORD_FILE_PERMS: Record<string, { view: string[]; edit: string[] }> = {
  "payroll-employees": { view: ["app.payroll", "employees.view"], edit: ["app.payroll", "employees.edit"] },
  erp_playground_quote: { view: ["qt.view"], edit: ["qt.create"] },      // ใบเสนอราคา
  erp_playground_so: { view: ["so.view"], edit: ["so.create"] },          // ใบสั่งขาย
  team_plan: { view: ["tasks.view"], edit: ["tasks.edit"] },               // แผนงานทีม (รูป/ไฟล์แนบในงาน · lib/team-plan TEAM_PLAN_FILES)
};

export function recordFilePerms(entityType: string, mode: "view" | "edit"): string[] {
  return (RECORD_FILE_PERMS[entityType] ?? { view: ["products.view"], edit: ["products.edit"] })[mode];
}

export type RecordFileRow = {
  id: string; entity_type: string; entity_id: string; bucket: string;
  storage_path: string; file_name: string; content_type: string | null;
  size_bytes: number | null; sort_order: number; uploaded_by: string | null; created_at: string;
};

// ลบไฟล์แนบทั้งหมดของ record (Supabase Storage + แถวทะเบียน) — best-effort, คืนจำนวนไฟล์ที่ลบ
export async function deleteRecordFilesFor(admin: SupabaseClient, entityType: string, entityId: string): Promise<number> {
  const { data } = await admin.from("erp_record_files")
    .select("id, bucket, storage_path").eq("entity_type", entityType).eq("entity_id", entityId);
  const rows = (data ?? []) as { id: string; bucket: string; storage_path: string }[];
  if (!rows.length) return 0;
  // ลบไฟล์จริงจาก Storage (จัดกลุ่มตาม bucket เผื่ออนาคตมีหลาย bucket)
  const byBucket = new Map<string, string[]>();
  for (const r of rows) { const arr = byBucket.get(r.bucket) ?? []; arr.push(r.storage_path); byBucket.set(r.bucket, arr); }
  for (const [bucket, paths] of byBucket) { try { await admin.storage.from(bucket).remove(paths); } catch { /* best-effort */ } }
  // ลบแถวทะเบียน
  await admin.from("erp_record_files").delete().eq("entity_type", entityType).eq("entity_id", entityId);
  return rows.length;
}
