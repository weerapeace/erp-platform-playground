/**
 * 🔔 ป๊อปเตือนงานที่ผู้ใช้คนนี้ต้องเห็นตอนนี้ — components/work-popup เรียกตอนเข้า ERP
 * GET /api/popups/active              → { data: WorkPopupPayload[] } (ตามวัน/เวลา/ใครเห็น/รับทราบแล้ว — lib/email-report/popup)
 * GET /api/popups/active?report=<id>  → เปิดจากกระดิ่ง ("ไว้ทีหลัง") ข้ามเงื่อนไขเวลา/รับทราบ แต่ยังต้องเป็นคนที่ควรเห็น
 * ต้องล็อกอิน (ไม่ต้องมีสิทธิ์พิเศษ — แต่ละคนเห็นเฉพาะป๊อปที่ตั้งให้ตัวเอง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { activePopupsFor } from "@/lib/email-report/popup";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const actor = await requestActor(supabaseFromRequest(request));
  if (!actor.id) return NextResponse.json({ data: [], error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const reportId = request.nextUrl.searchParams.get("report");
  if (reportId && !/^[0-9a-f-]{36}$/i.test(reportId)) return NextResponse.json({ data: [], error: "รหัสรายงานไม่ถูกต้อง" }, { status: 400 });
  try {
    const data = await activePopupsFor(supabaseAdmin(), actor.id, { reportId: reportId ?? undefined });
    return NextResponse.json({ data, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[popups/active]", e);
    return NextResponse.json({ data: [], error: "โหลดป๊อปเตือนงานไม่สำเร็จ" }, { status: 500 });
  }
}
