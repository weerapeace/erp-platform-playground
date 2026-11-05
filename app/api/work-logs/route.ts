/**
 * 📝 ใบจดผลงาน — /api/work-logs
 *   GET  ?status=review|confirmed|all&limit=  → รายการรูปที่ส่งเข้ามา (ล่าสุดก่อน)
 *   POST { file_ref, qr_text?, mo_id? }        → บันทึกรูป + ให้ AI อ่านทันที → { id, status, error }
 *     file_ref ต้องเป็นไฟล์หมวด work_logs (อัปผ่าน lib/file-upload uploadFileByRule ก่อน)
 *     มี QR = รู้ใบสั่งผลิต/หน้า/ขั้นตอนเอง · ไม่มี QR = ต้องส่ง mo_id (หรือเลือกทีหลังในหน้าตรวจแล้วกดอ่านใหม่)
 *   สิทธิ์: ดู products.view · ส่งรูป products.edit (เหมือนบอร์ดจ่ายงาน) · audit ทุกครั้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { isRefForCategory } from "@/lib/file-ref";
import { parseWorkLogQr } from "@/lib/work-log-read";
import { aiToRows, loadActiveEmployees, loadWorkLogLayout, readWorkLogImage, WORK_LOG_AI_MODEL } from "@/lib/work-log-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const SHEET_LIST = "id, mo_id, mo_no, page_no, page_total, status, ai_error, file_ref, uploaded_by_name, confirmed_by_name, confirmed_at, created_at, ai_result";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status") ?? "open";
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 60));
  let q = supabaseAdmin().from("work_log_sheets").select(SHEET_LIST).order("created_at", { ascending: false }).limit(limit);
  if (status === "open") q = q.in("status", ["reading", "review", "failed"]);
  else if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: "โหลดรายการใบจดไม่สำเร็จ" }, { status: 500 });
  const rows = ((data ?? []) as Record<string, unknown>[]).map(({ ai_result, ...r }) => ({
    ...r, line_count: Array.isArray((ai_result as { rows?: unknown[] } | null)?.rows) ? ((ai_result as { rows: unknown[] }).rows.length) : 0,
  }));
  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { file_ref?: string; qr_text?: string | null; mo_id?: string | null };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const fileRef = String(b.file_ref ?? "").trim();
  if (!isRefForCategory(fileRef, "work_logs")) return NextResponse.json({ error: "ไฟล์รูปไม่ถูกต้อง กรุณาอัปโหลดใหม่" }, { status: 400 });

  const admin = supabaseAdmin();
  const qr = parseWorkLogQr(b.qr_text);
  const layout = await loadWorkLogLayout(admin, qr, b.mo_id ?? null);
  if (qr && !layout.mo) return NextResponse.json({ error: "QR บนใบชี้ไปที่ใบสั่งผลิตที่ไม่มีในระบบแล้ว" }, { status: 400 });

  const { data: ins, error: insErr } = await admin.from("work_log_sheets").insert({
    mo_id: layout.mo?.id ?? null, mo_no: layout.mo?.mo_no ?? null, page_no: layout.page, page_total: layout.total,
    lines_per_step: layout.linesPerStep, qr_text: qr ? String(b.qr_text) : null, file_ref: fileRef, status: "reading",
    uploaded_by: user?.id ?? null, uploaded_by_name: user?.email ?? null,
  }).select("id").single();
  if (insErr || !ins) return NextResponse.json({ error: "บันทึกรูปไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const id = String((ins as { id: string }).id);

  let status: "review" | "failed" = "review";
  let aiError: string | null = null;
  let rows: unknown[] = [];
  if (!layout.mo) {
    aiError = "ไม่พบ QR บนรูป — เลือกใบสั่งผลิตในหน้าตรวจ แล้วกด \"ให้ AI อ่านใหม่\"";
    status = "failed";
  } else {
    try {
      const employees = await loadActiveEmployees(admin);
      const ai = await readWorkLogImage(admin, fileRef, layout, employees);
      rows = aiToRows(ai, layout, employees);
      await admin.from("work_log_sheets").update({ ai_result: { rows, raw: ai }, ai_model: WORK_LOG_AI_MODEL, read_at: new Date().toISOString(), status, updated_at: new Date().toISOString() }).eq("id", id);
    } catch (e) {
      aiError = e instanceof Error ? e.message : "AI อ่านรูปไม่สำเร็จ";
      status = "failed";
    }
  }
  if (status === "failed") await admin.from("work_log_sheets").update({ status, ai_error: aiError, updated_at: new Date().toISOString() }).eq("id", id);

  await writeAudit(admin, { action: "work_log.upload", entityType: "work_log_sheet", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { mo_no: layout.mo?.mo_no ?? null, page: layout.page, from_qr: !!qr, rows: rows.length, error: aiError } });
  return NextResponse.json({ id, status, rows: rows.length, mo_no: layout.mo?.mo_no ?? null, page: layout.page, error: aiError });
}
