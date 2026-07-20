/**
 * record-files — ของกลางสำหรับ "ไฟล์แนบราย record"
 *   ตัวไฟล์เก็บใน Supabase Storage (bucket 'record-files', private) · ทะเบียนไฟล์อยู่ตาราง erp_record_files
 *   ผูกกับ record ผ่าน (entity_type, entity_id) แบบเดียวกับ erp_playground_attachments
 *   ลบ record ถาวร → เรียก deleteRecordFilesFor() ลบไฟล์จริง + ทะเบียนตามไปด้วย (cascade)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const RECORD_FILES_BUCKET = "record-files";
export const RECORD_FILES_SIGNED_TTL = 60 * 60;   // signed URL อายุ 1 ชม.
export const RECORD_FILES_MAX = 25 * 1024 * 1024;  // 25MB/ไฟล์ (ตรงกับ file_size_limit ของ bucket)

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
