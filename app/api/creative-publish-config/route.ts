/**
 * ตั้งค่าตัวช่วยเผยแพร่ (ของกลาง Creative) — /api/creative-publish-config
 * GET → { config: { parent_fields?: string[] } }   // คอลัมน์ Parent SKU ที่จะโชว์ใน popup เผยแพร่ (ว่าง = อัตโนมัติ)
 * PUT body = { config } → บันทึกทั้งก้อน
 * เก็บใน ui_config(key='creative_publish_config') · guardApi tasks.view/tasks.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY = "creative_publish_config";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", KEY).maybeSingle();
  const value = (data as { value?: Record<string, unknown> } | null)?.value ?? {};
  return NextResponse.json({ config: value, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  let body: { config?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { error } = await supabaseAdmin().from("ui_config")
    .upsert({ key: KEY, value: body.config ?? {}, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, error: null });
}
