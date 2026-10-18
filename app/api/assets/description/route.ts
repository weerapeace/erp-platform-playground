/**
 * รูป "Description" ของ Parent SKU — ผูกผ่าน asset_usages (module=parent_sku_description)
 *   GET    ?parent_id=                    → รูป Description (เรียงตาม sort_order → created_at)
 *   POST   { parent_id, asset_id }        → ผูก asset เข้า Description (ต่อท้ายลำดับ)
 *   DELETE ?parent_id=&asset_id=          → เอา asset ออกจาก Description (ไม่ลบไฟล์ในคลัง)
 * (เรียงลำดับใหม่ ใช้ POST /api/assets/brand-tree module=parent_sku_description)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { captureImageVersion } from "@/lib/record-versions";
import { buildRow, loadTags, loadUsageCounts, type AssetRow } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MODULE = "parent_sku_description";

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;
  const parentId = (new URL(request.url).searchParams.get("parent_id") ?? "").trim();
  if (!parentId) return NextResponse.json({ images: [], error: null });

  const admin = supabaseAdmin();
  const { data: u } = await admin.from("asset_usages").select("asset_id, sort_order, created_at")
    .eq("module", MODULE).eq("record_id", parentId)
    .order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
  const orderedIds = (u ?? []).map((x) => (x as { asset_id: string }).asset_id);
  const ids = [...new Set(orderedIds)];
  if (ids.length === 0) return NextResponse.json({ images: [], error: null });

  const { data } = await admin.from("assets").select("*").in("id", ids).eq("status", "active");
  const rows = (data ?? []) as Parameters<typeof buildRow>[0][];
  const tagsBy = await loadTags(admin, ids);
  const useBy = await loadUsageCounts(admin, ids);
  const map = new Map(rows.map((r) => [r.id, buildRow(r, tagsBy.get(r.id) ?? [], useBy.get(r.id) ?? 0)]));
  const images = orderedIds.map((id) => map.get(id)).filter((x): x is AssetRow => !!x);
  return NextResponse.json({ images, error: null });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.edit");
  if (denied) return denied;
  let b: { parent_id?: string; asset_id?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parentId = String(b.parent_id ?? "").trim();
  const assetId = String(b.asset_id ?? "").trim();
  if (!parentId || !assetId) return NextResponse.json({ error: "ต้องมี parent_id + asset_id" }, { status: 400 });

  const admin = supabaseAdmin();
  // มีอยู่แล้ว? (กันผูกซ้ำ — field null เลยเช็คเองแทน onConflict)
  const { data: ex } = await admin.from("asset_usages").select("id")
    .eq("module", MODULE).eq("record_id", parentId).eq("asset_id", assetId).is("field", null).maybeSingle();
  if (ex?.id) return NextResponse.json({ ok: true, error: null });

  // ต่อท้ายลำดับ
  const { data: mx } = await admin.from("asset_usages").select("sort_order")
    .eq("module", MODULE).eq("record_id", parentId)
    .order("sort_order", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const next = ((mx?.sort_order as number | null) ?? -1) + 1;

  const { error } = await admin.from("asset_usages").insert({
    asset_id: assetId, module: MODULE, record_id: parentId, record_label: null, field: null, sort_order: next,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "assets.edit");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const parentId = (sp.get("parent_id") ?? "").trim();
  const assetId = (sp.get("asset_id") ?? "").trim();
  if (!parentId || !assetId) return NextResponse.json({ error: "ต้องมี parent_id + asset_id" }, { status: 400 });

  const admin = supabaseAdmin();
  // อ่านไว้ก่อนเอาออก — 🕘 เก็บเป็นเวอร์ชันเก่าของ Parent (ย้อนกลับได้ · ไฟล์ไม่ถูกทิ้ง)
  const [{ data: use }, { data: asset }] = await Promise.all([
    admin.from("asset_usages").select("sort_order").eq("module", MODULE).eq("record_id", parentId).eq("asset_id", assetId).is("field", null).maybeSingle(),
    admin.from("assets").select("r2_key, file_name").eq("id", assetId).maybeSingle(),
  ]);
  const { error } = await admin.from("asset_usages").delete()
    .eq("module", MODULE).eq("record_id", parentId).eq("asset_id", assetId).is("field", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (use && asset?.r2_key) {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await captureImageVersion(admin, {
      table: "parent_skus_v2", id: parentId, fieldKey: "description_images", r2Key: asset.r2_key as string,
      source: "description_image_remove", actorId: user?.id ?? null, actorName: user?.email ?? null,
      meta: { asset_id: assetId, file_name: asset.file_name ?? null, sort_order: use.sort_order ?? null },
    });
  }
  return NextResponse.json({ ok: true, error: null });
}
