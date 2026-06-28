/**
 * ตั้งค่า "ฟิลด์ Parent SKU ที่ต้องกรอกก่อนส่งงาน" (ค่ากลาง) — /api/creative-submit-settings
 * GET → { fields: string[] }   PUT body = { fields: string[] }
 * เก็บใน ui_config(key='creative_submit_required_fields') · guardApi tasks.view/tasks.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY = "creative_submit_required_fields";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", KEY).maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  return NextResponse.json({ fields: Array.isArray(v) ? v : [], error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  let body: { fields?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const fields = Array.isArray(body.fields) ? body.fields.filter((x) => typeof x === "string") : [];
  const { error } = await supabaseAdmin().from("ui_config")
    .upsert({ key: KEY, value: fields, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, error: null });
}
