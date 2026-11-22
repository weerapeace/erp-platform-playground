/**
 * ไลน์บริษัท รอบ 3 — HR เลือกงวดที่ให้พนักงานดูสลิปในไลน์ได้ (หน้า /payroll/line-members)
 * GET  → งวดล่าสุด 12 งวด + จำนวนสลิป + เปิดให้ดูแล้วหรือยัง
 * POST { period_id, visible } → เปิด/ปิด (ลงประวัติ ค่าเดิม→ใหม่) · ไม่แตะตัวเลขเงิน
 * ปิดกลับ = พนักงานไม่เห็นทันที (หน้าเล็กอ่านค่านี้ทุกครั้งที่เปิด)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardPayroll } from "@/lib/payroll-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const t = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  try {
    const a = supabaseAdmin();
    const { data, error } = await a.from("payroll_periods")
      .select("id,period_name,start_date,end_date,status,line_visible_at,line_visible_by")
      .neq("status", "cancelled").order("end_date", { ascending: false }).limit(12);
    if (error) throw new Error(error.message);
    const periods = (data ?? []) as Row[];
    const ids = periods.map((p) => t(p.id));
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: slips, error: se } = await a.from("payroll_payslips").select("payroll_period_id").in("payroll_period_id", ids).is("voided_at", null).limit(5000);
      if (se) throw new Error(se.message);
      for (const s of (slips ?? []) as Row[]) counts.set(t(s.payroll_period_id), (counts.get(t(s.payroll_period_id)) ?? 0) + 1);
    }
    return NextResponse.json({
      data: periods.map((p) => ({
        id: t(p.id), period_name: t(p.period_name), start_date: t(p.start_date) || null, end_date: t(p.end_date) || null, status: t(p.status),
        slip_count: counts.get(t(p.id)) ?? 0, line_visible_at: t(p.line_visible_at) || null, line_visible_by: t(p.line_visible_by) || null,
      })),
      error: null,
    });
  } catch {
    return NextResponse.json({ data: [], error: "โหลดงวดเงินเดือนไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: { period_id?: unknown; visible?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const periodId = t(body.period_id);
  if (!periodId || typeof body.visible !== "boolean") return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });

  const { data: { user } } = await supabaseFromRequest(req).auth.getUser();
  const actor = t(user?.email) || "HR";
  const a = supabaseAdmin();
  const { data: before } = await a.from("payroll_periods").select("id,period_name,line_visible_at").eq("id", periodId).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบงวดนี้" }, { status: 404 });
  const next = body.visible ? { line_visible_at: new Date().toISOString(), line_visible_by: actor } : { line_visible_at: null, line_visible_by: null };
  const { error } = await a.from("payroll_periods").update(next).eq("id", periodId);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  await writeAudit(a, {
    action: body.visible ? "payroll_line_payslip_open" : "payroll_line_payslip_close",
    entityType: "payroll_periods", entityId: periodId, actorId: user?.id ?? null, actorName: actor,
    metadata: { period_name: t((before as Row).period_name), changes: { line_visible_at: { from: t((before as Row).line_visible_at) || null, to: next.line_visible_at } } },
  });
  return NextResponse.json({ data: { id: periodId, ...next }, error: null });
}
