/**
 * POST /api/purchasing/mark-paid — ทำเครื่องหมาย "จ่ายเงินแล้ว/ยังไม่จ่าย" ให้ใบสั่งซื้อ
 * ใช้จากการ์ด "รอจ่ายเงิน" บนแดชบอร์ดจัดซื้อ (กดจ่ายในป๊อปอัป)
 *
 * body: { id: string, paid?: boolean }   // paid=true (ค่าเริ่มต้น) → payment_status='paid' + paid_date=วันนี้
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

  let body: { id?: string; paid?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = body.id;
  if (!id) return NextResponse.json({ error: "ไม่ระบุใบสั่งซื้อ" }, { status: 400 });
  const paid = body.paid !== false;   // default = จ่ายแล้ว

  const admin = supabaseAdmin();
  const patch = paid
    ? { payment_status: "paid", paid_date: new Date().toISOString().slice(0, 10) }
    : { payment_status: "unpaid", paid_date: null };
  const { data, error } = await admin
    .from("purchase_orders_v2").update(patch).eq("id", id).select("id, po_no").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "purchase_orders_v2", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { field: "payment_status", paid, po_no: data?.po_no },
  });
  return NextResponse.json({ ok: true, error: null });
}
