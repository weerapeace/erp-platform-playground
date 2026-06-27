/**
 * GET /api/assets/brand-tree  — มุมมอง "ดูตามแบรนด์" ของคลังไฟล์
 *   ?mode=brands                 → รายการแบรนด์ที่มีรูป (+ จำนวน)
 *   ?mode=parents&brand_id=      → Parent SKU ในแบรนด์ (เฉพาะที่มีรูป) + จำนวนต่อโฟลเดอร์  (brand_id ว่าง/none = ไม่ระบุแบรนด์)
 *   ?mode=parent&parent_id=      → รายละเอียด 1 Parent: รูป Parent + โฟลเดอร์ SKUs (ย่อยราย SKU) + Description
 *
 * รูปผูกสินค้าผ่าน asset_usages (ของเดิม) — ไม่ดึงไฟล์ใหม่ · ของกลาง guardApi/supabaseAdmin/buildRow
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildRow, loadTags, loadUsageCounts, type AssetRow } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;

// asset_ids (เรียงลำดับมาแล้ว) → AssetRow[] คงลำดับเดิม (เฟส 2 จะใช้ sort_order)
async function rowsByIds(admin: Admin, orderedIds: string[]): Promise<AssetRow[]> {
  const ids = [...new Set(orderedIds)];
  if (ids.length === 0) return [];
  const { data } = await admin.from("assets").select("*").in("id", ids).eq("status", "active");
  const rows = (data ?? []) as Parameters<typeof buildRow>[0][];
  const tagsBy = await loadTags(admin, ids);
  const useBy = await loadUsageCounts(admin, ids);
  const map = new Map(rows.map((r) => [r.id, buildRow(r, tagsBy.get(r.id) ?? [], useBy.get(r.id) ?? 0)]));
  return orderedIds.map((id) => map.get(id)).filter((x): x is AssetRow => !!x);
}

// asset_ids ที่ผูกกับ (module, record_id) เรียงตาม sort_order (null ไปท้าย) แล้ว created_at
async function usageIds(admin: Admin, module: string, recordId: string): Promise<string[]> {
  const { data } = await admin.from("asset_usages").select("asset_id, sort_order, created_at")
    .eq("module", module).eq("record_id", recordId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  return (data ?? []).map((u) => (u as { asset_id: string }).asset_id);
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const mode = sp.get("mode") ?? "brands";
  const admin = supabaseAdmin();

  if (mode === "brands") {
    const { data, error } = await admin.rpc("erp_artwork_brands");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // cache สั้น (เปลี่ยนไม่บ่อย) → สลับกลับเข้ามุมมองไม่ต้องนับใหม่ทุกครั้ง
    return NextResponse.json({ brands: data ?? [], error: null }, { headers: { "Cache-Control": "private, max-age=60" } });
  }

  if (mode === "parents") {
    const raw = sp.get("brand_id");
    const brandId = raw && raw !== "none" ? raw : null;
    const { data, error } = await admin.rpc("erp_artwork_parents", { p_brand_id: brandId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ parents: data ?? [], error: null });
  }

  if (mode === "parent") {
    const parentId = sp.get("parent_id");
    if (!parentId) return NextResponse.json({ error: "missing parent_id" }, { status: 400 });

    // นับรูปต่อ SKU (lazy — ไม่ดึงรูป SKU พร้อมกัน, โหลดตอนกางโฟลเดอร์ผ่าน mode=sku)
    const skuCounts = async () => {
      const { data: skus } = await admin.from("skus_v2").select("id, code, name_th").eq("parent_sku_id", parentId).order("code");
      const skuList = (skus ?? []) as { id: string; code: string; name_th: string | null }[];
      const skuIds = skuList.map((s) => s.id);
      const { data: su } = skuIds.length
        ? await admin.from("asset_usages").select("record_id").eq("module", "product_sku").in("record_id", skuIds)
        : { data: [] };
      const cnt = new Map<string, number>();
      for (const u of (su ?? []) as { record_id: string }[]) cnt.set(u.record_id, (cnt.get(u.record_id) ?? 0) + 1);
      return skuList.map((s) => ({ id: s.id, code: s.code, name: s.name_th ?? "", img_count: cnt.get(s.id) ?? 0 })).filter((s) => s.img_count > 0);
    };

    // ดึงขนาน: ข้อมูล parent + รูป Parent + นับ SKU + รูป Description
    const [p, parentImages, skus, description] = await Promise.all([
      admin.from("parent_skus_v2").select("id, code, name_th").eq("id", parentId).maybeSingle().then((r) => r.data),
      usageIds(admin, "parent_sku", parentId).then((ids) => rowsByIds(admin, ids)),
      skuCounts(),
      usageIds(admin, "parent_sku_description", parentId).then((ids) => rowsByIds(admin, ids)),
    ]);

    return NextResponse.json({
      parent: p ? { id: p.id, code: p.code, name: (p.name_th as string) ?? "" } : null,
      parentImages, skus, description, error: null,
    });
  }

  if (mode === "sku") {
    const skuId = sp.get("sku_id");
    if (!skuId) return NextResponse.json({ error: "missing sku_id" }, { status: 400 });
    const images = await rowsByIds(admin, await usageIds(admin, "product_sku", skuId));
    return NextResponse.json({ images, error: null });
  }

  return NextResponse.json({ error: "bad mode" }, { status: 400 });
}

// ---- POST: บันทึกลำดับรูปในโฟลเดอร์ (per module + record_id) ----
const REORDER_MODULES = new Set(["parent_sku", "product_sku", "parent_sku_description"]);
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.edit");
  if (denied) return denied;
  let body: { module?: string; record_id?: string; ordered_asset_ids?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { module, record_id, ordered_asset_ids } = body;
  if (!module || !REORDER_MODULES.has(module) || !record_id || !Array.isArray(ordered_asset_ids))
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const admin = supabaseAdmin();
  for (let i = 0; i < ordered_asset_ids.length; i++) {
    const { error } = await admin.from("asset_usages").update({ sort_order: i })
      .eq("module", module).eq("record_id", record_id).eq("asset_id", ordered_asset_ids[i]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, error: null });
}
