/**
 * ✍ หมายเหตุที่พิมพ์เองบนหน้าพิมพ์ (ของกลาง) — ดู lib/print-notes.ts
 *   GET ?report=<ชื่อรายงาน>                          → ข้อความทั้งหมดของรายงานนั้น (ทั้งทีมเห็น)
 *   PUT { report, row_key, col_key, body }             → บันทึก (ว่าง = ลบ) · เขียน audit_logs เมื่อข้อความเปลี่ยน
 * ตารางยังไม่สร้าง → GET ตอบ { data: [], unavailable: true } · PUT ตอบ 503 (หน้าพิมพ์ใช้ข้อความเฉพาะครั้งนั้นแทน)
 * สิทธิ์ = ดูสินค้าได้ (คนที่เปิดหน้าพิมพ์ได้) · เข้าตารางด้วย service role
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanNoteBody, isMissingTableError, isPrintNoteReport, okNoteCol, okNoteRow } from "@/lib/print-notes";

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const NOT_READY = "ระบบเก็บหมายเหตุยังไม่เปิดใช้ — ข้อความใช้ได้เฉพาะการพิมพ์ครั้งนี้";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const report = new URL(request.url).searchParams.get("report");
  if (!isPrintNoteReport(report)) return bad("ไม่รู้จักรายงานนี้");
  const { data, error } = await supabaseAdmin().from("print_row_notes")
    .select("row_key, col_key, body, updated_by_name, updated_at").eq("report_key", report).limit(10000);
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ data: [], unavailable: true });
    return bad("โหลดหมายเหตุไม่สำเร็จ", 500);
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const b = await request.json().catch(() => null) as { report?: unknown; row_key?: unknown; col_key?: unknown; body?: unknown } | null;
  if (!b || !isPrintNoteReport(b.report)) return bad("ไม่รู้จักรายงานนี้");
  if (!okNoteRow(b.row_key) || !okNoteCol(b.col_key)) return bad("ระบุช่องที่จะบันทึกไม่ถูกต้อง");
  const report = b.report, row = b.row_key, col = b.col_key, body = cleanNoteBody(b.body);
  const admin = supabaseAdmin();

  const { data: old, error: readErr } = await admin.from("print_row_notes").select("body")
    .eq("report_key", report).eq("row_key", row).eq("col_key", col).maybeSingle();
  if (readErr) return isMissingTableError(readErr) ? bad(NOT_READY, 503) : bad("บันทึกหมายเหตุไม่สำเร็จ", 500);
  const before = (old as { body?: string } | null)?.body ?? "";
  if (before === body) return NextResponse.json({ ok: true, unchanged: true });

  // ใครแก้ — ชื่อจากโปรไฟล์ (เหมือน API อื่น) · หาไม่ได้ = อีเมล
  let by: string | null = null, byName: string | null = null;
  try {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    if (user) {
      by = user.id;
      const { data: p } = await admin.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle();
      const prof = p as { display_name: string | null; email: string | null } | null;
      byName = prof?.display_name?.trim() || prof?.email || user.email || null;
    }
  } catch { /* ไม่รู้ว่าใคร ก็ยังบันทึกได้ */ }

  const q = body
    ? admin.from("print_row_notes").upsert({ report_key: report, row_key: row, col_key: col, body, updated_by: by, updated_by_name: byName, updated_at: new Date().toISOString() }, { onConflict: "report_key,row_key,col_key" })
    : admin.from("print_row_notes").delete().eq("report_key", report).eq("row_key", row).eq("col_key", col);
  const { error } = await q;
  if (error) return isMissingTableError(error) ? bad(NOT_READY, 503) : bad("บันทึกหมายเหตุไม่สำเร็จ", 500);

  await writeAudit(admin, {
    action: body ? (before ? "update" : "create") : "delete", entityType: "print_row_notes", entityId: null, actorId: by, actorName: byName,
    metadata: { report, row_key: row, col_key: col, field_name: col, old_value: before || null, new_value: body || null },
  });
  return NextResponse.json({ ok: true, updated_by_name: byName });
}
