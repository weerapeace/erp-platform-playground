/**
 * ส่งรูป "แคปจากกระดาน" เข้ากลุ่ม LINE งาน Creative
 *
 * POST { image_key, caption?, entity_type?, entity_id? }
 *   - image_key = R2 key ของรูปที่ client อัปไว้ (ผ่าน /api/admin/upload)
 *   - สร้าง URL สาธารณะ (/api/r2-image = public, ไม่ต้อง auth) ให้ LINE ดึง
 *   - push image message เข้ากลุ่ม line_config.groups.creative (fallback group_id)
 *
 * ใช้บอท/โทเคนเดิมจาก china_app_settings.line_config (ชุดเดียวกับแจ้งเตือนงาน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;
type LineCfg = { token?: string; group_id?: string; groups?: Record<string, string> } & Record<string, unknown>;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { image_key?: string; caption?: string; entity_type?: string; entity_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = String(body.image_key ?? "").trim();
  if (!key || !SAFE_KEY.test(key)) return NextResponse.json({ error: "invalid image key" }, { status: 400 });
  const caption = String(body.caption ?? "").trim().slice(0, 500);

  const admin = supabaseAdmin();
  const { data: row } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
  const cfg = ((row as { sval?: LineCfg } | null)?.sval ?? {}) as LineCfg;
  const target = cfg.groups?.creative || cfg.group_id || "";
  if (!cfg.token || !target) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งกลุ่ม LINE งาน Creative (ไปที่หน้างาน → ตั้งค่า LINE)", needConfig: true }, { status: 400 });
  }

  // URL สาธารณะให้ LINE ดึงรูป — สร้างจาก host จริงของ request (Vercel prod = https)
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const imgUrl = `${proto}://${host}/api/r2-image?key=${encodeURIComponent(key)}`;

  const messages: Record<string, unknown>[] = [];
  if (caption) messages.push({ type: "text", text: caption });
  messages.push({ type: "image", originalContentUrl: imgUrl, previewImageUrl: imgUrl });

  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ to: target, messages }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return NextResponse.json({ error: `ส่ง LINE ไม่สำเร็จ (${r.status}) — ตรวจว่าบอทอยู่ในกลุ่ม + รูปเปิดสาธารณะได้`, detail: detail.slice(0, 300) }, { status: 502 });
  }

  await writeAudit(admin, {
    action: "line_push", entityType: "canvas_sketch", entityId: body.entity_id ?? null,
    actorId: user.id, actorName: user.email ?? null,
    metadata: { image_key: key, has_caption: !!caption, entity_type: body.entity_type ?? null },
  });
  return NextResponse.json({ ok: true, sent: true, error: null });
}
