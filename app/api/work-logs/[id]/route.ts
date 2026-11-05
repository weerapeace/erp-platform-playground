/**
 * 📝 ใบจดผลงาน 1 รูป — /api/work-logs/<sheet_id>
 *   GET   → รูป + ใบสั่งผลิต + โครงหน้า + บรรทัดที่ AI อ่าน + พนักงาน + บรรทัดที่เคยบันทึกแล้วของหน้านี้
 *   PATCH { action: "confirm", rows }          → ตรวจซ้ำฝั่งเซิร์ฟเวอร์ แล้วบันทึกลง work_log_entries (บรรทัดเดิม = อัปเดต)
 *         { action: "save", rows }             → เก็บที่แก้ไว้ก่อน (ยังไม่บันทึกผลงาน)
 *         { action: "reread", mo_id? }         → ให้ AI อ่านใหม่ (ใบไม่มี QR ส่ง mo_id ที่เลือกมา)
 *         { action: "discard" }                → ทิ้งรูปนี้ (ไม่ลบไฟล์ · บรรทัดที่เคยยืนยันไม่ถูกแตะ)
 *   สิทธิ์: GET products.view · PATCH products.edit · audit ทุก action
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { parseWorkLogQr, todayBangkok, validateWorkLogRow, workMinutes, type WorkLogRow } from "@/lib/work-log-read";
import { aiToRows, loadActiveEmployees, loadWorkLogLayout, loadWorkLogMo, readWorkLogImage, WORK_LOG_AI_MODEL } from "@/lib/work-log-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

type Sheet = {
  id: string; mo_id: string | null; mo_no: string | null; page_no: number | null; page_total: number | null; lines_per_step: number | null;
  qr_text: string | null; file_ref: string; status: string; ai_result: { rows?: WorkLogRow[]; draft?: WorkLogRow[] } | null; ai_error: string | null;
  ai_model: string | null; uploaded_by_name: string | null; confirmed_by_name: string | null; confirmed_at: string | null; created_at: string;
};
type Ctx = { params: Promise<{ id: string }> };

async function loadSheet(id: string): Promise<Sheet | null> {
  const { data } = await supabaseAdmin().from("work_log_sheets").select("*").eq("id", id).maybeSingle();
  return (data as Sheet | null) ?? null;
}

/** ใบไม่มี QR → แยก key ตามรูป กันรูปคนละใบของใบสั่งผลิตเดียวกันทับกัน */
const storedKey = (sheet: Sheet, key: string) => (sheet.qr_text ? key : `s${sheet.id.slice(0, 8)}:${key}`);

export async function GET(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const sheet = await loadSheet(id);
  if (!sheet) return NextResponse.json({ error: "ไม่พบใบจดนี้" }, { status: 404 });
  const admin = supabaseAdmin();
  const [layout, employees] = await Promise.all([loadWorkLogLayout(admin, parseWorkLogQr(sheet.qr_text), sheet.mo_id), loadActiveEmployees(admin)]);
  const rows = sheet.ai_result?.draft ?? sheet.ai_result?.rows ?? [];
  let existing: Record<string, unknown>[] = [];
  if (sheet.mo_id && rows.length) {
    const { data } = await admin.from("work_log_entries").select("line_key, employee_id, work_date, start_time, end_time, qty_done, qty_waste, sheet_id, updated_at")
      .eq("mo_id", sheet.mo_id).in("line_key", rows.map((r) => storedKey(sheet, r.line_key)));
    existing = (data ?? []) as Record<string, unknown>[];
  }
  const { ai_result: _omit, ...head } = sheet;
  void _omit;
  return NextResponse.json({ data: { sheet: head, layout, rows, employees, existing: existing.map((e) => ({ ...e, line_key: String(e.line_key).replace(/^s[0-9a-f]{8}:/, "") })), today: todayBangkok() }, error: null });
}

