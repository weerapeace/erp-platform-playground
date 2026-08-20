/**
 * ยอดเงินสด/เงินฝากตั้งต้น — จุดเริ่มของเส้นเงินคงเหลือในหน้า /cashflow
 *
 *   GET                      → รายการบัญชีทั้งหมดที่ยังใช้งาน
 *   POST   { label, amount, as_of_date?, note? }   → เพิ่มบัญชี
 *   PATCH  { id, ... }                              → แก้
 *   DELETE ?id=                                     → ปิดใช้งาน (ไม่ลบจริง — เก็บประวัติไว้)
 *
 * ทำไมต้องกรอกเอง: ระบบยังไม่ได้ต่อ API ธนาคาร ถ้าไม่บอกว่าตอนนี้มีเงินเท่าไหร่
 * กราฟจะบอกได้แค่ "เงินเข้า-ออกเท่าไหร่" แต่บอกไม่ได้ว่า "เงินจะพอไหม"
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { todayISO } from "@/lib/cashflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type OpeningBalance = {
  id: string;
  label: string;
  amount: number;
  as_of_date: string;
  note: string | null;
  sort_order: number;
};

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.view");
  if (denied) return denied;

  const { data, error } = await supabaseAdmin()
    .from("cashflow_opening_balances")
    .select("id, label, amount, as_of_date, note, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");

  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data as OpeningBalance[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const label = str(body.label);
  if (!label) return NextResponse.json({ error: "ต้องใส่ชื่อบัญชี เช่น \"กสิกร 123-4-56789\"" }, { status: 400 });
  const amount = numOrNull(body.amount);
  if (amount === null) return NextResponse.json({ error: "ยอดเงินต้องเป็นตัวเลข" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("cashflow_opening_balances")
    .insert({
      label,
      amount,
      as_of_date: str(body.as_of_date) || todayISO(),
      note: str(body.note) || null,
      sort_order: Number(body.sort_order) || 0,
      created_by: user?.email ?? null,
      updated_by: user?.email ?? null,
    })
    .select("id, label, amount, as_of_date, note, sort_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "cashflow_opening_balances", entityId: String((data as { id: string }).id),
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { label, amount },
  });
  return NextResponse.json({ data: data as OpeningBalance, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const id = str(body.id);
  if (!id) return NextResponse.json({ error: "ไม่ระบุบัญชี" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin
    .from("cashflow_opening_balances").select("label, amount, as_of_date").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบบัญชีนี้" }, { status: 404 });

  // แก้เฉพาะช่องที่ส่งมาจริง (ไม่เขียนทับช่องอื่นเป็นค่าว่าง)
  const patch: Record<string, unknown> = { updated_by: user?.email ?? null };
  if (body.label !== undefined) {
    const label = str(body.label);
    if (!label) return NextResponse.json({ error: "ชื่อบัญชีว่างไม่ได้" }, { status: 400 });
    patch.label = label;
  }
  if (body.amount !== undefined) {
    const amount = numOrNull(body.amount);
    if (amount === null) return NextResponse.json({ error: "ยอดเงินต้องเป็นตัวเลข" }, { status: 400 });
    patch.amount = amount;
  }
  if (body.as_of_date !== undefined) patch.as_of_date = str(body.as_of_date) || todayISO();
  if (body.note !== undefined) patch.note = str(body.note) || null;
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;

  const { data, error } = await admin
    .from("cashflow_opening_balances").update(patch).eq("id", id)
    .select("id, label, amount, as_of_date, note, sort_order").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "cashflow_opening_balances", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { changed: Object.keys(patch).filter((k) => k !== "updated_by"), before, after: data },
  });
  return NextResponse.json({ data: data as OpeningBalance, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const id = str(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "ไม่ระบุบัญชี" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin
    .from("cashflow_opening_balances").select("label, amount").eq("id", id).maybeSingle();

  const { error } = await admin
    .from("cashflow_opening_balances").update({ is_active: false, updated_by: user?.email ?? null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "delete", entityType: "cashflow_opening_balances", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { soft: true, before },
  });
  return NextResponse.json({ data: { ok: true }, error: null });
}
