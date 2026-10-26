/**
 * /api/push/test — ปุ่ม "ส่งแจ้งเตือนทดสอบ" ในแอปแจ้งเตือน (ส่งถึงตัวเองเท่านั้น)
 * สร้างแจ้งเตือนจริงเข้ากระดิ่งของตัวเอง (event push.test · เด้งเสมอ ปิดไม่ได้) แล้วส่งทันที
 * → ทดสอบทั้งเส้นทางเดียวกับของจริง · ถ้า trigger ใน DB ส่งไปก่อนแล้ว ผลจะเป็น "ระบบกำลังส่ง" (จองแถวกันส่งซ้ำ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { dispatchPush } from "@/lib/push-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const admin = supabaseAdmin();

  const { count } = await admin.from("erp_push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!count) return NextResponse.json({ error: "ยังไม่มีเครื่องไหนเปิดรับแจ้งเตือน — กด \"เปิดรับแจ้งเตือนบนเครื่องนี้\" ก่อน" }, { status: 400 });

  const time = new Date().toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
  const { data: row, error } = await admin.from("erp_notifications").insert({
    user_id: user.id, event_type: "push.test", title: "🔔 ทดสอบแจ้งเตือน",
    body: `ถ้าเห็นข้อความนี้บนมือถือ แปลว่าใช้ได้แล้ว (ส่งเมื่อ ${time} น.)`, link_url: null, priority: "normal",
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const stats = await dispatchPush(admin, [(row as { id: string }).id]);
    return NextResponse.json({ ...stats, devices: count, queued: stats.notifications === 0, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" }, { status: 500 });
  }
}
