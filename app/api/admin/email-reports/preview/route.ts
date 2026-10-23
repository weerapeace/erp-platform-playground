/**
 * 📧 ดูตัวอย่างอีเมลรายงาน (ข้อมูลจริง ณ ตอนนี้ · ไม่ส่งจริง)
 * POST /api/admin/email-reports/preview  body: ค่าฟอร์ม (ยังไม่บันทึกก็ได้) → { subject, html, total, shown, fill, error }
 * fill = จำนวนงานที่มีข้อมูลแต่ละช่องจริง (หน้าตั้งค่าโชว์ข้างชื่อช่องใน "โชว์อะไรในอีเมล")
 * ไม่ตรวจผู้รับ/สวิตช์เปิด — ดูหน้าตาได้แม้ยังไม่ใส่ผู้รับ · สิทธิ์: admin.email_reports
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { normalizeReportInput } from "@/lib/email-report/shared";
import { buildReportEmail } from "@/lib/email-report/sources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.email_reports"); if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // ตัวอย่าง: ไม่บังคับผู้รับ/สวิตช์ — ปิดสวิตช์ก่อนตรวจ จะได้ไม่โดน "ยังไม่มีผู้รับ"
  const parsed = normalizeReportInput({ ...(body ?? {}), is_enabled: false, name: String(body?.name ?? "").trim() || "ตัวอย่างรายงาน" });
  if ("error" in parsed) return NextResponse.json({ subject: "", html: "", total: 0, shown: 0, error: parsed.error }, { status: 400 });
  try {
    const { built, email } = await buildReportEmail(supabaseAdmin(), parsed.value);
    return NextResponse.json({ subject: email.subject, html: email.html, total: built.total, shown: built.shown, fill: built.fieldFill ?? {}, error: null });
  } catch (e) {
    console.error("[email-reports/preview]", e);
    return NextResponse.json({ subject: "", html: "", total: 0, shown: 0, error: "ดึงข้อมูลตัวอย่างไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
