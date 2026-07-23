/**
 * POST /api/mo/set-delivery — ตั้ง/ยกเลิก "นัดส่งลูกค้าแล้ว" (delivery_confirmed) ของใบสั่งผลิต
 * ใช้คู่กับ due_date: due_date = วันกำหนด · delivery_confirmed = ยืนยันนัดส่งลูกค้าจริงหรือแค่ deadline
 *
 * body: { id: string, confirmed: boolean }
 * ของกลาง: guardApi(products.edit) + supabaseAdmin + writeAudit
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

  let body: { id?: string; confirmed?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = body.id;
  if (!id) return NextResponse.json({ error: "ไม่ระบุใบสั่งผลิต" }, { status: 400 });
  const confirmed = body.confirmed === true;

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("manufacturing_orders").update({ delivery_confirmed: confirmed }).eq("id", id).select("id, mo_no").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "manufacturing_orders", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { field: "delivery_confirmed", delivery_confirmed: confirmed, mo_no: data?.mo_no },
  });
  return NextResponse.json({ ok: true, error: null });
}
