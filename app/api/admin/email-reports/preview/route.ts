/**
 * 📧 ดูตัวอย่างอีเมลรายงาน (ข้อมูลจริง ณ ตอนนี้ · ไม่ส่งจริง)
 * POST /api/admin/email-reports/preview  body: ค่าฟอร์ม (ยังไม่บันทึกก็ได้) → { subject, html, total, shown, fill, error }
 * fill = จำนวนงานที่มีข้อมูลแต่ละช่องจริง (หน้าตั้งค่าโชว์ข้างชื่อช่องใน "โชว์อะไรในอีเมล")
 * ?format=png → รูปรายงานที่จะส่งเข้า Discord (image/png · จำนวนงานตาม discord.image_rows) — ดูได้แม้ยังไม่ตั้งบอท
 * ?format=popup → { data: WorkPopupPayload } ตัวอย่างป๊อปตอนเข้า ERP (lib/email-report/popup)
 * ไม่ตรวจผู้รับ/สวิตช์เปิด — ดูหน้าตาได้แม้ยังไม่ใส่ผู้รับ · สิทธิ์: admin.email_reports
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { normalizeReportDiscord, normalizeReportInput, normalizeReportPopup } from "@/lib/email-report/shared";
import { buildReportEmail } from "@/lib/email-report/sources";
import { renderReportPng } from "@/lib/email-report/image";
import { buildPopupPayload } from "@/lib/email-report/popup";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.email_reports"); if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // ตัวอย่าง: ไม่บังคับผู้รับ/สวิตช์/ห้อง Discord — ปิดก่อนตรวจ จะได้ไม่โดน "ยังไม่มีผู้รับ"
  const parsed = normalizeReportInput({ ...(body ?? {}), discord: {}, popup: {}, is_enabled: false, name: String(body?.name ?? "").trim() || "ตัวอย่างรายงาน" });
  if ("error" in parsed) return NextResponse.json({ subject: "", html: "", total: 0, shown: 0, error: parsed.error }, { status: 400 });
  try {
    // 🔔 ตัวอย่างป๊อปตอนเข้า ERP (มุมมองคนที่เห็นทั้งป๊อป · "งานของคุณ" = ของคนที่กดดู) — ไม่สนวัน/เวลา/รับทราบ
    if (request.nextUrl.searchParams.get("format") === "popup") {
      const actor = await requestActor(supabaseFromRequest(request));
      const data = await buildPopupPayload(supabaseAdmin(), { ...parsed.value, id: "preview", popup: normalizeReportPopup(body?.popup) }, actor.id ?? "", "all", { fresh: true, force: true });
      return NextResponse.json({ data, error: null });
    }
    const { built, email } = await buildReportEmail(supabaseAdmin(), parsed.value);
    if (request.nextUrl.searchParams.get("format") === "png") {
      try {
        const png = await renderReportPng(built, { reportName: parsed.value.name, maxRows: normalizeReportDiscord(body?.discord).image_rows });
        return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
      } catch (e) {
        console.error("[email-reports/preview] png", e);
        return NextResponse.json({ error: "วาดรูปรายงานไม่สำเร็จ — ตอนส่งจริงระบบจะส่งตัวเลขสรุปแทนรูป" }, { status: 500 });
      }
    }
    return NextResponse.json({ subject: email.subject, html: email.html, total: built.total, shown: built.shown, fill: built.fieldFill ?? {}, error: null });
  } catch (e) {
    console.error("[email-reports/preview]", e);
    return NextResponse.json({ subject: "", html: "", total: 0, shown: 0, error: "ดึงข้อมูลตัวอย่างไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
