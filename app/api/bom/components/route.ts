/**
 * GET   /api/bom/components?search=  → ค้น SKU วัตถุดิบ พร้อมกลุ่มวัตถุดิบ + หน้ากว้าง + %เผื่อเสีย
 * PATCH /api/bom/components           → ติด tag กลุ่มวัตถุดิบให้ SKU (body: { sku_id, material_family_id })
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
  material_family_id: string | null;
  material_type: string | null;     // ชื่อกลุ่ม เช่น "ผ้า"
  loss_percent: number | null;
  fabric_width_cm: number | null;
};

type FamilyEmbed = { name: string | null; loss_percentage: number | null } | null;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const search = (new URL(request.url).searchParams.get("search") ?? "").trim();
  let q = supabaseFromRequest(request)
    .from("skus_v2")
    .select("id, code, name_th, fabric_width_cm, material_family_id, families:product_families!material_family_id ( name, loss_percentage )")
    .eq("is_active", true)
    .order("code", { ascending: true })
    .limit(30);
  if (search) {
    const t = `%${search}%`;
    q = q.or(`code.ilike.${t},name_th.ilike.${t}`);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const out: BomComponent[] = rows.map((r) => {
    const fam = (Array.isArray(r.families) ? r.families[0] : r.families) as FamilyEmbed;
    return {
      id:                 String(r.id),
      code:               String(r.code ?? ""),
      name:               String(r.name_th ?? ""),
      material_family_id: (r.material_family_id as string) ?? null,
      material_type:      fam?.name ?? null,
      loss_percent:       fam?.loss_percentage != null ? Number(fam.loss_percentage) : null,
      fabric_width_cm:    r.fabric_width_cm != null ? Number(r.fabric_width_cm) : null,
    };
  });
  return NextResponse.json({ data: out, error: null });
}

// ---- PATCH: ติด tag กลุ่มวัตถุดิบให้ SKU ----
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { sku_id?: string; material_family_id?: string | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.sku_id) return NextResponse.json({ error: "ต้องระบุ sku_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("skus_v2")
    .update({ material_family_id: body.material_family_id ?? null })
    .eq("id", body.sku_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: user.id, action: "tag_material_family", entity_type: "sku",
    entity_id: body.sku_id, metadata: { material_family_id: body.material_family_id ?? null },
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true, error: null });
}
