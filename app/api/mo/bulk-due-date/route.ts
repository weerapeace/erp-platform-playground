/**
 * แก้ "วันกำหนด" ของใบสั่งผลิตหลายใบพร้อมกัน — /api/mo/bulk-due-date
 *
 * PATCH { ids: string[], due_date: string|null, field?: "due" | "internal" }
 *   · field = "due" (ค่าเริ่มต้น) → 📦 นัดส่งลูกค้า (due_date)
 *   · field = "internal"          → 🪑 กำหนดส่งงานภายใน (internal_due_date)
 *                                   + ไล่ตั้งวันให้ใบจ่ายงานที่ยังทำอยู่ของใบเหล่านั้นด้วย
 * แก้เฉพาะฟิลด์วันที่ ไม่แตะฟิลด์อื่น
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
  let body: { ids?: unknown; due_date?: unknown; field?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((v) => String(v)).filter(Boolean))] : [];
  const due = body.due_date ? String(body.due_date).slice(0, 10) : null;
  const internal = body.field === "internal";
  const col = internal ? "internal_due_date" : "due_date";
  if (!ids.length) return NextResponse.json({ error: "ไม่มีรายการที่เลือก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: rows, error } = await admin.from("manufacturing_orders")
    .update({ [col]: due }).in("id", ids).select("mo_no");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // วันภายใน = ใบจ่ายงานที่ยังทำอยู่ต้องขยับตามด้วย (ไม่แตะใบที่เสร็จ/ยกเลิก)
  let cascaded = 0;
  const moNos = (rows ?? []).map((r) => String(r.mo_no)).filter(Boolean);
  if (internal && moNos.length) {
    const { data: wos } = await admin.from("mo_work_orders")
      .update({ due_date: due, updated_at: new Date().toISOString() })
      .in("mo_no", moNos).eq("is_active", true)
      .not("status", "in", "(done,cancelled)").select("id");
    cascaded = (wos ?? []).length;
  }

  await writeAudit(admin, { action: "bulk_edit", entityType: "manufacturing_order", entityId: ids.join(","),
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { field: col, new_value: due, count: ids.length, work_orders_updated: cascaded } });
  return NextResponse.json({ ok: true, updated: ids.length, cascaded, error: null });
}
