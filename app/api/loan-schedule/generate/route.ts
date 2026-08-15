/**
 * POST /api/loan-schedule/generate
 * สร้างตารางผ่อนอัตโนมัติ (3 วิธี) — supersede เวอร์ชันเดิม + สร้างเวอร์ชันใหม่ + งวดทั้งหมด
 * body: { contract_id, method, start_date?, num, reason? }
 * เรียก DB function loan_schedule_generate() (คิดสูตร amortization ในฐานข้อมูล)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// 'custom' = สร้างตัวตั้งต้นให้ก่อน แล้วผู้ใช้ไปแก้ยอดรายงวดเอง (ตารางธนาคารที่เงินต้น/ดอกเบี้ยไม่เท่ากัน)
const METHODS = new Set(["equal_installment", "equal_principal", "interest_only", "custom"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_schedules.create");
  if (denied) return denied;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { contract_id?: string; method?: string; start_date?: string | null; num?: number; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const contract_id = typeof body.contract_id === "string" ? body.contract_id : "";
  const method = typeof body.method === "string" ? body.method : "";
  const num = Math.floor(Number(body.num) || 0);
  const start_date = body.start_date ? String(body.start_date) : null;
  const reason = typeof body.reason === "string" ? body.reason : "";

  if (!contract_id) return NextResponse.json({ error: "กรุณาเลือกสัญญาเงินกู้" }, { status: 400 });
  if (!METHODS.has(method)) return NextResponse.json({ error: "วิธีคิดไม่ถูกต้อง" }, { status: 400 });
  // num = 0 ได้เฉพาะวิธี "กำหนดเอง" = สร้างตารางเปล่าไว้ก่อน (ยังไม่รู้ว่ากี่งวด) แล้วเติมงวดทีหลัง
  if (num < 0 || num > 600) return NextResponse.json({ error: "จำนวนงวดต้องอยู่ระหว่าง 1–600" }, { status: 400 });
  if (num === 0 && method !== "custom") {
    return NextResponse.json({ error: 'วิธีนี้ต้องระบุจำนวนงวด (เว้นว่างได้เฉพาะวิธี "กำหนดเอง")' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("loan_schedule_generate", {
    p_contract_id: contract_id,
    p_method: method,
    p_start_date: start_date,
    p_num: num,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: "สร้างตารางไม่สำเร็จ: " + error.message }, { status: 500 });

  await writeAudit(admin, {
    action: "loan_schedule.generate",
    entityType: "loan_schedule_versions",
    entityId: data as string,
    actorId: user?.id,
    metadata: { contract_id, method, num },
  });

  return NextResponse.json({ version_id: data, error: null });
}
