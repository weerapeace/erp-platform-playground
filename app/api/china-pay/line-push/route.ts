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
import { loadLineConfig, linePush, lineText, type LineMessage } from "@/lib/line-send";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { text?: string; imageUrl?: string; imageUrls?: unknown[]; button?: { label?: string; url?: string }; purpose?: string; to?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const text = String(body.text ?? "").trim();
  const purpose = String(body.purpose ?? "").trim();          // test | bills | transfers
  const explicitTo = String(body.to ?? "").trim();            // ระบุกลุ่มตรง ๆ (ปุ่มทดสอบ)
  const imageUrl = String(body.imageUrl ?? "").trim();
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.map((u: unknown) => String(u)).filter((u: string) => /^https:\/\//.test(u)) : [];
  const allImages = [imageUrl, ...imageUrls].filter((u) => /^https:\/\//.test(u)).slice(0, 4);   // LINE: รวมข้อความ ≤5
  if (!text && allImages.length === 0) return NextResponse.json({ error: "ไม่มีข้อความ" }, { status: 400 });

  const admin = supabaseAdmin();
  const cfg = await loadLineConfig(admin);

  // ตารางจับคู่ "เหตุการณ์ → กลุ่ม" (ตั้งเองได้ในหน้าตั้งค่า) — ค่าเริ่มต้นตามที่เคยฟิกซ์ไว้
  const DEFAULT_ROUTING: Record<string, string> = { rate: "transfers", china_bill: "bills", transfer: "transfers", test: "test" };
  const routing = { ...DEFAULT_ROUTING, ...(cfg.routing ?? {}) };
  const slot = purpose ? (routing[purpose] ?? purpose) : "";   // event → group slot
  if (!explicitTo && slot === "off") {
    return NextResponse.json({ ok: true, skipped: true });      // เหตุการณ์นี้ตั้งเป็น "ไม่ส่ง" (routing)
  }
  // ปิดจาก "ศูนย์ LINE" (disabled_events) — ยกเว้นปุ่มทดสอบ (explicitTo/purpose=test)
  if (!explicitTo && purpose && purpose !== "test" && cfg.disabled_events?.[purpose] === true) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  // เลือกกลุ่มปลายทาง: ระบุตรง (ปุ่มทดสอบ) → กลุ่มตาม slot → กลุ่มหลัก (group_id) เป็น fallback
  const target = explicitTo || (slot && cfg.groups?.[slot]) || cfg.group_id || "";
  if (!cfg.token || !target) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า LINE Bot / กลุ่มปลายทาง", needConfig: true }, { status: 503 });
  }

  // ประกอบข้อความ: รูปสรุป (ถ้ามี) + ข้อความธรรมดา (คัดลอกได้) — ไม่ส่งการ์ดปุ่มลิงก์แล้ว
  const messages: LineMessage[] = [];
  for (const u of allImages) messages.push({ type: "image", originalContentUrl: u, previewImageUrl: u });
  if (text) messages.push(lineText(text));
  if (messages.length === 0) return NextResponse.json({ error: "ไม่มีข้อความ/รูป" }, { status: 400 });

  // slot ใช้เลือกบอท — ปุ่มทดสอบ (explicitTo) ไม่รู้ slot = บอทหลัก
  const sendSlot = !explicitTo && slot && cfg.groups?.[slot] ? slot : null;
  const r = await linePush(cfg, { to: target, slot: sendSlot, messages });
  if (!r.ok) return NextResponse.json({ error: r.error, detail: r.detail ?? "" }, { status: r.status === 0 ? 500 : 502 });
  return NextResponse.json({ ok: true });
}
