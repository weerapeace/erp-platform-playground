/**
 * 💼 ราคากลางค่าใช้จ่ายเพิ่ม (แท็บตีราคา ใบงานออกแบบ) — GET รายการทั้งหมด · POST เพิ่ม 1 รายการ
 *   สิทธิ์: ดู = เห็นต้นทุน (products.cost.view) · แก้ = เห็นต้นทุน + แก้สินค้า (products.edit)
 *   ตาราง design_cost_presets (RLS deny-all → อ่าน/เขียนผ่าน service role) · audit cost_preset_create
 *   ของกลาง: lib/design-cost-presets (cleanPreset / presetProblem) · guardApi · writeAudit
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { writeAudit } from "@/lib/audit";
import { cleanPreset, presetProblem, PRESET_KIND_META } from "@/lib/design-cost-presets";

export const dynamic = "force-dynamic";

const COLS = "id, kind, label, amount, w_cm, l_cm, h_cm, max_kg, mode, sort_order";

export async function GET(request: Request) {
  const denied = await guardApi(request, COST_PERM); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("design_cost_presets").select(COLS).eq("is_active", true)
    .order("kind").order("sort_order").order("created_at");
  if (error) return NextResponse.json({ data: [], error: "โหลดราคากลางไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map((r) => ({ ...cleanPreset(r), id: String(r.id) })), error: null });
}

export async function POST(request: Request) {
  const denied = (await guardApi(request, COST_PERM)) ?? (await guardApi(request, "products.edit")); if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const p = cleanPreset(body);
  const problem = presetProblem(p);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { id: _id, ...row } = p; void _id;
  const { data, error } = await admin.from("design_cost_presets").insert({ ...row, updated_by: user?.id ?? null }).select(COLS).single();
  if (error) return NextResponse.json({ error: "บันทึกราคากลางไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, {
    action: "cost_preset_create", entityType: "design_cost_preset", entityId: String(data.id), actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { kind: p.kind, kind_label: PRESET_KIND_META[p.kind].label, label: p.label, amount: p.amount, w_cm: p.w_cm, l_cm: p.l_cm, h_cm: p.h_cm, max_kg: p.max_kg, mode: p.mode },
  });
  return NextResponse.json({ data: { ...cleanPreset(data), id: String(data.id) }, error: null });
}
