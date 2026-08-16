/**
 * ใส่ค่าแรงให้ใบจ่ายงานหลายใบพร้อมกัน — /api/mo/work-orders/bulk-labor
 *
 * PATCH { ids: string[], rate_per_piece: number }
 *   → ใบละ labor_cost = rate × จำนวนของใบนั้น (ไม่ใช่ยอดเดียวกันทุกใบ)
 *   → rate = 0 หรือว่าง = ล้างค่าแรง (กลับไปเป็นยังไม่ใส่)
 *
 * ของกลาง: guardApi(work_board.dispatch) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { ids?: unknown; rate_per_piece?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((v) => String(v)).filter(Boolean))] : [];
  if (!ids.length) return NextResponse.json({ error: "ไม่มีใบจ่ายงานที่เลือก" }, { status: 400 });
  const clear = body.rate_per_piece == null || body.rate_per_piece === "";
  const rate = clear ? 0 : Number(body.rate_per_piece);
  if (!clear && (!isFinite(rate) || rate < 0)) return NextResponse.json({ error: "ค่าแรง/ชิ้น ต้องเป็นตัวเลขไม่ติดลบ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: rows, error: readErr } = await admin.from("mo_work_orders").select("id, qty").in("id", ids);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 });

  // จัดกลุ่มตามจำนวน → ยิง update น้อยครั้ง (ใบที่จำนวนเท่ากันได้ยอดเท่ากัน)
  const byQty = new Map<number, string[]>();
  for (const w of rows ?? []) {
    const q = Number(w.qty) || 0;
    byQty.set(q, [...(byQty.get(q) ?? []), String(w.id)]);
  }
  let updated = 0;
  const now = new Date().toISOString();
  for (const [qty, list] of byQty) {
    const value = clear ? null : r2(rate * qty);
    const { error } = await admin.from("mo_work_orders").update({ labor_cost: value, updated_at: now }).in("id", list);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    updated += list.length;
  }

  await writeAudit(admin, {
    action: "bulk_edit", entityType: "mo_work_order", entityId: ids.join(","),
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { field: "labor_cost", rate_per_piece: clear ? null : rate, count: updated },
  });
  return NextResponse.json({ ok: true, updated, error: null });
}