export async function PATCH(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await params;
  let b: { action?: string; rows?: WorkLogRow[]; mo_id?: string | null };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const sheet = await loadSheet(id);
  if (!sheet) return NextResponse.json({ error: "ไม่พบใบจดนี้" }, { status: 404 });
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };

  if (b.action === "discard") {
    if (sheet.status === "confirmed") return NextResponse.json({ error: "ใบนี้ยืนยันไปแล้ว ทิ้งไม่ได้" }, { status: 400 });
    await admin.from("work_log_sheets").update({ status: "discarded", updated_at: now }).eq("id", id);
    await writeAudit(admin, { action: "work_log.discard", entityType: "work_log_sheet", entityId: id, ...actor, metadata: { mo_no: sheet.mo_no, page: sheet.page_no } });
    return NextResponse.json({ ok: true, error: null });
  }

  if (b.action === "save") {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    await admin.from("work_log_sheets").update({ ai_result: { ...(sheet.ai_result ?? {}), draft: rows }, updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true, error: null });
  }

  if (b.action === "reread") {
    if (sheet.status === "confirmed") return NextResponse.json({ error: "ใบนี้ยืนยันไปแล้ว" }, { status: 400 });
    const qr = parseWorkLogQr(sheet.qr_text);
    const moId = qr ? qr.moId : (b.mo_id ?? sheet.mo_id);
    const layout = await loadWorkLogLayout(admin, qr, moId);
    if (!layout.mo) return NextResponse.json({ error: "เลือกใบสั่งผลิตก่อน" }, { status: 400 });
    try {
      const employees = await loadActiveEmployees(admin);
      const ai = await readWorkLogImage(admin, sheet.file_ref, layout, employees);
      const rows = aiToRows(ai, layout, employees);
      await admin.from("work_log_sheets").update({
        mo_id: layout.mo.id, mo_no: layout.mo.mo_no, status: "review", ai_error: null, ai_result: { rows, raw: ai },
        ai_model: WORK_LOG_AI_MODEL, read_at: now, updated_at: now,
      }).eq("id", id);
      await writeAudit(admin, { action: "work_log.reread", entityType: "work_log_sheet", entityId: id, ...actor, metadata: { mo_no: layout.mo.mo_no, rows: rows.length } });
      return NextResponse.json({ ok: true, rows: rows.length, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI อ่านรูปไม่สำเร็จ";
      await admin.from("work_log_sheets").update({ mo_id: layout.mo.id, mo_no: layout.mo.mo_no, status: "failed", ai_error: msg, updated_at: now }).eq("id", id);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  if (b.action !== "confirm") return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
  if (!sheet.mo_id) return NextResponse.json({ error: "ใบนี้ยังไม่ได้ผูกใบสั่งผลิต" }, { status: 400 });
  const mo = await loadWorkLogMo(admin, sheet.mo_id);
  if (!mo) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต" }, { status: 400 });
  const rows = (Array.isArray(b.rows) ? b.rows : []).filter((r) => r && r.include);
  if (rows.length === 0) return NextResponse.json({ error: "ไม่มีบรรทัดที่จะบันทึก" }, { status: 400 });

  // ตรวจซ้ำฝั่งเซิร์ฟเวอร์ (หน้าเว็บอาจเก่า) + พนักงานต้องมีจริง
  const ctx = { moQty: mo.qty, today: todayBangkok() };
  const employees = new Set((await loadActiveEmployees(admin)).map((e) => e.id));
  for (const r of rows) {
    const err = validateWorkLogRow(r, ctx).find((i) => i.level === "error");
    if (err) return NextResponse.json({ error: `${r.step_name || r.line_key}: ${err.msg}` }, { status: 400 });
    if (r.employee_id && !employees.has(r.employee_id)) return NextResponse.json({ error: `${r.step_name}: พนักงานที่เลือกไม่อยู่ในรายชื่อที่ทำงานอยู่` }, { status: 400 });
  }

  const payload = rows.map((r) => ({
    sheet_id: id, mo_id: mo.id, mo_no: mo.mo_no, line_key: storedKey(sheet, r.line_key),
    step_id: r.step_id, step_code: r.step_code, step_name: r.step_name.trim(),
    employee_id: r.employee_id, name_written: r.name_written || null, work_date: r.work_date,
    start_time: r.start_time, end_time: r.end_time, minutes: workMinutes(r.start_time, r.end_time),
    qty_done: r.qty_done, qty_waste: r.qty_waste, step_done: !!r.step_done, note: r.note?.trim() || null,
    is_active: true, created_by: user?.id ?? null, created_by_name: user?.email ?? null, updated_at: now,
  }));
  const { error } = await admin.from("work_log_entries").upsert(payload, { onConflict: "mo_id,line_key" });
  if (error) return NextResponse.json({ error: "บันทึกผลงานไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  await admin.from("work_log_sheets").update({
    status: "confirmed", confirmed_by: user?.id ?? null, confirmed_by_name: user?.email ?? null, confirmed_at: now,
    ai_result: { ...(sheet.ai_result ?? {}), draft: b.rows }, updated_at: now,
  }).eq("id", id);
  await writeAudit(admin, { action: "work_log.confirm", entityType: "work_log_sheet", entityId: id, ...actor,
    metadata: { mo_no: mo.mo_no, page: sheet.page_no, lines: payload.length, qty_done: payload.reduce((a, p) => a + (p.qty_done ?? 0), 0) } });
  return NextResponse.json({ ok: true, saved: payload.length, error: null });
}
