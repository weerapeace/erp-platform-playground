/**
 * POST /api/mo/set-due-date — ตั้ง/ล้าง "วันกำหนดส่ง" (due_date) ของใบสั่งผลิต
 * ใช้โดยปฏิทินผลิต (ลากการ์ดวางบนวัน → เซ็ตวัน · ลากออกกล่อง → ล้างวัน)
 *
 * body: { id: string, due_date: string | null }   // due_date = "YYYY-MM-DD" หรือ null
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

  let body: { id?: string; due_date?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = body.id;
  if (!id) return NextResponse.json({ error: "ไม่ระบุใบสั่งผลิต" }, { status: 400 });
  const due = body.due_date ? String(body.due_date).slice(0, 10) : null;   // YYYY-MM-DD หรือ null

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("manufacturing_orders").update({ due_date: due }).eq("id", id).select("id, mo_no").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "manufacturing_orders", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { field: "due_date", due_date: due, mo_no: data?.mo_no },
  });
  return NextResponse.json({ ok: true, error: null });
}
