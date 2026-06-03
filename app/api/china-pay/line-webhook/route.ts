/**
 * POST /api/china-pay/line-webhook — รับ event จาก LINE เพื่อ "ดึง Group ID อัตโนมัติ"
 *
 * วิธีใช้:
 *  1) ตั้ง Webhook URL ใน LINE Developers = <app>/api/china-pay/line-webhook + เปิด Use webhook
 *  2) เชิญบอทเข้ากลุ่ม → พิมพ์อะไรก็ได้ในกลุ่ม 1 ครั้ง
 *  3) route นี้จะจับ source.groupId แล้วบันทึกลง china_app_settings (line_config.group_id) อัตโนมัติ
 *
 * - ตอบ 200 เสมอ (LINE ต้องการ)
 * - ⚠️ path นี้ต้อง "ยกเว้น" จาก Cloudflare Access (ให้ LINE เรียกได้โดยไม่ต้องล็อกอิน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, hint: "LINE webhook endpoint — ใช้ POST จาก LINE" });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { events?: Array<{ source?: { type?: string; groupId?: string; roomId?: string } }> };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: true }); }

  const events = Array.isArray(body.events) ? body.events : [];
  const gid = events.map(e => e.source?.groupId || e.source?.roomId).find(Boolean);
  if (!gid) return NextResponse.json({ ok: true });   // ไม่มี group/room — ตอบผ่าน

  try {
    const admin = supabaseAdmin();
    const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
    const cur = (row?.sval ?? {}) as Record<string, unknown>;
    const next = { ...cur, group_id: gid, group_captured_at: new Date().toISOString() };
    if (row?.id) await admin.from("china_app_settings").update({ sval: next }).eq("id", row.id);
    else await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true });
}
