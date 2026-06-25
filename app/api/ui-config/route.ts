/**
 * ค่า UI ทั่วไป (key-value jsonb) — /api/ui-config
 * GET ?key=production_game → { value }
 * PATCH { key, value } → บันทึก (merge ทับทั้งก้อน)
 * ของกลาง: guardApi + supabaseAdmin · ตาราง ui_config(key, value jsonb)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const key = (new URL(request.url).searchParams.get("key") ?? "").trim();
  if (!key) return NextResponse.json({ value: {}, error: "ต้องระบุ key" }, { status: 400 });
  const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", key).maybeSingle();
  return NextResponse.json({ value: (data as { value?: Record<string, unknown> } | null)?.value ?? {}, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { key?: string; value?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = (body.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "ต้องระบุ key" }, { status: 400 });
  const { error } = await supabaseAdmin().from("ui_config")
    .upsert({ key, value: body.value ?? {}, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, error: null });
}
