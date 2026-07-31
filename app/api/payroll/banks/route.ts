/**
 * ทะเบียนธนาคาร (ของกลาง) — ใช้กับ BankPicker ทุกหน้าที่ต้องเลือกธนาคาร
 * GET  /api/payroll/banks?country=TH   → รายชื่อธนาคาร (เรียงลำดับที่ตั้งไว้)
 * POST /api/payroll/banks              → เพิ่มธนาคารใหม่จากในตัวเลือกได้เลย
 *
 * account_digits = จำนวนหลักเลขบัญชีของธนาคารนั้น (ช่องกรอกใช้บอกว่า "ครบยัง")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SELECT = "id, name, code, country, account_digits, sort_order, is_active";

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  try {
    const country = (req.nextUrl.searchParams.get("country") || "").trim();
    let q = supabaseAdmin().from("banks").select(SELECT).not("is_active", "is", false);
    if (country) q = q.eq("country", country);
    const { data, error } = await q
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ data: data ?? [], error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดรายชื่อธนาคารไม่ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องใส่ชื่อธนาคาร" }, { status: 400 });

  try {
    const admin = supabaseAdmin();
    // มีอยู่แล้ว (ชื่อเดียวกัน ไม่สนตัวพิมพ์) → คืนตัวเดิม กันสร้างชื่อซ้ำอีก
    const { data: dup } = await admin.from("banks").select(SELECT).ilike("name", name).limit(1);
    if (dup?.[0]) return NextResponse.json({ data: dup[0], error: null, existed: true });

    const digits = Number(body.account_digits ?? 10);
    const { data, error } = await admin.from("banks").insert({
      name,
      code: String(body.code ?? "").trim() || null,
      country: String(body.country ?? "TH").trim() || "TH",
      account_digits: Number.isFinite(digits) && digits > 0 ? Math.round(digits) : 10,
      is_active: true,
    }).select(SELECT).limit(1);
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (!row) throw new Error("เพิ่มธนาคารไม่สำเร็จ");

    await writeAudit(admin, {
      action: "create", entityType: "banks", entityId: String(row.id),
      metadata: { name, source: "bank_picker" },
    });
    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "เพิ่มธนาคารไม่สำเร็จ" }, { status: 500 });
  }
}
