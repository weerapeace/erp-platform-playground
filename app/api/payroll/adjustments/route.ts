/**
 * Payroll module — เพิ่มพิเศษ/หักอื่น (payroll_adjustments) — Phase A Manual Inputs
 * GET  /api/payroll/adjustments?period_id=&employee_id=   → list รายการของพนักงานในงวด
 * POST /api/payroll/adjustments  { period_id, employee_id, adjustment_type, item_name, amount, taxable?, source_type? }
 *   adjustment_type: earning (เพิ่มพิเศษ) | deduction (หักอื่น)
 *
 * ความปลอดภัย: ต้อง employees.edit, งวดต้อง draft/review (กันแก้งวดที่ล็อก/จ่าย), audit log
 * status=approved เพื่อให้เครื่องคำนวณนับทันที
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardPayroll } from "@/lib/payroll-auth";
import { writeAudit } from "@/lib/audit";
import { money } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const EDITABLE = new Set(["draft", "review"]);

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const periodId = req.nextUrl.searchParams.get("period_id");
  const employeeId = req.nextUrl.searchParams.get("employee_id");
  if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });
  try {
    const admin = supabaseAdmin();
    let q = admin.from("payroll_adjustments")
      .select("id, employee_id, adjustment_type, item_name, amount, taxable, status, source_type, item_code, created_at, created_by")
      .eq("payroll_period_id", periodId).eq("status", "approved").order("created_at", { ascending: true });
    if (employeeId) q = q.eq("employee_id", employeeId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    // ใครเป็นคนคีย์ (created_by → user_profiles.display_name)
    const uids = [...new Set(rows.map((r) => String(r.created_by ?? "")).filter(Boolean))];
    const nameBy: Record<string, string> = {};
    if (uids.length) {
      const { data: ups } = await admin.from("user_profiles").select("id, display_name, username, email").in("id", uids);
      (ups ?? []).forEach((u) => { const r = u as Record<string, unknown>; nameBy[String(r.id)] = String(r.display_name || r.username || r.email || ""); });
    }
    const out = rows.map((r) => ({ ...r, created_by_name: nameBy[String(r.created_by ?? "")] ?? "" }));
    return NextResponse.json({ data: out, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const periodId = String(body.period_id ?? ""), employeeId = String(body.employee_id ?? "");
  const type = String(body.adjustment_type ?? "");
  const itemName = String(body.item_name ?? "").trim();
  const amount = money(body.amount);
  const isPiecework = String(body.source_type) === "piecework" || String(body.item_code) === "PIECEWORK";
  if (!periodId || !employeeId) return NextResponse.json({ error: "ต้องระบุงวดและพนักงาน" }, { status: 400 });
  if (type !== "earning" && type !== "deduction") return NextResponse.json({ error: "ประเภทต้องเป็น earning หรือ deduction" }, { status: 400 });
  if (!itemName) return NextResponse.json({ error: "ต้องระบุชื่อรายการ" }, { status: 400 });
  if (!(amount > 0)) return NextResponse.json({ error: "จำนวนเงินต้องมากกว่า 0" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* */ }

  try {
    const a = supabaseAdmin();
    const { data: pdata } = await a.from("payroll_periods").select("status, period_name").eq("id", periodId).limit(1);
    const period = pdata?.[0] as { status: string; period_name: string } | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });
    if (!EDITABLE.has(String(period.status))) return NextResponse.json({ error: `งวดสถานะ "${period.status}" แก้ไม่ได้ (เฉพาะ draft/review)` }, { status: 409 });

    const { data: ins, error } = await a.from("payroll_adjustments").insert({
      payroll_period_id: periodId, employee_id: employeeId, adjustment_type: type,
      item_code: isPiecework ? "PIECEWORK" : type === "earning" ? "MANUAL_ADD" : "MANUAL_DED", item_name: itemName,
      amount, taxable: body.taxable === false ? false : type === "earning",
      source_type: isPiecework ? "piecework" : "manual", status: "approved", created_by: userId,
    }).select("id").limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(a, {
      action: "create", entityType: "payroll_adjustments", entityId: (ins?.[0] as { id: string })?.id, actorId: userId,
      actorName: (body.actor as string) ?? null,
      metadata: { period_name: period.period_name, type, item_name: itemName, amount, source_type: isPiecework ? "piecework" : "manual" },
    });
    return NextResponse.json({ data: ins?.[0], error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
