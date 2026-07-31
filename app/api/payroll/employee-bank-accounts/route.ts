/**
 * บัญชีธนาคารพนักงาน + ประวัติบัญชีเดิม
 * GET  /api/payroll/employee-bank-accounts?employee_id=...  → บัญชีหลัก + บัญชีเดิมทั้งหมด
 * POST /api/payroll/employee-bank-accounts                  → ตั้งบัญชีใหม่เป็นบัญชีหลัก
 *
 * เปลี่ยนบัญชี = ไม่ทับของเดิม — ปลดบัญชีเดิมเป็น "บัญชีเก่า" (is_primary=false + replaced_at)
 * แล้วเพิ่มแถวใหม่เป็นบัญชีหลัก → ย้อนดูได้ว่าเคยใช้บัญชีอะไร เปลี่ยนเมื่อไหร่ ใครเปลี่ยน
 *
 * หมายเหตุ: หน้าจอทุกที่อ่านบัญชีจากตารางนี้ก่อน (ดู payroll-employees-db.bankMap)
 * เดิมฟอร์มบันทึกลงคอลัมน์ employees.bank_* ซึ่งถูกตารางนี้ทับ → แก้แล้วจอไม่เปลี่ยน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SELECT = "id, employee_id, bank_name, bank_branch, account_no, account_name, is_primary, replaced_at, changed_by_name, note, created_at, updated_at";
const s = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const employeeId = s(req.nextUrl.searchParams.get("employee_id"));
  if (!employeeId) return NextResponse.json({ data: null, error: "ต้องระบุ employee_id" }, { status: 400 });
  try {
    const { data, error } = await supabaseAdmin()
      .from("employee_bank_accounts").select(SELECT).eq("employee_id", employeeId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return NextResponse.json({
      data: {
        primary: rows.find((r) => r.is_primary) ?? null,
        history: rows.filter((r) => !r.is_primary),
      },
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "โหลดบัญชีไม่ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const employeeId = s(body.employee_id);
  const bankName = s(body.bank_name);
  const accountNo = s(body.account_no);
  const accountName = s(body.account_name);
  if (!employeeId) return NextResponse.json({ error: "ต้องระบุพนักงาน" }, { status: 400 });
  if (!bankName) return NextResponse.json({ error: "ต้องเลือกธนาคาร" }, { status: 400 });
  if (!accountNo) return NextResponse.json({ error: "ต้องใส่เลขบัญชี" }, { status: 400 });
  if (!accountName) return NextResponse.json({ error: "ต้องใส่ชื่อบัญชี" }, { status: 400 });

  let actorId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); actorId = data.user?.id ?? null; } catch { /* */ }
  const actorName = s(body.actor) || null;

  try {
    const admin = supabaseAdmin();
    const now = new Date().toISOString();
    const { data: current, error: curErr } = await admin
      .from("employee_bank_accounts").select(SELECT).eq("employee_id", employeeId).eq("is_primary", true);
    if (curErr) throw new Error(curErr.message);
    const primary = (current ?? [])[0];

    // ค่าเหมือนเดิมทุกช่อง → แค่แก้สาขา/หมายเหตุ ไม่ต้องสร้างประวัติใหม่
    const sameAccount = primary
      && s(primary.bank_name) === bankName
      && s(primary.account_no) === accountNo
      && s(primary.account_name) === accountName;

    if (sameAccount) {
      const { data, error } = await admin.from("employee_bank_accounts")
        .update({ bank_branch: s(body.bank_branch) || null, note: s(body.note) || null, updated_at: now })
        .eq("id", primary.id).select(SELECT).limit(1);
      if (error) throw new Error(error.message);
      return NextResponse.json({ data: data?.[0] ?? null, error: null, changed: false });
    }

    // ปลดบัญชีเดิมเป็น "บัญชีเก่า" (เก็บไว้เป็นประวัติ ไม่ลบ)
    if (primary) {
      const { error } = await admin.from("employee_bank_accounts")
        .update({ is_primary: false, replaced_at: now, updated_at: now })
        .eq("id", primary.id);
      if (error) throw new Error(error.message);
    }

    const { data, error } = await admin.from("employee_bank_accounts").insert({
      employee_id: employeeId,
      bank_name: bankName,
      bank_branch: s(body.bank_branch) || null,
      account_no: accountNo,
      account_name: accountName,
      is_primary: true,
      changed_by: actorId,
      changed_by_name: actorName,
      note: s(body.note) || null,
    }).select(SELECT).limit(1);
    if (error) throw new Error(error.message);

    // คอลัมน์เดิมในตาราง employees ใช้เป็น fallback → เขียนตามให้ตรงกัน
    await admin.from("employees").update({
      bank_name: bankName, bank_account_no: accountNo,
      bank_account_name: accountName, bank_branch: s(body.bank_branch) || null,
    }).eq("id", employeeId);

    await writeAudit(admin, {
      action: primary ? "change_bank_account" : "add_bank_account",
      entityType: "employee_bank_accounts",
      entityId: String(data?.[0]?.id ?? ""),
      actorId, actorName,
      metadata: {
        employee_id: employeeId,
        from: primary ? { bank: primary.bank_name, account_no: primary.account_no } : null,
        to: { bank: bankName, account_no: accountNo, account_name: accountName },
      },
    });

    return NextResponse.json({ data: data?.[0] ?? null, error: null, changed: true, kept_old: !!primary }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกบัญชีไม่สำเร็จ" }, { status: 500 });
  }
}
