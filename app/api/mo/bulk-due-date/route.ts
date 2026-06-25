/**
 * แก้ "กำหนดเสร็จ" (due_date) ของใบสั่งผลิตหลายใบพร้อมกัน — /api/mo/bulk-due-date
 * PATCH { ids: string[], due_date: string|null } → อัปเดตเฉพาะ due_date (ไม่แตะฟิลด์อื่น)
 * ของกลาง: guardApi (products.edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { ids?: unknown; due_date?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((v) => String(v)).filter(Boolean))] : [];
  const due = body.due_date ? String(body.due_date) : null;
  if (!ids.length) return NextResponse.json({ error: "ไม่มีรายการที่เลือก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("manufacturing_orders").update({ due_date: due }).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, { action: "bulk_edit", entityType: "manufacturing_order", entityId: ids.join(","),
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { field: "due_date", new_value: due, count: ids.length } });
  return NextResponse.json({ ok: true, updated: ids.length, error: null });
}
