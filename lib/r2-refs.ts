/**
 * ของกลาง — "ไฟล์ R2 นี้ยังมีใครใช้อยู่ไหม?" ก่อนย้ายเข้าถังขยะ
 *
 * ปัญหาที่แก้ (เจอจริง 2026-07-29): SKU TML10-02 รูปแตกเพราะไฟล์ปกถูกย้ายเข้า trash/
 * ตอนที่มีการเปลี่ยน/ลบรูปจากอีกที่หนึ่ง ทั้งที่ทะเบียนของ SKU ยังชี้ไฟล์เดิมอยู่
 * → ไฟล์ R2 หนึ่งไฟล์ถูกอ้างอิงได้หลายที่ (รูปปก Parent/SKU, คลังไฟล์, ไฟล์แนบงาน, ช่องรูปสินค้า)
 *   จึงต้องเช็กก่อนย้ายเข้าถัง ไม่ใช่ย้ายทันทีที่ที่ใดที่หนึ่งเลิกใช้
 *
 * ใช้คู่กับ r2MoveToTrash: ถ้า referenced → ข้ามการย้าย (ปล่อยไฟล์ไว้ ไม่เป็นขยะเพราะยังมีคนใช้)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

/** ที่ที่อ้างอิงไฟล์ R2 ได้ — ตาราง + คอลัมน์ (เรียงจากที่พบบ่อยสุด เพื่อออกเร็ว) */
const REF_COLUMNS: { table: string; column: string }[] = [
  { table: "skus_v2",                  column: "cover_image_r2_key" },
  { table: "parent_skus_v2",           column: "cover_image_r2_key" },
  { table: "assets",                   column: "r2_key" },
  { table: "product_image_slots",      column: "r2_key" },
  { table: "erp_creative_attachments", column: "r2_key" },
  { table: "subtask_submission_assets",column: "r2_key" },
  { table: "erp_creative_board_items", column: "r2_key" },
  { table: "erp_creative_tasks",       column: "cover_image_r2_key" },
  { table: "parent_sku_supply_data",   column: "image_r2_key" },
  { table: "offer_sheet_items",        column: "image_r2_key" },
];

/**
 * ยังมีที่อื่นอ้างอิงไฟล์นี้อยู่ไหม
 * @param exclude ที่ที่ "กำลังเลิกใช้" — ไม่ต้องนับ (เช่นแถวที่เพิ่งเปลี่ยนรูปปก)
 */
export async function r2KeyStillReferenced(
  admin: Admin,
  key: string,
  exclude?: { table: string; id: string },
): Promise<boolean> {
  const k = (key ?? "").trim();
  if (!k) return false;
  for (const ref of REF_COLUMNS) {
    let q = admin.from(ref.table).select("id", { count: "exact", head: true }).eq(ref.column, k);
    if (exclude && exclude.table === ref.table) q = q.neq("id", exclude.id);
    const { count, error } = await q;
    if (error) continue;                 // ตารางไม่มี/สิทธิ์ไม่ถึง → ข้าม ไม่ให้บล็อกการลบ
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

/**
 * แบบหลายคีย์ทีเดียว (ใช้ตอนไล่หาไฟล์กำพร้าทั้งโฟลเดอร์) — คืนชุดคีย์ที่ "ยังมีคนอ้างอิง"
 * @param opts.skipTables ตารางที่ไม่ต้องนับ (เช่น "assets" เมื่อผู้เรียกจะตรวจคลังกลางแยกเองว่ามีที่ใช้จริงไหม)
 */
export async function r2KeysReferencedBatch(
  admin: Admin,
  keys: string[],
  opts?: { skipTables?: string[] },
): Promise<Set<string>> {
  const out = new Set<string>();
  const list = Array.from(new Set(keys.map((k) => (k ?? "").trim()).filter(Boolean)));
  if (!list.length) return out;
  const skip = new Set(opts?.skipTables ?? []);
  for (const ref of REF_COLUMNS) {
    if (skip.has(ref.table)) continue;
    for (let i = 0; i < list.length; i += 150) {
      const chunk = list.slice(i, i + 150);
      const { data, error } = await admin.from(ref.table).select(ref.column).in(ref.column, chunk);
      if (error) break;                  // ตารางไม่มี/สิทธิ์ไม่ถึง → ข้ามตารางนี้
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) { const v = row[ref.column]; if (typeof v === "string") out.add(v); }
    }
  }
  return out;
}
