/**
 * POST /api/china-pay/line-webhook — รับ event จาก LINE เพื่อ "ดึง Group ID อัตโนมัติ"
 *
 * วิธีใช้:
 *  1) ตั้ง Webhook URL ใน LINE Developers = <app>/api/china-pay/line-webhook + เปิด Use webhook
 *  2) เชิญบอทเข้ากลุ่ม → พิมพ์อะไรก็ได้ในกลุ่ม 1 ครั้ง
 *  3) route นี้จะจับ source.groupId แล้วบันทึกลง china_app_settings (line_config.group_id) อัตโนมัติ
 *
 * - ตอบ 200 เสมอ (LINE ต้องการ)
 * - เรียกได้โดยไม่ต้องล็อกอิน (LINE เป็นคนเรียก) → 🔒 ก่อนบันทึกจะถามกลับไปที่ LINE ด้วยโทเคนบอทของเราว่า
 *   "บอทอยู่ในกลุ่ม/ห้องนี้จริงไหม" — คนนอกยิงปลอมด้วย ID มั่ว ๆ จะไม่ผ่าน (audit 2026-10-21 S7)
 *   ยังไม่มี channel secret ในระบบ → ตรวจลายเซ็น x-line-signature ไม่ได้ · ถ้าเพิ่มทีหลังให้ตรวจลายเซ็นด้วย
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
  const src = events.map(e => e.source).find(s => s?.groupId || s?.roomId);
  const gid = src?.groupId || src?.roomId;
  if (!gid || !/^[A-Za-z0-9]{10,80}$/.test(gid)) return NextResponse.json({ ok: true });   // ไม่มี group/room — ตอบผ่าน

  try {
    const admin = supabaseAdmin();
    const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
    const cur = (row?.sval ?? {}) as Record<string, unknown>;
    if (cur.group_id === gid) return NextResponse.json({ ok: true });   // กลุ่มเดิม ไม่ต้องบันทึกซ้ำ
    const token = typeof cur.token === "string" ? cur.token : "";
    if (!token) return NextResponse.json({ ok: true });   // ยังไม่ได้ตั้งโทเคนบอท → ตรวจไม่ได้ ไม่บันทึก
    const check = src?.groupId
      ? `https://api.line.me/v2/bot/group/${encodeURIComponent(gid)}/summary`
      : `https://api.line.me/v2/bot/room/${encodeURIComponent(gid)}/members/count`;
    const verified = await fetch(check, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok).catch(() => false);
    if (!verified) return NextResponse.json({ ok: true });   // บอทไม่ได้อยู่ในกลุ่มนี้ = คำขอปลอม
    const next = { ...cur, group_id: gid, group_captured_at: new Date().toISOString() };
    if (row?.id) await admin.from("china_app_settings").update({ sval: next }).eq("id", row.id);
    else await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true });
}
