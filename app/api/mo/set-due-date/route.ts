/**
 * POST /api/mo/set-due-date — ตั้ง/ล้าง "วันกำหนด" ของใบสั่งผลิต
 *
 * มี 2 วันแยกกัน:
 *   · due_date          = 📦 นัดส่งลูกค้า
 *   · internal_due_date = 🪑 กำหนดส่งงานภายใน (ช่าง/โต๊ะต้องทำเสร็จ)
 *
 * body: { id, due_date?, internal_due_date?, cascade? }
 *   - ส่งมาเฉพาะฟิลด์ที่ต้องการแก้ (ไม่ส่ง = ไม่แตะ) · ค่า null = ล้างวัน
 *   - แก้ internal_due_date และ cascade !== false → ไล่ตั้งวันให้ใบจ่ายงานที่ยังทำอยู่ของใบนี้ด้วย
 *
 * ใช้โดย: ปฏิทินผลิต (ลากการ์ดวางบนวัน) · ป๊อปเช็กลิสต์เตรียม/ตัด
 * ของกลาง: guardApi(products.edit) + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);   // "YYYY-MM-DD" หรือ null

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { id?: string; due_date?: string | null; internal_due_date?: string | null; cascade?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = body.id;
  if (!id) return NextResponse.json({ error: "ไม่ระบุใบสั่งผลิต" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("due_date" in body) {
    patch.due_date = day(body.due_date);
    if (!patch.due_date) patch.delivery_confirmed = false;   // ไม่มีวันกำหนด = ไม่มีนัดส่งลูกค้า
  }
  if ("internal_due_date" in body) patch.internal_due_date = day(body.internal_due_date);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลที่จะแก้" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("manufacturing_orders").update(patch).eq("id", id).select("id, mo_no").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ไล่ตั้งวันให้ใบจ่ายงานที่ยังทำอยู่ (ไม่แตะใบที่เสร็จ/ยกเลิกไปแล้ว)
  let cascaded = 0;
  if ("internal_due_date" in body && body.cascade !== false && data?.mo_no) {
    const { data: wos } = await admin.from("mo_work_orders")
      .update({ due_date: day(body.internal_due_date), updated_at: new Date().toISOString() })
      .eq("mo_no", data.mo_no).eq("is_active", true)
      .not("status", "in", "(done,cancelled)").select("id");
    cascaded = (wos ?? []).length;
  }

  await writeAudit(admin, {
    action: "update", entityType: "manufacturing_orders", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { ...patch, mo_no: data?.mo_no, work_orders_updated: cascaded },
  });
  return NextResponse.json({ ok: true, cascaded, error: null });
}
