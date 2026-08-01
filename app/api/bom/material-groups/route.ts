/**
 * GET   /api/bom/material-groups → รายการกลุ่มวัตถุดิบ (material_groups) + กฎคำนวณ + ระดับความสำคัญ
 * PATCH /api/bom/material-groups → แก้ "ระดับความสำคัญ" (criticality) ของกลุ่ม
 * ใช้: dropdown เลือกชนิด + ตัวคูณสูตร (calc_method/divisor/loss) ในตัวแก้บรรทัด BOM
 *      + หน้า "ความพร้อมวัตถุดิบ" ตั้งว่ากลุ่มไหนเป็น ของหลัก / ต้องมี / สิ้นเปลือง
 *        (critical ไม่ครบ = ⛔ ผลิตไม่ได้ · consumable ไม่ถูกนับใน % ความพร้อม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const CRITICALITY_VALUES = ["critical", "required", "consumable"] as const;
export type Criticality = (typeof CRITICALITY_VALUES)[number];

export type MaterialGroup = {
  id: string; code: string; name: string;
  calc_method: string; loss_percent: number; divisor: number | null; uom_default: string | null;
  criticality: Criticality;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data, error } = await supabaseFromRequest(request)
    .from("material_groups")
    .select("id, code, name, calc_method, loss_percent, divisor, uom_default, criticality")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as MaterialGroup[], error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { id?: string; criticality?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  const criticality = (body.criticality ?? "").trim() as Criticality;
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  if (!(CRITICALITY_VALUES as readonly string[]).includes(criticality)) {
    return NextResponse.json({ error: "ระดับความสำคัญไม่ถูกต้อง" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("material_groups").select("name, criticality").eq("id", id).maybeSingle();
  const { error } = await admin.from("material_groups").update({ criticality }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "update", entityType: "material_groups", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      field: "criticality",
      group: (before as { name?: string } | null)?.name ?? null,
      old: (before as { criticality?: string } | null)?.criticality ?? null,
      new: criticality,
    },
  }).catch(() => { /* audit ห้ามบล็อกงานหลัก */ });

  return NextResponse.json({ ok: true, error: null });
}
