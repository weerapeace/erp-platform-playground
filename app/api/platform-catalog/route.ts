/**
 * Platform Catalog (ทิศอ่าน) — /api/platform-catalog (โครง เฟสนี้ยังไม่ดึงข้อมูลจริง)
 * GET ?platform_id=&brand_id=&with_counts=1  (products.platforms.view)
 *   → fields (ฟิลด์ของแพลตฟอร์มนั้น), listings (สินค้าบนร้าน), summary {total, matched}
 *     with_counts=1 → platform_counts { [platform_id]: จำนวนสินค้า } เฉพาะร้านขายของ (โชว์บนปุ่มเลือกร้าน)
 * การนำเข้าจริง (อัปไฟล์ export / ต่อ API) มาเฟสถัดไป — โครงตาราง+หน้าพร้อมแล้ว
 * DELETE ?id=  (products.platforms.edit) → ลบรายการที่นำเข้าผิด (เป็นสำเนาข้อมูลจากร้าน — ของบนร้านจริงไม่ถูกแตะ)
 *   ถ้าสินค้านั้นยังอยู่ในไฟล์ export รอบหน้า จะกลับมาเอง (ต้องจับคู่ใหม่)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fetchAllPages } from "@/lib/fetch-all";
import { SELLING_PLATFORMS } from "@/lib/selling-platforms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const platformId = (sp.get("platform_id") ?? "").trim();
  const brandId = (sp.get("brand_id") ?? "").trim();
  const search = (sp.get("search") ?? "").trim();                       // ค้นหา listing (สำหรับ picker จับคู่)
  const limit = Math.min(5000, Math.max(1, parseInt(sp.get("limit") ?? "5000", 10)));
  if (!platformId) return NextResponse.json({ fields: [], listings: [], summary: { total: 0, matched: 0 }, error: null });
  const admin = supabaseAdmin();

  // PostgREST ตัดที่ 1,000 แถวเงียบ ๆ → ไล่ทีละหน้าให้ครบ (ร้านที่มีสินค้าเกินพันตัวไม่หายครึ่ง)
  const listingsQuery = (from: number, to: number) => {
    let lq = admin.from("platform_catalog_listings").select("id, external_product_id, title, sku_code, matched_parent_sku_id, price, status, source, last_imported_at").eq("platform_id", platformId);
    if (brandId) lq = lq.eq("brand_id", brandId);
    if (search) lq = lq.or(`title.ilike.%${search}%,sku_code.ilike.%${search}%,external_product_id.ilike.%${search}%`);
    return lq.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
  };
  const withCounts = sp.get("with_counts") === "1";
  const [{ data: fields }, listings, platformCounts] = await Promise.all([
    admin.from("platform_field_schemas").select("field_key, field_label, data_type, is_required, sample, source").eq("platform_id", platformId).order("sort_order", { ascending: true }),
    fetchAllPages<Record<string, unknown>>(listingsQuery, { maxRows: limit, page: Math.min(1000, limit) }),
    withCounts ? countPerPlatform(admin, brandId) : Promise.resolve(undefined),
  ]);
  const rows = listings.slice(0, limit);
  // เติมรหัส/ชื่อ Parent SKU ที่จับคู่ไว้ (ไว้โชว์ว่าจับกับอะไร) — ถามเป็นชุดย่อยกัน .in() ยาวเกิน
  const matchedIds = [...new Set(rows.map((r) => r.matched_parent_sku_id).filter(Boolean) as string[])];
  const pMap = new Map<string, { code: string | null; name: string | null }>();
  for (let i = 0; i < matchedIds.length; i += 200) {
    const { data: ps } = await admin.from("parent_skus_v2").select("id, code, name_th").in("id", matchedIds.slice(i, i + 200));
    for (const p of ((ps ?? []) as Record<string, unknown>[])) pMap.set(String(p.id), { code: (p.code as string) ?? null, name: (p.name_th as string) ?? null });
  }
  for (const r of rows) {
    const m = r.matched_parent_sku_id ? pMap.get(String(r.matched_parent_sku_id)) : null;
    r.matched_code = m?.code ?? null; r.matched_name = m?.name ?? null;
  }
  return NextResponse.json({
    fields: (fields ?? []) as Record<string, unknown>[],
    listings: rows,
    summary: { total: rows.length, matched: rows.filter((r) => !!r.matched_parent_sku_id).length },
    ...(platformCounts ? { platform_counts: platformCounts } : {}),
    error: null,
  });
}

/** จำนวนสินค้าบนร้านต่อแพลตฟอร์ม (เฉพาะร้านขายของ) — นับแบบ head ไม่ดึงแถว */
async function countPerPlatform(admin: ReturnType<typeof supabaseAdmin>, brandId: string): Promise<Record<string, number>> {
  const { data: pfs } = await admin.from("erp_platforms").select("id, code").in("code", [...SELLING_PLATFORMS]);
  const out: Record<string, number> = {};
  await Promise.all(((pfs ?? []) as { id: string }[]).map(async (p) => {
    let q = admin.from("platform_catalog_listings").select("id", { count: "exact", head: true }).eq("platform_id", p.id);
    if (brandId) q = q.eq("brand_id", brandId);
    const { count } = await q;
    out[p.id] = count ?? 0;
  }));
  return out;
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("platform_catalog_listings")
    .select("id, platform_id, brand_id, external_product_id, title, sku_code, matched_parent_sku_id, price, status, source, last_imported_at").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

  const { error } = await admin.from("platform_catalog_listings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "platform_catalog_listing", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { snapshot: cur } });
  return NextResponse.json({ ok: true, error: null });
}
