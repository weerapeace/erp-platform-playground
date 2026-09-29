/**
 * ทะเบียนธนาคาร (ของกลาง) — ใช้กับ BankPicker ทุกหน้าที่ต้องเลือกธนาคาร
 * GET  /api/payroll/banks?country=TH   → รายชื่อธนาคาร (เรียงลำดับที่ตั้งไว้)
 * GET  /api/payroll/banks?all=1        → รวมที่ปิดใช้งานแล้ว (หน้าจัดการทะเบียน)
 * POST /api/payroll/banks              → เพิ่มธนาคารใหม่จากในตัวเลือกได้เลย
 * PATCH /api/payroll/banks { id, name?, code?, account_digits?, is_active? } → แก้ชื่อที่พิมพ์ผิด / ปิด-เปิดใช้งาน
 *   ไม่มี "ลบ" — เอกสารเก่าเก็บชื่อธนาคารเป็นข้อความ ปิดใช้งานแล้วแค่ไม่ขึ้นให้เลือก ของเดิมไม่กระทบ
 *
 * account_digits = จำนวนหลักเลขบัญชีของธนาคารนั้น (ช่องกรอกใช้บอกว่า "ครบยัง")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SELECT = "id, name, code, country, account_digits, sort_order, is_active";

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  try {
    const country = (req.nextUrl.searchParams.get("country") || "").trim();
    const all = req.nextUrl.searchParams.get("all") === "1";
    let q = supabaseAdmin().from("banks").select(SELECT);
    if (!all) q = q.not("is_active", "is", false);
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

export async function PATCH(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุธนาคาร" }, { status: 400 });

  try {
    const admin = supabaseAdmin();
    const { data: curRows } = await admin.from("banks").select(SELECT).eq("id", id).limit(1);
    const cur = curRows?.[0];
    if (!cur) return NextResponse.json({ error: "ไม่พบธนาคารนี้" }, { status: 404 });

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "ต้องใส่ชื่อธนาคาร" }, { status: 400 });
      if (name !== cur.name) {
        const { data: dup } = await admin.from("banks").select("id").ilike("name", name).neq("id", id).limit(1);
        if (dup?.[0]) return NextResponse.json({ error: "มีธนาคารชื่อนี้อยู่แล้ว" }, { status: 400 });
        patch.name = name;
      }
    }
    if (body.code !== undefined) patch.code = String(body.code ?? "").trim() || null;
    if (body.account_digits !== undefined) {
      const d = Number(body.account_digits);
      if (!Number.isFinite(d) || d < 1 || d > 30) return NextResponse.json({ error: "จำนวนหลักเลขบัญชีไม่ถูกต้อง" }, { status: 400 });
      patch.account_digits = Math.round(d);
    }
    if (body.is_active !== undefined) patch.is_active = body.is_active !== false;
    if (Object.keys(patch).length === 0) return NextResponse.json({ data: cur, error: null });

    patch.updated_at = new Date().toISOString();
    const { data, error } = await admin.from("banks").update(patch).eq("id", id).select(SELECT).limit(1);
    if (error) throw new Error(error.message);

    let actorId: string | null = null, actorName: string | null = null;
    try { const { data: u } = await supabaseFromRequest(req).auth.getUser(); actorId = u.user?.id ?? null; actorName = u.user?.email ?? null; } catch { /* */ }
    await writeAudit(admin, {
      action: patch.is_active === false ? "deactivate" : patch.is_active === true && cur.is_active === false ? "restore" : "update",
      entityType: "banks", entityId: id, actorId, actorName,
      metadata: { old: { name: cur.name, code: cur.code, account_digits: cur.account_digits, is_active: cur.is_active }, new: patch },
    });
    return NextResponse.json({ data: data?.[0] ?? null, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
