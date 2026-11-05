/**
 * GET /api/line/pending — รายการจากไลน์ที่ยังรอคนจัดการ (แท็บ LINE ในศูนย์แจ้งเตือน · lib/line-pending)
 * ส่งเฉพาะส่วนที่คนนี้มีสิทธิ์ดู: งานออกแบบ = products.view · คำสั่งซื้อ = po.view · ไม่มีสักส่วน = {} (แท็บไม่ขึ้น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { designPending, orderPending, type LinePendingPayload } from "@/lib/line-pending";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await requestActor(supabaseFromRequest(request))).id) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const [canDesign, canOrder] = await Promise.all([apiCan(request, "products.view"), apiCan(request, "po.view")]);
  const admin = supabaseAdmin();
  const [design, order] = await Promise.all([
    canDesign ? designPending(admin).catch(() => undefined) : Promise.resolve(undefined),
    canOrder ? orderPending(admin).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const data: LinePendingPayload = { design, order };
  return NextResponse.json({ data, error: null });
}
