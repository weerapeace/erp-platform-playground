/**
 * ร่าง "งานถึงไหนแล้ว" ต่อใบสั่งผลิต (บอร์ดจ่ายงาน) — ทั้งทีมเห็น · 1 ใบ = 1 ร่าง
 *   GET                         ร่างที่ยังไม่บันทึกจริง + ที่เพิ่งบันทึกจริงไม่เกิน 7 วัน (ป้ายเขียว "อัปเดตแล้ว")
 *   PUT  { mo_no, mo_id?, steps, note? }   จด/แก้ร่าง (แทนชุดเดิม · ล้างสถานะ "อัปเดตแล้ว")
 *   POST { action:"applied", mo_no }       บันทึกจริงในป๊อปอัปเดตสำเร็จ → ร่างเป็น "อัปเดตแล้ว"
 *   DELETE ?mo_no=X             ลบร่าง
 * ตาราง mo_update_notes (RLS เปิด ไม่มี policy — ผ่าน supabaseAdmin ที่นี่เท่านั้น) · ประวัติ = audit_logs (mo_update_note.*)
 * ร่างไม่แตะตัวเลขจริงของงาน (จ่าย/คืน/QC/สต็อก/ค่าแรง) — ของจริงบันทึกผ่านป๊อปอัปเดตงาน (catch-up) เท่านั้น
 * กติกาขั้น/ค่าเริ่ม: app/master/work-board/update-note.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { unClean, type UpdateNote } from "@/app/master/work-board/update-note";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "mo_no, mo_id, steps, note, updated_by, updated_name, updated_at, applied_at, applied_name";
const RECENT_DAYS = 7;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
type Admin = ReturnType<typeof supabaseAdmin>;

/** ใครใช้ได้: คนจ่ายงาน / ใช้โหมดอัปเดตงาน / บันทึกเลย / ยืนยัน (ชุดเดียวกับคำขออัปเดตงาน) */
async function allowed(request: NextRequest) {
  const r = await Promise.all(["work_board.dispatch", "work_board.catch_up", "work_board.catch_up_direct", "work_board.catch_up_approve"].map((p) => apiCan(request, p)));
  return r.some(Boolean);
}
async function who(request: NextRequest, admin: Admin) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return null;
  const { data: p } = await admin.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle();
  const prof = p as { display_name: string | null; email: string | null } | null;
  return { id: user.id, name: prof?.display_name?.trim() || prof?.email || user.email || "ผู้ใช้" };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await allowed(request))) return bad("ต้องมีสิทธิ์จ่ายงาน / อัปเดตงาน", 401);
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
  const { data, error } = await admin.from("mo_update_notes").select(COLS)
    .or(`applied_at.is.null,applied_at.gte."${since}"`).order("updated_at", { ascending: false }).limit(3000);
  if (error) return bad("โหลดร่างไม่สำเร็จ ลองใหม่อีกครั้ง", 503);
  return NextResponse.json({ data: ((data ?? []) as UpdateNote[]).map((n) => ({ ...n, steps: unClean(n.steps) })) });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  if (!(await allowed(request))) return bad("ต้องมีสิทธิ์จ่ายงาน / อัปเดตงาน", 401);
  const admin = supabaseAdmin();
  const me = await who(request, admin);
  if (!me) return bad("ต้องเข้าสู่ระบบ", 401);
  const b = await request.json().catch(() => null) as { mo_no?: string; mo_id?: string | null; steps?: unknown; note?: string | null } | null;
  const moNo = String(b?.mo_no ?? "").trim();
  if (!moNo) return bad("ไม่พบเลขใบสั่งผลิต");
  const steps = unClean(b?.steps);
  const note = String(b?.note ?? "").trim().slice(0, 500) || null;
  if (!Object.keys(steps).length && !note) return bad("ยังไม่ได้ติ๊กขั้นไหน — ถ้าจะล้างร่าง กดลบร่าง");
  const { data: old } = await admin.from("mo_update_notes").select(COLS).eq("mo_no", moNo).maybeSingle();
  const row = { mo_no: moNo, mo_id: b?.mo_id || (old as UpdateNote | null)?.mo_id || null, steps, note,
    updated_by: me.id, updated_name: me.name, updated_at: new Date().toISOString(), applied_at: null, applied_by: null, applied_name: null };
  const { data, error } = await admin.from("mo_update_notes").upsert(row, { onConflict: "mo_no" }).select(COLS).single();
  if (error) return bad("บันทึกร่างไม่สำเร็จ ลองใหม่อีกครั้ง", 503);
  const o = old as UpdateNote | null;
  await writeAudit(admin, { action: o ? "mo_update_note.update" : "mo_update_note.create", entityType: "mo_update_notes", entityId: row.mo_id, actorId: me.id, actorName: me.name,
    metadata: { mo_no: moNo, changes: auditDiff(o ? { steps: unClean(o.steps), note: o.note } : null, { steps, note }) } });
  return NextResponse.json({ data: { ...(data as UpdateNote), steps } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await allowed(request))) return bad("ต้องมีสิทธิ์จ่ายงาน / อัปเดตงาน", 401);
  const admin = supabaseAdmin();
  const me = await who(request, admin);
  if (!me) return bad("ต้องเข้าสู่ระบบ", 401);
  const b = await request.json().catch(() => null) as { action?: string; mo_no?: string } | null;
  if (b?.action !== "applied") return bad("คำสั่งไม่ถูกต้อง");
  const moNo = String(b.mo_no ?? "").trim();
  if (!moNo) return bad("ไม่พบเลขใบสั่งผลิต");
  const { data, error } = await admin.from("mo_update_notes").update({ applied_at: new Date().toISOString(), applied_by: me.id, applied_name: me.name })
    .eq("mo_no", moNo).is("applied_at", null).select(COLS).maybeSingle();
  if (error) return bad("อัปเดตสถานะร่างไม่สำเร็จ", 503);
  if (data) await writeAudit(admin, { action: "mo_update_note.applied", entityType: "mo_update_notes", entityId: (data as UpdateNote).mo_id, actorId: me.id, actorName: me.name, metadata: { mo_no: moNo } });
  return NextResponse.json({ data: data ? { ...(data as UpdateNote), steps: unClean((data as UpdateNote).steps) } : null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!(await allowed(request))) return bad("ต้องมีสิทธิ์จ่ายงาน / อัปเดตงาน", 401);
  const admin = supabaseAdmin();
  const me = await who(request, admin);
  if (!me) return bad("ต้องเข้าสู่ระบบ", 401);
  const moNo = String(new URL(request.url).searchParams.get("mo_no") ?? "").trim();
  if (!moNo) return bad("ไม่พบเลขใบสั่งผลิต");
  const { data: old } = await admin.from("mo_update_notes").select(COLS).eq("mo_no", moNo).maybeSingle();
  const { error } = await admin.from("mo_update_notes").delete().eq("mo_no", moNo);
  if (error) return bad("ลบร่างไม่สำเร็จ", 503);
  if (old) await writeAudit(admin, { action: "mo_update_note.delete", entityType: "mo_update_notes", entityId: (old as UpdateNote).mo_id, actorId: me.id, actorName: me.name,
    metadata: { mo_no: moNo, steps: unClean((old as UpdateNote).steps), note: (old as UpdateNote).note } });
  return NextResponse.json({ data: { mo_no: moNo } });
}
