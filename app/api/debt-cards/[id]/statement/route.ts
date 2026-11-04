/**
 * POST /api/debt-cards/[id]/statement — ลงใบแจ้งยอดใหม่ของบัตร / หนี้อื่น
 * body { statement_date, statement_balance, minimum_due, due_date, previous_paid_in_full }
 *   → เขียนใบใหม่ทับ · เริ่มนับจ่ายใหม่จาก 0 (กติกา lib/debt-cards newStatementPatch)
 *   → ใบเดิม (ยอด · ขั้นต่ำ · ครบกำหนด · จ่ายไปเท่าไร · ติ๊ก "ใบเดิมจ่ายครบแล้ว") เก็บไว้ใน audit metadata.previous = ประวัติใบแจ้งยอด
 *
 * ไม่มีตารางใหม่ (ตาราง debt_cards เก็บได้ใบเดียว) · สิทธิ์ loan_contracts.edit · audit ทุกครั้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { newStatementPatch } from "@/lib/debt-cards";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_contracts.edit");
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ data: null, error: "ไม่พบบัตรนี้" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: row, error: readErr } = await admin.from("debt_cards")
    .select("id, card_name, statement_date, statement_balance, minimum_due, due_date, paid_amount, paid_date, status, is_active, updated_at")
    .eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ data: null, error: "โหลดข้อมูลบัตรไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  if (!row || row.is_active === false) return NextResponse.json({ data: null, error: "ไม่พบบัตรนี้ (อาจถูกปิดไปแล้ว)" }, { status: 404 });

  const r = newStatementPatch({
    statement_date: String(body.statement_date ?? ""), statement_balance: Number(body.statement_balance),
    minimum_due: Number(body.minimum_due ?? 0), due_date: String(body.due_date ?? ""),
  });
  if (!r.ok) return NextResponse.json({ data: null, error: r.error }, { status: 400 });

  const { data: upd, error } = await admin.from("debt_cards")
    .update({ ...r.patch, updated_at: new Date().toISOString() })
    .eq("id", id).filter("paid_amount", row.paid_amount == null ? "is" : "eq", row.paid_amount ?? null).select("id");
  if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  if (!upd?.length) return NextResponse.json({ data: null, error: "มีคนแก้บัตรนี้พร้อมกัน — โหลดหน้าใหม่แล้วลองอีกครั้ง" }, { status: 409 });

  await writeAuditFor(request, admin, {
    action: "update", entityType: "debt_cards", entityId: id,
    metadata: {
      what: "ลงใบแจ้งยอดใหม่จากหน้ากระแสเงินสด", card: row.card_name,
      previous: {
        statement_date: row.statement_date, statement_balance: row.statement_balance, minimum_due: row.minimum_due,
        due_date: row.due_date, paid_amount: row.paid_amount, paid_date: row.paid_date, status: row.status,
        paid_in_full: body.previous_paid_in_full === true,
      },
      next: r.patch,
    },
  });
  return NextResponse.json({ data: r.patch, error: null });
}
