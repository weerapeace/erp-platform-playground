/**
 * ตั้งค่ากลุ่ม LINE สำหรับแจ้งเตือน "ขอซื้อ" (เหมือน china-pay จับ group id)
 *
 * GET  → { captured, captured_at, current, has_token }   // group id ล่าสุดที่บอทจับได้ + กลุ่มขอซื้อปัจจุบัน
 * POST { group_id } → บันทึกเป็นกลุ่มขอซื้อ (merge groups.purchase_request ไม่ทับ config อื่น)
 * POST { test: true } → ส่งข้อความทดสอบเข้ากลุ่มขอซื้อ
 *
 * ใช้บอท/โทเคนเดิมจาก china_app_settings.line_config · webhook (line-webhook) เขียน group_id ให้อัตโนมัติ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LineCfg = { token?: string; group_id?: string; group_captured_at?: string; groups?: Record<string, string> } & Record<string, unknown>;
type Admin = ReturnType<typeof supabaseAdmin>;

async function readCfg(admin: Admin): Promise<{ id?: string; cfg: LineCfg }> {
  const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
  return { id: (row as { id?: string } | null)?.id, cfg: ((row as { sval?: LineCfg } | null)?.sval ?? {}) as LineCfg };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { cfg } = await readCfg(supabaseAdmin());
  return NextResponse.json({
    captured: cfg.group_id ?? "",
    captured_at: cfg.group_captured_at ?? null,
    current: cfg.groups?.purchase_request ?? "",
    has_token: !!cfg.token,
    error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const admin = supabaseAdmin();
  let body: { group_id?: string; test?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { id, cfg } = await readCfg(admin);

  // ทดสอบส่งเข้ากลุ่มขอซื้อปัจจุบัน
  if (body.test) {
    const target = cfg.groups?.purchase_request || "";
    if (!cfg.token || !target) return NextResponse.json({ error: "ยังไม่ได้ตั้งกลุ่มขอซื้อ หรือยังไม่มีโทเคนบอท", needConfig: true }, { status: 400 });
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ to: target, messages: [{ type: "text", text: "🛒 ทดสอบแจ้งเตือนขอซื้อ — กลุ่มนี้พร้อมรับแจ้งเตือนใบขอซื้อแล้ว ✅" }] }),
    });
    if (!r.ok) return NextResponse.json({ error: `ส่งไม่สำเร็จ (${r.status}) — ตรวจว่าบอทอยู่ในกลุ่มนี้ + group id ถูกต้อง` }, { status: 502 });
    return NextResponse.json({ ok: true, sent: true, error: null });
  }

  // บันทึกกลุ่มขอซื้อ (merge — ไม่ทับ token/กลุ่มอื่นของ china-pay)
  const gid = String(body.group_id ?? "").trim();
  if (!gid) return NextResponse.json({ error: "ยังไม่มี group id (กดดึง group id ล่าสุดก่อน)" }, { status: 400 });
  const next: LineCfg = { ...cfg, groups: { ...(cfg.groups ?? {}), purchase_request: gid } };
  if (id) await admin.from("china_app_settings").update({ sval: next }).eq("id", id);
  else await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
  return NextResponse.json({ ok: true, saved: gid, error: null });
}
