/**
 * Payroll module — แก้/ลบรายการเพิ่มพิเศษ/หักอื่น
 * PATCH  /api/payroll/adjustments/<id>   { item_name, amount } (เฉพาะงวด draft/review, employees.edit, audit)
 * DELETE /api/payroll/adjustments/<id>   (เฉพาะงวด draft/review, employees.edit, audit)
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

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const itemName = String(body.item_name ?? "").trim();
  const amount = money(body.amount);
  if (!itemName) return NextResponse.json({ error: "ต้องระบุชื่อรายการ" }, { status: 400 });
  if (!(amount > 0)) return NextResponse.json({ error: "จำนวนเงินต้องมากกว่า 0" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* */ }

  try {
    const a = supabaseAdmin();
    const { data: rowData } = await a.from("payroll_adjustments")
      .select("id, payroll_period_id, item_name, amount, adjustment_type").eq("id", id).limit(1);
    const row = rowData?.[0] as { payroll_period_id: string; item_name: string; amount: number; adjustment_type: string } | undefined;
    if (!row) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

    const { data: pdata } = await a.from("payroll_periods").select("status, period_name").eq("id", row.payroll_period_id).limit(1);
    const period = pdata?.[0] as { status: string; period_name: string } | undefined;
    if (period && !EDITABLE.has(String(period.status))) {
      return NextResponse.json({ error: `งวดสถานะ "${period.status}" แก้ไม่ได้` }, { status: 409 });
    }

    const { data, error } = await a.from("payroll_adjustments")
      .update({ item_name: itemName, amount })
      .eq("id", id)
      .select("id")
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(a, {
      action: "update", entityType: "payroll_adjustments", entityId: id, actorId: userId,
      metadata: {
        period_name: period?.period_name,
        type: row.adjustment_type,
        old_item_name: row.item_name,
        new_item_name: itemName,
        old_amount: row.amount,
        new_amount: amount,
      },
    });
    return NextResponse.json({ data: data?.[0] ?? { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "แก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* */ }

  try {
    const a = supabaseAdmin();
    const { data: rowData } = await a.from("payroll_adjustments")
      .select("id, payroll_period_id, item_name, amount, adjustment_type").eq("id", id).limit(1);
    const row = rowData?.[0] as { payroll_period_id: string; item_name: string; amount: number; adjustment_type: string } | undefined;
    if (!row) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

    const { data: pdata } = await a.from("payroll_periods").select("status, period_name").eq("id", row.payroll_period_id).limit(1);
    const period = pdata?.[0] as { status: string; period_name: string } | undefined;
    if (period && !EDITABLE.has(String(period.status))) {
      return NextResponse.json({ error: `งวดสถานะ "${period.status}" แก้ไม่ได้` }, { status: 409 });
    }

    const { error } = await a.from("payroll_adjustments").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(a, {
      action: "delete", entityType: "payroll_adjustments", entityId: id, actorId: userId,
      metadata: { period_name: period?.period_name, type: row.adjustment_type, item_name: row.item_name, amount: row.amount },
    });
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
