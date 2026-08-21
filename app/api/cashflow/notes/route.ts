/**
 * โน้ตแปะวันบนกระดานเงินสด (/cashflow/board)
 *
 *   GET    ?from=&to=              → โน้ตในช่วงวันที่
 *   POST   { note_date, body, color } → แปะโน้ตใหม่
 *   PATCH  { id, body?, color?, note_date? } → แก้ / ย้ายไปวันอื่น
 *   DELETE ?id=                    → ลอกออก (ปิดใช้งาน ไม่ลบจริง)
 *
 * ไว้จดสิ่งที่ไม่ใช่ตัวเลข เช่น "รอเช็คเคลียร์" / "คุยกับร้านแล้ว เลื่อนได้อีก 2 อาทิตย์"
 * — เรื่องพวกนี้เดิมอยู่ในหัวคนเดียว พอกระดานจดได้ ทีมก็เห็นเหตุผลเบื้องหลังการเลื่อนวัน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLORS = new Set(["yellow", "blue", "pink", "green"]);
const MAX_LEN = 500;

export type BoardNote = {
  id: string;
  note_date: string;
  body: string;
  color: string;
  created_by: string | null;
};

const SELECT = "id, note_date, body, color, created_by";
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.view");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  let q = supabaseAdmin()
    .from("cashflow_board_notes").select(SELECT).eq("is_active", true)
    .order("note_date").limit(2000);
  if (DATE_RE.test(str(sp.get("from")))) q = q.gte("note_date", str(sp.get("from")));
  if (DATE_RE.test(str(sp.get("to")))) q = q.lte("note_date", str(sp.get("to")));

  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data as BoardNote[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const noteDate = str(body.note_date);
  const text = str(body.body).slice(0, MAX_LEN);
  if (!DATE_RE.test(noteDate)) return NextResponse.json({ error: "ไม่ระบุวันที่จะแปะโน้ต" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "โน้ตว่างเปล่า — พิมพ์ข้อความก่อน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("cashflow_board_notes")
    .insert({
      note_date: noteDate, body: text,
      color: COLORS.has(str(body.color)) ? str(body.color) : "yellow",
      created_by: user?.email ?? null, updated_by: user?.email ?? null,
    })
    .select(SELECT).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "cashflow_board_notes", entityId: String((data as { id: string }).id),
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { note_date: noteDate, body: text },
  });
  return NextResponse.json({ data: data as BoardNote, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const id = str(body.id);
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ไม่ระบุโน้ต" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_by: user?.email ?? null };
  if (body.body !== undefined) {
    const text = str(body.body).slice(0, MAX_LEN);
    if (!text) return NextResponse.json({ error: "โน้ตว่างเปล่า — ถ้าไม่ต้องการแล้วให้ลอกออกแทน" }, { status: 400 });
    patch.body = text;
  }
  if (body.color !== undefined && COLORS.has(str(body.color))) patch.color = str(body.color);
  if (body.note_date !== undefined) {
    if (!DATE_RE.test(str(body.note_date))) return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    patch.note_date = str(body.note_date);
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("cashflow_board_notes").update(patch).eq("id", id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "cashflow_board_notes", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { changed: Object.keys(patch).filter((k) => k !== "updated_by") },
  });
  return NextResponse.json({ data: data as BoardNote, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const id = str(request.nextUrl.searchParams.get("id"));
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ไม่ระบุโน้ต" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("cashflow_board_notes").select(SELECT).eq("id", id).maybeSingle();

  const { error } = await admin
    .from("cashflow_board_notes").update({ is_active: false, updated_by: user?.email ?? null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "delete", entityType: "cashflow_board_notes", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { soft: true, before },
  });
  return NextResponse.json({ data: { ok: true }, error: null });
}
