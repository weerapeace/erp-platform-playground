/**
 * ตั้งค่าต่อแพลตฟอร์ม (ของกลาง Creative) — /api/creative-platform-settings
 * GET  → { settings: { [platform]: { template_key, use_caption, use_hashtags, post_url, note } } }
 * PUT  body = { settings } → บันทึกทั้งก้อน
 *
 * เก็บใน ui_config(key='creative_platform_settings') · guardApi tasks.view/tasks.edit
 * ใช้กำหนด: แม่แบบแคปชั่นเริ่มต้นต่อแพลตฟอร์ม / ปิดแคปชั่น-แฮชแท็ก / ลิงก์ไปโพสต์ / โน้ตบอกคนทำงาน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY = "creative_platform_settings";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", KEY).maybeSingle();
  const value = (data as { value?: Record<string, unknown> } | null)?.value ?? {};
  return NextResponse.json({ settings: value, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  let body: { settings?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { error } = await supabaseAdmin().from("ui_config")
    .upsert({ key: KEY, value: body.settings ?? {}, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, error: null });
}
