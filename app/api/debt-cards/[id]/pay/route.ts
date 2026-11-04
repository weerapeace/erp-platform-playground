/**
 * POST /api/debt-cards/[id]/pay — บันทึกว่าจ่ายบัตร / หนี้อื่นแล้ว (จ่ายเต็ม / ขั้นต่ำ / ระบุเอง)
 * body { amount, paid_date } → บวกเข้า "จ่ายแล้ว" · ตั้งวันที่จ่าย · สถานะ จ่ายบางส่วน/จ่ายครบ (กติกา lib/debt-cards)
 *
 * ใช้ที่แท็บต้องจ่าย หน้า /cashflow · สลิปแนบผ่านไฟล์แนบกลาง (entity debt_cards) ฝั่งหน้าจอก่อนเรียก API นี้
 * สิทธิ์ loan_contracts.edit (ทะเบียนหนี้ใช้สิทธิ์ชุด loan_contracts) · audit ทุกครั้ง (ก่อน/หลัง)
 * กันกดซ้อน: เขียนเฉพาะเมื่อยอดจ่ายเดิมยังเท่าตอนอ่าน (มีคนบันทึกพร้อมกัน = ให้ลองใหม่)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { applyCardPayment } from "@/lib/debt-cards";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_contracts.edit");
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ data: null, error: "ไม่พบบัตรนี้" }, { status: 404 });

  let body: { amount?: unknown; paid_date?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: row, error: readErr } = await admin.from("debt_cards")
    .select("id, card_name, statement_balance, paid_amount, paid_date, status, is_active").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ data: null, error: "โหลดข้อมูลบัตรไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  if (!row || row.is_active === false) return NextResponse.json({ data: null, error: "ไม่พบบัตรนี้ (อาจถูกปิดไปแล้ว)" }, { status: 404 });

  const r = applyCardPayment(row, Number(body.amount), String(body.paid_date ?? ""));
  if (!r.ok) return NextResponse.json({ data: null, error: r.error }, { status: 400 });

  const { data: upd, error } = await admin.from("debt_cards")
    .update({ ...r.patch, updated_at: new Date().toISOString() })
    .eq("id", id).filter("paid_amount", row.paid_amount == null ? "is" : "eq", row.paid_amount ?? null).select("id");
  if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  if (!upd?.length) return NextResponse.json({ data: null, error: "มีคนบันทึกบัตรนี้พร้อมกัน — โหลดหน้าใหม่แล้วลองอีกครั้ง" }, { status: 409 });

  await writeAuditFor(request, admin, {
    action: "pay", entityType: "debt_cards", entityId: id,
    metadata: {
      what: "บันทึกจ่ายบัตร/หนี้จากหน้ากระแสเงินสด", card: row.card_name, amount: Number(body.amount),
      before: { paid_amount: row.paid_amount, paid_date: row.paid_date, status: row.status },
      after: r.patch,
    },
  });
  return NextResponse.json({ data: r.patch, error: null });
}
