/**
 * task-images-server — โหลด "สินค้า + รูปทั้งหมดของงาน" จากฐานข้อมูล (ฝั่ง server เท่านั้น)
 * ใช้ร่วม 2 ที่ (กันเขียนดึงข้อมูลซ้ำ):
 *   - GET /api/creative-tasks/[id]/images       ปุ่ม "ดูรูป"
 *   - GET /api/creative-tasks/[id]/quick-check  แผงตรวจสินค้าเร็ว (ขอคอลัมน์เพิ่มผ่าน parentCols / skuCols)
 *
 * Parent ของงาน = Parent หลัก + Parent ที่ผูกเพิ่ม + Parent ของ SKU ที่ผูกงาน (สูงสุด 10)
 * SKU ที่ปิดใช้แล้วไม่นับ · คอนเทนต์ที่ลบ/ยกเลิกแล้วไม่นับ · ประกอบรูปด้วย lib/task-images (pure)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { buildTaskImages, orderTaskParentIds, type TaskContentAtt, type TaskGalleryAtt, type TaskImagesPayload, type TaskUsageRow } from "@/lib/task-images";

type Db = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
export type TaskImagesLoad =
  | { ok: true; data: TaskImagesPayload; parentRows: Row[]; skuRows: Row[] }
  | { ok: false; status: number; error: string };

const ATT_COLS = "id, entity_type, entity_id, file_name, file_path, public_url, content_type, size_bytes, created_at, is_primary";
const USAGE_MODULES = ["parent_sku", "product_sku", "parent_sku_description"];
const none = { data: [] as Row[], error: null };

/** parentCols / skuCols = คอลัมน์เพิ่ม (ขึ้นต้นด้วย ", ") — ห้ามขอต้นทุน (standard_price) ไปแสดงคนทั่วไป */
export async function loadTaskImages(admin: Db, taskId: string, opts: { parentCols?: string; skuCols?: string } = {}): Promise<TaskImagesLoad> {
  const fail = (error: string, status = 500): TaskImagesLoad => ({ ok: false, status, error });

  // 1) งาน + Parent ที่ผูกงาน + คอนเทนต์ของงาน — ดึงพร้อมกัน
  const [tRes, plRes, slRes, cRes] = await Promise.all([
    admin.from("erp_creative_tasks").select("id, parent_sku_id").eq("id", taskId).maybeSingle(),
    admin.from("erp_creative_task_parent_skus").select("parent_sku_id").eq("task_id", taskId),
    admin.from("erp_creative_task_skus").select("sku:skus_v2!sku_id(parent_sku_id)").eq("task_id", taskId),
    admin.from("erp_creative_content").select("id, title, status").eq("task_id", taskId).eq("is_active", true).or("status.is.null,status.neq.cancelled").order("created_at", { ascending: true }),
  ]);
  if (tRes.error) return fail(tRes.error.message);
  const task = tRes.data as { id: string; parent_sku_id: string | null } | null;
  if (!task) return fail("ไม่พบงาน", 404);
  if (plRes.error) return fail(plRes.error.message);
  if (cRes.error) return fail(cRes.error.message);
  const skuParentIds = ((slRes.data ?? []) as { sku: { parent_sku_id: string | null } | { parent_sku_id: string | null }[] | null }[])
    .map((r) => (Array.isArray(r.sku) ? r.sku[0] : r.sku)?.parent_sku_id ?? null);
  const parentIds = orderTaskParentIds(task.parent_sku_id, ((plRes.data ?? []) as { parent_sku_id: string | null }[]).map((r) => r.parent_sku_id), skuParentIds);
  const contents = (cRes.data ?? []) as { id: string; title: string | null; status: string | null }[];

  // 2) ข้อมูลสินค้า + SKU ลูก (ยังใช้งาน) + รูปคอนเทนต์
  const [pRes, sRes, caRes] = await Promise.all([
    parentIds.length ? admin.from("parent_skus_v2").select(`id, code, name_th${opts.parentCols ?? ""}`).in("id", parentIds) : Promise.resolve(none),
    parentIds.length ? admin.from("skus_v2").select(`id, code, parent_sku_id, color_th, color${opts.skuCols ?? ""}`).in("parent_sku_id", parentIds).not("is_active", "is", false).order("code") : Promise.resolve(none),
    contents.length ? admin.from("erp_creative_attachments").select("content_id, r2_key, content_type").in("content_id", contents.map((c) => c.id)).not("r2_key", "is", null).order("created_at", { ascending: true }).limit(500) : Promise.resolve(none),
  ]);
  if (pRes.error) return fail(pRes.error.message);
  if (sRes.error) return fail(sRes.error.message);
  if (caRes.error) return fail(caRes.error.message);
  const parentRows = (pRes.data ?? []) as unknown as Row[];
  const skuRows = (sRes.data ?? []) as unknown as Row[];
  const parents = parentRows as unknown as { id: string; code: string | null; name_th: string | null }[];
  const skus = skuRows as unknown as { id: string; code: string | null; parent_sku_id: string; color_th: string | null; color: string | null }[];

  // 3) รูปสินค้า: แกลเลอรี (erp_playground_attachments) + การผูกในคลัง (asset_usages → assets)
  const entityIds = [...parentIds, ...skus.map((s) => s.id)];
  let atts: TaskGalleryAtt[] = [];
  let usages: TaskUsageRow[] = [];
  if (entityIds.length) {
    const [aRes, uRes] = await Promise.all([
      admin.from("erp_playground_attachments").select(ATT_COLS)
        .in("entity_type", ["parent_skus_v2", "skus_v2"]).in("entity_id", entityIds)
        .order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).order("created_at", { ascending: true })
        .limit(2000),
      admin.from("asset_usages").select("module, record_id, asset_id, sort_order, created_at")
        .in("module", USAGE_MODULES).in("record_id", entityIds)
        .order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true })
        .limit(2000),
    ]);
    if (aRes.error) return fail(aRes.error.message);
    if (uRes.error) return fail(uRes.error.message);
    atts = (aRes.data ?? []) as TaskGalleryAtt[];
    const uses = (uRes.data ?? []) as { module: string; record_id: string; asset_id: string }[];
    const assetIds = [...new Set(uses.map((u) => u.asset_id))];
    if (assetIds.length) {
      const { data: aData, error: aErr } = await admin.from("assets").select("id, r2_key, file_name, content_type, size_bytes, created_at").eq("status", "active").in("id", assetIds);
      if (aErr) return fail(aErr.message);
      const byId = new Map(((aData ?? []) as TaskUsageRow["asset"][]).map((a) => [a.id, a]));
      usages = uses.flatMap((u) => { const a = byId.get(u.asset_id); return a?.r2_key ? [{ module: u.module, record_id: u.record_id, asset: a }] : []; });
    }
  }

  const data = buildTaskImages({ parentIds, parents, skus, atts, usages, contents, contentAtts: (caRes.data ?? []) as unknown as TaskContentAtt[] });
  return { ok: true, data, parentRows, skuRows };
}
