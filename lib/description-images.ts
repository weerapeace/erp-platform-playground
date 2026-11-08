/**
 * รูป "Description" ของ Parent SKU (asset_usages module=parent_sku_description) — เอาออก 1 รูป (ของกลาง ฝั่งเซิร์ฟเวอร์)
 * อ่านไว้ก่อน → ลบการผูก (ไม่ลบไฟล์ในคลัง) → 🕘 เก็บเป็นเวอร์ชันเก่าของ Parent (ย้อนกลับได้) → audit
 * ใช้ร่วม: DELETE /api/assets/description · ย้อนชุดอัป (lib/image-batches → 📂 จัดรูปหลายโฟลเดอร์)
 */
import { writeAudit } from "@/lib/audit";
import { captureImageVersion, type VersionActor } from "@/lib/record-versions";
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
export const DESCRIPTION_MODULE = "parent_sku_description";

/**
 * ผูก asset เข้า Description ของ Parent (มีอยู่แล้ว = ไม่ผูกซ้ำ) — ของกลาง
 * sortOrder = ลำดับที่ต้องการ (ใช้ตอนคืนรูปเดิมจากย้อนชุดอัป) · ไม่ส่ง = ต่อท้าย
 * ใช้ร่วม: POST /api/assets/description · ย้อนชุดอัป (lib/image-batches descReplaced)
 */
export async function linkDescriptionImage(
  admin: Admin,
  args: { parentId: string; assetId: string; sortOrder?: number | null },
): Promise<{ ok: boolean; already: boolean; sortOrder: number | null; error?: string }> {
  const { parentId, assetId } = args;
  // มีอยู่แล้ว? (กันผูกซ้ำ — field null เลยเช็คเองแทน onConflict)
  const { data: ex } = await admin.from("asset_usages").select("id, sort_order")
    .eq("module", DESCRIPTION_MODULE).eq("record_id", parentId).eq("asset_id", assetId).is("field", null).maybeSingle();
  if (ex?.id) return { ok: true, already: true, sortOrder: (ex.sort_order as number | null) ?? null };
  let next = args.sortOrder ?? null;
  if (next == null) {
    const { data: mx } = await admin.from("asset_usages").select("sort_order")
      .eq("module", DESCRIPTION_MODULE).eq("record_id", parentId)
      .order("sort_order", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    next = ((mx?.sort_order as number | null) ?? -1) + 1;
  }
  const { error } = await admin.from("asset_usages").insert({
    asset_id: assetId, module: DESCRIPTION_MODULE, record_id: parentId, record_label: null, field: null, sort_order: next,
  });
  if (error) return { ok: false, already: false, sortOrder: null, error: error.message };
  return { ok: true, already: false, sortOrder: next };
}

export async function removeDescriptionImage(
  admin: Admin,
  args: { parentId: string; assetId: string; source?: "description_image_remove"; auditMeta?: Record<string, unknown> } & VersionActor,
): Promise<{ ok: boolean; removed: boolean; error?: string }> {
  const { parentId, assetId } = args;
  const [{ data: use }, { data: asset }] = await Promise.all([
    admin.from("asset_usages").select("sort_order").eq("module", DESCRIPTION_MODULE).eq("record_id", parentId).eq("asset_id", assetId).is("field", null).maybeSingle(),
    admin.from("assets").select("r2_key, file_name").eq("id", assetId).maybeSingle(),
  ]);
  const { error } = await admin.from("asset_usages").delete().eq("module", DESCRIPTION_MODULE).eq("record_id", parentId).eq("asset_id", assetId).is("field", null);
  if (error) return { ok: false, removed: false, error: error.message };
  if (use && asset?.r2_key) {
    await captureImageVersion(admin, {
      table: "parent_skus_v2", id: parentId, fieldKey: "description_images", r2Key: asset.r2_key as string,
      source: args.source ?? "description_image_remove", actorId: args.actorId ?? null, actorName: args.actorName ?? null, taskId: args.taskId ?? null, subtaskId: args.subtaskId ?? null,
      meta: { asset_id: assetId, file_name: asset.file_name ?? null, sort_order: use.sort_order ?? null },
    });
  }
  await writeAudit(admin, { action: "description_image_remove", entityType: "parent_skus_v2", entityId: parentId, actorId: args.actorId ?? null, actorName: args.actorName ?? null, metadata: { asset_id: assetId, ...(args.auditMeta ?? {}) } });
  return { ok: true, removed: !!use };
}
