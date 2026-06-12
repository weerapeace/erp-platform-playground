/**
 * GET   /api/bom/components?search=  → ค้น SKU วัตถุดิบ พร้อมกลุ่มวัตถุดิบ + หน้ากว้าง + %เผื่อเสีย
 * PATCH /api/bom/components           → ติดกลุ่มวัตถุดิบให้ SKU (body: { sku_id, material_group_id })
 *                                       และ/หรือ เขียนหน้ากว้างกลับ SKU (fabric_width_cm)
 *
 * ใช้ในตัวแก้บรรทัด BOM: เลือกวัตถุดิบ → auto-fill ชนิด/หน้ากว้าง/%เผื่อเสีย
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type BomComponent = {
  id: string;
  code: string;
  name: string;
  material_group_id: string | null;
  material_type: string | null;     // ชื่อกลุ่ม เช่น "ผ้า"
  loss_percent: number | null;
  fabric_width_cm: number | null;
  uom_id: string | null;
  uom_name: string | null;
  image_key: string | null;         // cover_image_r2_key (โชว์ thumbnail)
};

type GroupEmbed = { name: string | null; loss_percent: number | null } | null;
type UomEmbed = { name: string | null } | null;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = new URL(request.url).searchParams;
  const search = (sp.get("search") ?? "").trim();
  const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "30", 10)));
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10));
  const groups = (sp.get("groups") ?? "").split(",").map((s) => s.trim()).filter(Boolean);   // กรองตามกลุ่มวัตถุดิบ (code)
  const tags = (sp.get("tags") ?? "").split(",").map((s) => s.trim()).filter(Boolean);        // กรองตามแท็ก (product_families ชื่อ)
  const supabase = supabaseFromRequest(request);

  // แปลง group code → id (สำหรับกรอง material_group_id)
  let groupIds: string[] | null = null;
  if (groups.length) {
    const { data: g } = await supabase.from("material_groups").select("id").in("code", groups);
    groupIds = (g ?? []).map((x: Record<string, unknown>) => String(x.id));
    if (groupIds.length === 0) return NextResponse.json({ data: [], error: null });   // กลุ่มไม่พบ → ว่าง
  }

  // กรองตามแท็ก: ชื่อแท็ก → family id → sku id (ผ่าน junction)
  let tagSkuIds: string[] | null = null;
  if (tags.length) {
    const { data: fams } = await supabase.from("product_families").select("id").in("name", tags);
    const famIds = (fams ?? []).map((x: Record<string, unknown>) => String(x.id));
    if (famIds.length === 0) return NextResponse.json({ data: [], error: null });
    const { data: links } = await supabase.from("skus_v2_product_family_m2m").select("src_id").in("tgt_id", famIds).limit(2000);
    tagSkuIds = [...new Set((links ?? []).map((x: Record<string, unknown>) => String(x.src_id)))];
    if (tagSkuIds.length === 0) return NextResponse.json({ data: [], error: null });
  }

  let q = supabase
    .from("skus_v2")
    .select("id, code, name_th, fabric_width_cm, cover_image_r2_key, material_group_id, uom_id, grp:material_groups!material_group_id ( name, loss_percent ), uom:uoms!uom_id ( name )")
    .eq("is_active", true)
    .order("code", { ascending: true })
    .range(offset, offset + limit - 1);
  if (groupIds) q = q.in("material_group_id", groupIds);
  if (tagSkuIds) q = q.in("id", tagSkuIds);
  if (search) {
    const t = `%${search}%`;
    q = q.or(`code.ilike.${t},name_th.ilike.${t}`);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const out: BomComponent[] = rows.map((r) => {
    const g = (Array.isArray(r.grp) ? r.grp[0] : r.grp) as GroupEmbed;
    const u = (Array.isArray(r.uom) ? r.uom[0] : r.uom) as UomEmbed;
    return {
      id:                String(r.id),
      code:              String(r.code ?? ""),
      name:              String(r.name_th ?? ""),
      material_group_id: (r.material_group_id as string) ?? null,
      material_type:     g?.name ?? null,
      loss_percent:      g?.loss_percent != null ? Number(g.loss_percent) : null,
      fabric_width_cm:   r.fabric_width_cm != null ? Number(r.fabric_width_cm) : null,
      uom_id:            (r.uom_id as string) ?? null,
      uom_name:          u?.name ?? null,
      image_key:         (r.cover_image_r2_key as string) ?? null,
    };
  });
  return NextResponse.json({ data: out, error: null });
}

// ---- PATCH: ติดกลุ่มวัตถุดิบ / เขียนหน้ากว้างกลับ SKU ----
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { sku_id?: string; material_group_id?: string | null; fabric_width_cm?: number | null; uom_id?: string | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.sku_id) return NextResponse.json({ error: "ต้องระบุ sku_id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("material_group_id" in body) patch.material_group_id = body.material_group_id ?? null;
  if ("fabric_width_cm" in body)   patch.fabric_width_cm = body.fabric_width_cm ?? null;
  if ("uom_id" in body)            patch.uom_id = body.uom_id ?? null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("skus_v2").update(patch).eq("id", body.sku_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: user.id, action: "update_sku_material", entity_type: "sku",
    entity_id: body.sku_id, metadata: patch,
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true, error: null });
}
