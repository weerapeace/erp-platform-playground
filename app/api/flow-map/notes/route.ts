/**
 * โน้ตแปะ "ทั้งทีม" บนแผนผังการทำงาน (/master/flow-map) — ตารางความคิดเห็นกลาง erp_record_comments
 *   module_key "flow_map" · comment_type "note" · record_type/record_id = กล่องหรือเส้นที่แปะ (ไม่แปะ = "view"/ชื่อผัง)
 *   metadata = { color, view, x, y, attach, author }
 * GET ทุกโน้ต · POST สร้าง · PATCH แก้ (เจ้าของ/แอดมิน) · DELETE ?id= ลบ (เจ้าของ/แอดมิน) — สร้าง/ลบ ลง audit log
 * โน้ตส่วนตัวไม่ผ่านที่นี่ (เก็บ user_ui_prefs ต่อคน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanFlowNote, FLOW_NOTE_MAX, type FlowNote, type FlowNoteData } from "@/lib/flow-map-notes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MODULE = "flow_map";
const TYPE = "note";   // ตาราง CHECK รับแค่ comment/note/system — แยกโน้ตแผนผังด้วย module_key "flow_map"
type Row = { id: string; body: string | null; created_by: string | null; metadata: Record<string, unknown> | null; created_at: string; updated_at: string | null };

function toNote(r: Row, uid: string | null): FlowNote | null {
  const d = cleanFlowNote({ ...(r.metadata ?? {}), text: r.body ?? "", at: r.updated_at ?? r.created_at });
  return d ? { ...d, id: r.id, shared: true, mine: !!uid && r.created_by === uid } : null;
}
async function who(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabaseAdmin().from("user_profiles").select("role, active").eq("id", user.id).maybeSingle();
  return { id: user.id, email: user.email ?? null, admin: !!prof?.active && prof.role === "admin" };
}
const recordOf = (d: FlowNoteData) => ({ record_type: d.attach?.kind === "n" ? "node" : d.attach?.kind === "e" ? "edge" : "view", record_id: d.attach?.id ?? d.view });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const me = await who(request);
  const { data, error } = await supabaseAdmin().from("erp_record_comments").select("id, body, created_by, metadata, created_at, updated_at")
    .eq("module_key", MODULE).eq("comment_type", TYPE).order("created_at", { ascending: true }).limit(1000);
  if (error) return NextResponse.json({ data: [], error: "โหลดโน้ตไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ data: ((data ?? []) as Row[]).map((r) => toNote(r, me?.id ?? null)).filter(Boolean), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const me = await who(request);
  if (!me) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const d = cleanFlowNote(body);
  if (!d) return NextResponse.json({ error: "ข้อมูลโน้ตไม่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_record_comments").insert({
    module_key: MODULE, comment_type: TYPE, ...recordOf(d), body: d.text, created_by: me.id,
    metadata: { color: d.color, view: d.view, x: d.x, y: d.y, attach: d.attach, author: d.author ?? me.email },
  }).select("id, body, created_by, metadata, created_at, updated_at").single();
  if (error || !data) return NextResponse.json({ error: "บันทึกโน้ตไม่สำเร็จ" }, { status: 500 });
  await writeAudit(admin, { action: "flow_map.note_create", entityType: "erp_record_comments", entityId: data.id, actorId: me.id, actorName: me.email, metadata: { text: d.text, attach: d.attach, view: d.view } });
  return NextResponse.json({ data: toNote(data as Row, me.id), error: null });
}

async function ownRow(request: NextRequest, id: string) {
  const me = await who(request);
  if (!me) return { err: NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 }) };
  const { data } = await supabaseAdmin().from("erp_record_comments").select("id, body, created_by, metadata, created_at, updated_at")
    .eq("id", id).eq("module_key", MODULE).eq("comment_type", TYPE).maybeSingle();
  if (!data) return { err: NextResponse.json({ error: "ไม่พบโน้ต" }, { status: 404 }) };
  if ((data as Row).created_by !== me.id && !me.admin) return { err: NextResponse.json({ error: "แก้/ลบได้เฉพาะโน้ตของตัวเอง" }, { status: 403 }) };
  return { me, row: data as Row };
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const r = await ownRow(request, String(body.id ?? ""));
  if (r.err) return r.err;
  const cur = r.row.metadata ?? {};
  const d = cleanFlowNote({ ...cur, text: r.row.body ?? "", ...body, view: body.view ?? cur.view });
  if (!d) return NextResponse.json({ error: "ข้อมูลโน้ตไม่ถูกต้อง" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("erp_record_comments").update({
    ...recordOf(d), body: d.text.slice(0, FLOW_NOTE_MAX), updated_at: new Date().toISOString(),
    metadata: { ...cur, color: d.color, view: d.view, x: d.x, y: d.y, attach: d.attach },
  }).eq("id", r.row.id).select("id, body, created_by, metadata, created_at, updated_at").single();
  if (error || !data) return NextResponse.json({ error: "บันทึกโน้ตไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ data: toNote(data as Row, r.me.id), error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const r = await ownRow(request, new URL(request.url).searchParams.get("id") ?? "");
  if (r.err) return r.err;
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_record_comments").delete().eq("id", r.row.id);
  if (error) return NextResponse.json({ error: "ลบโน้ตไม่สำเร็จ" }, { status: 500 });
  await writeAudit(admin, { action: "flow_map.note_delete", entityType: "erp_record_comments", entityId: r.row.id, actorId: r.me.id, actorName: r.me.email, metadata: { text: r.row.body, ...(r.row.metadata ?? {}) } });
  return NextResponse.json({ error: null });
}
