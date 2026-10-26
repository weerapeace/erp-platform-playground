/**
 * /api/push/dispatch — ส่งแจ้งเตือนเด้งเข้ามือถือ ของแถวใหม่ใน erp_notifications
 *
 * ผู้เรียก = trigger ใน DB (erp_push_after_notify → pg_net) ทันทีที่มีแจ้งเตือนใหม่ของคนที่เปิดรับไว้
 * ยืนยันตัวด้วย header x-cron-token = โทเคนใน Supabase Vault ชื่อ push_dispatch (ตรวจผ่าน RPC erp_cron_token_ok)
 * ส่งซ้ำไม่ได้: dispatchPush จองแถวด้วย pushed_at ก่อนส่ง · แถวเก่ากว่า 30 นาทีข้าม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dispatchPush } from "@/lib/push-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const admin = supabaseAdmin();
  const token = request.headers.get("x-cron-token");
  const { data: ok } = token
    ? await admin.rpc("erp_cron_token_ok", { p_name: "push_dispatch", p_token: token })
    : { data: false };
  if (ok !== true) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { ids?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  try {
    const stats = await dispatchPush(admin, ids);
    if (stats.failed) console.warn("[push] ส่งไม่ถึงบางเครื่อง", stats);
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    console.error("[push] dispatch ล้มเหลว:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
