/**
 * บอร์ดจ่ายงาน — ติ๊กสถานะ "เตรียมครบ / ตัดครบ" ของใบสั่งผลิต (Phase 1)
 * PATCH /api/mo/[id]/prep  body: { prep_done?: boolean; cut_done?: boolean }
 *   → อัปเดตเฉพาะ 2 ช่องนี้ (+ เวลาที่กด) ไม่แตะฟิลด์อื่น ไม่กางสูตรใหม่
 *   → ไฟเขียวบนการ์ด = prep_done && cut_done
 * ของกลาง: guardApi (products.edit) + audit ลง audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { prep_done?: boolean; cut_done?: boolean };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  const now = new Date().toISOString();
  if (typeof body.prep_done === "boolean") { patch.prep_done = body.prep_done; patch.prep_done_at = body.prep_done ? now : null; }
  if (typeof body.cut_done  === "boolean") { patch.cut_done  = body.cut_done;  patch.cut_done_at  = body.cut_done  ? now : null; }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีสถานะให้อัปเดต" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("manufacturing_orders").select("mo_no").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "ไม่พบใบสั่งผลิตนี้" }, { status: 404 });
  const moNo = (existing as { mo_no: string }).mo_no;

  const { error } = await admin.from("manufacturing_orders").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: user?.id ?? null, action: "update", entity_type: "mo", entity_id: id,
    metadata: { mo_no: moNo, ...patch },
  }).then(() => {}, () => {});

  return NextResponse.json({ id, ...patch, error: null });
}
