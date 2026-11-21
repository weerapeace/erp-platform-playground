/**
 * ไลน์บริษัท — สแกน QR (เปิดจากหน้าเล็ก LIFF /a?cq=) · สาธารณะ ไม่ต้อง login ERP
 * ความปลอดภัย: ยืนยันตัวตน LINE ด้วย id_token ทุกครั้ง + ขั้นยืนยันตามชนิด QR (lib/line-company-qr-server)
 * GET  /api/line-company-qr?c=<รหัส>   → QR นี้คืออะไร { kind, shop_name }
 * POST /api/line-company-qr  { c, id_token, employee_code?, phone?, shop_name?, contact_name? } → ผูกตามชนิด QR
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { companyQrInfo, submitCompanyQr } from "@/lib/line-company-qr-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fail = (e: unknown) =>
  NextResponse.json({ data: null, error: e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ กรุณาลองใหม่" }, { status: 400 });

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ data: await companyQrInfo(supabaseAdmin(), req.nextUrl.searchParams.get("c")), error: null });
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ data: await submitCompanyQr(supabaseAdmin(), body), error: null });
  } catch (e) { return fail(e); }
}
