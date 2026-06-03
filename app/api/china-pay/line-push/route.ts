/**
 * POST /api/china-pay/line-push — ส่งข้อความเข้า LINE กลุ่ม (Messaging API push)
 *
 * body: { text: string }
 * อ่าน config จากตาราง china_app_settings (skey='line_config', sval={token, group_id})
 * - ถ้ายังไม่ตั้งค่า → 503 { error, needConfig:true } (ฝั่ง UI จะ fallback ไป share)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { text?: string; imageUrl?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const text = String(body.text ?? "").trim();
  const imageUrl = String(body.imageUrl ?? "").trim();
  if (!text && !imageUrl) return NextResponse.json({ error: "ไม่มีข้อความ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
  const cfg = (row?.sval ?? {}) as { token?: string; group_id?: string };
  if (!cfg.token || !cfg.group_id) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า LINE Bot", needConfig: true }, { status: 503 });
  }

  // ประกอบข้อความ: ถ้ามีรูป → ส่งรูปก่อน แล้วตามด้วยข้อความ (LINE ส่งได้สูงสุด 5 ข้อความ/ครั้ง)
  const messages: Array<Record<string, unknown>> = [];
  if (imageUrl && /^https:\/\//.test(imageUrl)) messages.push({ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl });
  if (text) messages.push({ type: "text", text: text.slice(0, 4900) });
  if (messages.length === 0) return NextResponse.json({ error: "ไม่มีข้อความ/รูป" }, { status: 400 });

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ to: cfg.group_id, messages }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ error: `LINE ตอบกลับ ${res.status}: ${t.slice(0, 200)}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
