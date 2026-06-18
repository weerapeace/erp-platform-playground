/**
 * ค่าแรงผลิตที่วางแผนไว้ต่อใบสั่งผลิต (กลุ่ม A) — /api/mo/est-labor
 * POST { mo_id, est_labor_cost } → ตั้ง manufacturing_orders.est_labor_cost
 * ของกลาง: guardApi(products.edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { mo_id?: string; est_labor_cost?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const moId = (b.mo_id ?? "").trim();
  if (!moId) return NextResponse.json({ error: "ต้องระบุ mo_id" }, { status: 400 });
  // ว่าง = ล้างค่า (null); ไม่งั้นต้องเป็นตัวเลข >= 0
  let val: number | null = null;
  if (b.est_labor_cost != null && b.est_labor_cost !== "") {
    const n = Number(b.est_labor_cost);
    if (!isFinite(n) || n < 0) return NextResponse.json({ error: "ค่าแรงต้องเป็นตัวเลขไม่ติดลบ" }, { status: 400 });
    val = n;
  }
  const admin = supabaseAdmin();
  const { error } = await admin.from("manufacturing_orders").update({ est_labor_cost: val }).eq("id", moId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "manufacturing_orders", entityId: moId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { est_labor_cost: val } });
  return NextResponse.json({ data: { mo_id: moId, est_labor_cost: val }, error: null });
}
