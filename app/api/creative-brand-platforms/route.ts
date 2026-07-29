/**
 * แพลตฟอร์มเริ่มต้นต่อแบรนด์ — /api/creative-brand-platforms
 * GET → { map: { [brand_id]: string[] } }   (ลิสต์แพลตฟอร์มที่แบรนด์นั้น "ลง" · ไม่มีคีย์ = ยังไม่ตั้ง = ลงทุกที่)
 * PUT   body = { map }  → บันทึกทั้งก้อน
 *
 * เก็บใน ui_config(key='creative_brand_platforms') · guardApi tasks.view / tasks.edit
 * ใช้ตอนสร้างคอนเทนต์: เลือกแบรนด์แล้วติ๊กแพลตฟอร์มให้อัตโนมัติ (เช่น แบรนด์นี้ไม่ลง Pinterest)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY = "creative_brand_platforms";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", KEY).maybeSingle();
  const raw = (data as { value?: Record<string, unknown> } | null)?.value ?? {};
  // กันข้อมูลเพี้ยน: เก็บเฉพาะ array of string
  const map: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw)) if (Array.isArray(v)) map[k] = v.filter((x): x is string => typeof x === "string");
  return NextResponse.json({ map, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  let body: { map?: Record<string, string[]> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const { error } = await admin.from("ui_config")
    .upsert({ key: KEY, value: body.map ?? {}, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "update", entityType: "creative_brand_platforms", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brands: Object.keys(body.map ?? {}).length } });
  return NextResponse.json({ ok: true, error: null });
}
