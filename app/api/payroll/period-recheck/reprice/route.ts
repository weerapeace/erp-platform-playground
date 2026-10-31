import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { applyPeriodReprice } from "@/lib/payroll-period-recheck-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** คิดราคาใหม่ — สาย/ขาด/ลา/OT ที่ราคาไม่ตรงสูตรตอนนี้ (หน้าตรวจทั้งงวด)
 *  body { period_id, items: [{ key, new_amount }] } = รายการที่ผู้ใช้เห็นในตัวอย่างและยืนยัน
 *  สิทธิ์ employees.edit · เฉพาะงวด draft/review · audit ทุกรายการ */
export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: { period_id?: string; items?: { key?: unknown; new_amount?: unknown }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const periodId = String(body.period_id ?? "");
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((it) => ({ key: String(it?.key ?? ""), new_amount: Number(it?.new_amount) }))
    .filter((it) => it.key && Number.isFinite(it.new_amount));
  if (!periodId) return NextResponse.json({ error: "ต้องระบุงวด" }, { status: 400 });
  if (!items.length) return NextResponse.json({ error: "ไม่มีรายการที่จะคิดราคาใหม่" }, { status: 400 });
  if (items.length > 5000) return NextResponse.json({ error: "รายการเยอะเกินไปในครั้งเดียว" }, { status: 400 });

  let actor: { id: string | null; name: string | null } = { id: null, name: null };
  try {
    const { data } = await supabaseFromRequest(req).auth.getUser();
    actor = { id: data.user?.id ?? null, name: (data.user?.user_metadata?.full_name as string | undefined) ?? data.user?.email ?? null };
  } catch { /* ไม่มีตัวตน */ }

  try {
    const data = await applyPeriodReprice(periodId, items, actor);
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "คิดราคาใหม่ไม่สำเร็จ" }, { status: 500 });
  }
}
