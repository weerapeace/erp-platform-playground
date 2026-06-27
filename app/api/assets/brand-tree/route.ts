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

// asset_ids ที่ผูกกับ (module, record_id) เรียงตามวันที่อัป (เฟส 2 = sort_order)
async function usageIds(admin: Admin, module: string, recordId: string): Promise<string[]> {
  const { data } = await admin.from("asset_usages").select("asset_id, created_at")
    .eq("module", module).eq("record_id", recordId).order("created_at", { ascending: true });
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
    return NextResponse.json({ brands: data ?? [], error: null });
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

    const { data: p } = await admin.from("parent_skus_v2").select("id, code, name_th").eq("id", parentId).maybeSingle();

    // 1) รูป Parent เอง
    const parentImages = await rowsByIds(admin, await usageIds(admin, "parent_sku", parentId));

    // 2) โฟลเดอร์ SKUs — ย่อยราย SKU (เฉพาะที่มีรูป)
    const { data: skus } = await admin.from("skus_v2").select("id, code, name_th").eq("parent_sku_id", parentId).order("code");
    const skuList = (skus ?? []) as { id: string; code: string; name_th: string | null }[];
    const skuIds = skuList.map((s) => s.id);
    const { data: su } = skuIds.length
      ? await admin.from("asset_usages").select("asset_id, record_id, created_at").eq("module", "product_sku").in("record_id", skuIds).order("created_at", { ascending: true })
      : { data: [] };
    const bySku = new Map<string, string[]>();
    for (const u of (su ?? []) as { asset_id: string; record_id: string }[]) {
      const arr = bySku.get(u.record_id) ?? []; arr.push(u.asset_id); bySku.set(u.record_id, arr);
    }
    const allSkuAssetIds = [...new Set((su ?? []).map((u) => (u as { asset_id: string }).asset_id))];
    const skuRowMap = new Map((await rowsByIds(admin, allSkuAssetIds)).map((r) => [r.id, r]));
    const skusOut = skuList.map((s) => ({
      id: s.id, code: s.code, name: s.name_th ?? "",
      images: (bySku.get(s.id) ?? []).map((id) => skuRowMap.get(id)).filter((x): x is AssetRow => !!x),
    })).filter((s) => s.images.length > 0);

    // 3) โฟลเดอร์ Description
    const description = await rowsByIds(admin, await usageIds(admin, "parent_sku_description", parentId));

    return NextResponse.json({
      parent: p ? { id: p.id, code: p.code, name: (p.name_th as string) ?? "" } : null,
      parentImages, skus: skusOut, description, error: null,
    });
  }

  return NextResponse.json({ error: "bad mode" }, { status: 400 });
}
