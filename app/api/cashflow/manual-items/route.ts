/**
 * รายการเงินเข้า-ออกที่กรอกเอง (ค่าเช่า · ค่าน้ำไฟ · ภาษี · ประกันสังคม ฯลฯ)
 *
 *   GET                        → รายการทั้งหมดที่ยังใช้งาน
 *   POST   { label, amount, ... } → เพิ่ม
 *   PATCH  { id, ... }            → แก้
 *   DELETE ?id=                   → ปิดใช้งาน (ไม่ลบจริง — เก็บประวัติไว้)
 *
 * ทำไมต้องมี: เงินออกพวกนี้ไม่มีเอกสารในระบบ กระดานจึงไม่เห็น
 * ทำให้ตัวเลข "เงินออก" ต่ำกว่าความจริงทุกเดือน — พอใส่แล้วเส้นเงินคงเหลือถึงจะเชื่อได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { todayISO } from "@/lib/cashflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ManualItem = {
  id: string;
  label: string;
  direction: "in" | "out";
  amount: number;
  category: string | null;
  repeat_kind: "once" | "monthly";
  day_of_month: number | null;
  once_date: string | null;
  start_date: string | null;
  end_date: string | null;
  note: string | null;
};

const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const money = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const dateOrNull = (v: unknown) => (DATE_RE.test(str(v)) ? str(v) : null);

const SELECT = "id, label, direction, amount, category, repeat_kind, day_of_month, once_date, start_date, end_date, note";

/** แปลง body → แถวที่พร้อมเขียน · คืนข้อความไทยถ้าข้อมูลไม่ครบ */
function buildRow(body: Record<string, unknown>): { row: Record<string, unknown> } | { error: string } {
  const label = str(body.label);
  if (!label) return { error: "ต้องใส่ชื่อรายการ เช่น \"ค่าเช่าโรงงาน\"" };

  const amount = money(body.amount);
  if (amount <= 0) return { error: "จำนวนเงินต้องมากกว่า 0" };

  const direction = str(body.direction) === "in" ? "in" : "out";
  const repeat_kind = str(body.repeat_kind) === "once" ? "once" : "monthly";

  const row: Record<string, unknown> = {
    label, amount, direction, repeat_kind,
    category: str(body.category) || null,
    note: str(body.note) || null,
    start_date: dateOrNull(body.start_date),
    end_date: dateOrNull(body.end_date),
    day_of_month: null,
    once_date: null,
  };

  if (repeat_kind === "once") {
    const once = dateOrNull(body.once_date);
    if (!once) return { error: "รายการครั้งเดียวต้องระบุวันที่" };
    row.once_date = once;
  } else {
    const raw = body.day_of_month;
    const day = raw === "" || raw === null || raw === undefined ? NaN : Math.round(Number(raw));
    if (!Number.isFinite(day) || day < 0 || day > 31) {
      return { error: "รายการรายเดือนต้องระบุวันที่ของเดือน (1–31 หรือ 0 = สิ้นเดือน)" };
    }
    row.day_of_month = day;
  }

  if (row.start_date && row.end_date && String(row.end_date) < String(row.start_date)) {
    return { error: "วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม" };
  }
  return { row };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.view");
  if (denied) return denied;

  const { data, error } = await supabaseAdmin()
    .from("cashflow_manual_items").select(SELECT)
    .eq("is_active", true)
    .order("direction").order("label")
    .limit(500);

  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data as ManualItem[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const built = buildRow(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("cashflow_manual_items")
    .insert({ ...built.row, created_by: user?.email ?? null, updated_by: user?.email ?? null })
    .select(SELECT).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "cashflow_manual_items", entityId: String((data as { id: string }).id),
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: built.row,
  });
  return NextResponse.json({ data: data as ManualItem, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const id = str(body.id);
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("cashflow_manual_items").select(SELECT).eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

  // ตรวจทั้งใบเสมอ (รวมค่าเดิมที่ไม่ได้ส่งมา) — กันเคสแก้ครึ่งใบแล้วเงื่อนไขวันขัดกัน
  const built = buildRow({ ...(before as Record<string, unknown>), ...body });
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data, error } = await admin
    .from("cashflow_manual_items")
    .update({ ...built.row, updated_by: user?.email ?? null })
    .eq("id", id).select(SELECT).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "cashflow_manual_items", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { before, after: data },
  });
  return NextResponse.json({ data: data as ManualItem, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const id = str(request.nextUrl.searchParams.get("id"));
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("cashflow_manual_items").select(SELECT).eq("id", id).maybeSingle();

  const { error } = await admin
    .from("cashflow_manual_items").update({ is_active: false, updated_by: user?.email ?? null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "delete", entityType: "cashflow_manual_items", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { soft: true, before, at: todayISO() },
  });
  return NextResponse.json({ data: { ok: true }, error: null });
}
