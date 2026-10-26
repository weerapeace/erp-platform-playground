/**
 * 🗑 หลังเอาแถวรูป/ไฟล์ออกจาก erp_playground_attachments แล้ว (ของกลาง · ฝั่งเซิร์ฟเวอร์)
 *   - รูปแกลเลอรีสินค้า (Parent/SKU) → จดเป็นเวอร์ชันเก่า (🕘 lib/record-versions) = ไฟล์ถูกเก็บไว้ ย้อนคืนได้
 *   - ไฟล์อื่น → ย้ายเข้า trash/ ใน R2 (กู้ได้ 30 วัน) เฉพาะเมื่อไม่มีที่อื่นใช้ไฟล์นี้อยู่ (lib/r2-refs)
 * ใช้ร่วม: DELETE /api/attachments/[id] (ลบทีละรูป) · ย้อนชุดอัป (lib/image-batches → 📂 จัดรูปหลายโฟลเดอร์)
 */
import { r2MoveToTrash, isR2Configured } from "@/lib/r2";
import { r2KeyStillReferenced } from "@/lib/r2-refs";
import { captureImageVersion, VERSIONED_TABLES, type VersionActor } from "@/lib/record-versions";
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
export type RemovedAttachment = {
  entity_type: string | null;
  entity_id: string | null;
  file_name: string | null;
  content_type: string | null;
  sort_order: number | null;
  is_primary: boolean | null;
};

export async function afterAttachmentRemoved(
  admin: Admin,
  args: { id: string; row: RemovedAttachment | null; filePath: string | null; source?: "gallery_delete" } & VersionActor,
): Promise<{ keptAsVersion: boolean; deletedFromR2: boolean; warning: string | null }> {
  const { id, row, filePath } = args;
  let keptAsVersion = false;
  if (filePath && row?.entity_type && row.entity_id && VERSIONED_TABLES.includes(row.entity_type) && String(row.content_type ?? "image/").startsWith("image/")) {
    keptAsVersion = await captureImageVersion(admin, {
      table: row.entity_type, id: row.entity_id, fieldKey: "gallery", r2Key: filePath,
      source: args.source ?? "gallery_delete", actorId: args.actorId ?? null, actorName: args.actorName ?? null, taskId: args.taskId ?? null, subtaskId: args.subtaskId ?? null,
      meta: { attachment_id: id, file_name: row.file_name ?? null, sort_order: row.sort_order ?? null, is_primary: !!row.is_primary },
    });
  }
  // เก็บเป็นเวอร์ชันแล้ว = ไฟล์ต้องอยู่ต่อ (ไม่ใช่ "ไฟล์ถูกใช้ที่อื่น" ไม่ต้องเตือน)
  if (keptAsVersion) return { keptAsVersion, deletedFromR2: false, warning: null };
  if (!filePath) return { keptAsVersion, deletedFromR2: false, warning: "ไม่พบ file_path ใน DB (อาจเป็น record เก่าก่อนใช้ R2)" };
  if (!(await isR2Configured())) return { keptAsVersion, deletedFromR2: false, warning: "ลบ DB แล้วแต่ R2 ยังไม่ได้ตั้งค่า — ไฟล์อาจคงค้างบน R2" };
  try {
    // ไฟล์เดียวกันอาจเป็นรูปปกสินค้า/อยู่ในคลังไฟล์ด้วย — ยังมีคนใช้ = ห้ามย้ายเข้าถัง (ไม่งั้นที่นั่นรูปแตก)
    if (await r2KeyStillReferenced(admin, filePath)) {
      return { keptAsVersion, deletedFromR2: false, warning: "ลบรายการแนบแล้ว — ไฟล์ยังถูกใช้ที่อื่น (เช่นรูปปกสินค้า/คลังไฟล์) จึงไม่ย้ายเข้าถังขยะ" };
    }
    const trashKey = await r2MoveToTrash(filePath);
    console.log("[attachment-remove] R2 moved to trash:", filePath, "→", trashKey);
    return { keptAsVersion, deletedFromR2: true, warning: null };
  } catch (err) {
    console.error("[attachment-remove] R2 trash move failed", filePath, err);
    return { keptAsVersion, deletedFromR2: false, warning: `ลบ DB สำเร็จแต่ย้ายไฟล์เข้าถังเก็บ R2 ไม่สำเร็จ: ${err instanceof Error ? err.message : "unknown"} (path: ${filePath})` };
  }
}
