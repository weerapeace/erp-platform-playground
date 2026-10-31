/**
 * สมัครรับสลิปทาง LINE ด้วยบัตร QR (เปิดจากหน้า /a?join=) — สาธารณะ ไม่ต้อง login
 * ความปลอดภัยมาจาก "รหัสลับในบัตร" (HMAC มีวันหมดอายุ) + ยืนยันตัวตน LINE ด้วย id_token
 * GET  /api/line-join?t=<token>          → พรีวิวบัตร (รหัสพนักงาน + ชื่อเล่น + สถานะ)
 * POST /api/line-join  { t, id_token }   → ผูก LINE ที่เปิดหน้าอยู่เข้ากับพนักงานเจ้าของบัตร
 */
import { NextRequest, NextResponse } from "next/server";
import { lineInvitePreview, registerLineMemberByInvite } from "@/lib/line-employee-portal-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fail = (e: unknown) =>
  NextResponse.json({ data: null, error: e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ กรุณาลองใหม่" }, { status: 400 });

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ data: await lineInvitePreview(req.nextUrl.searchParams.get("t")), error: null });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ data: await registerLineMemberByInvite({ token: body.t, id_token: body.id_token }), error: null });
  } catch (e) {
    return fail(e);
  }
}
