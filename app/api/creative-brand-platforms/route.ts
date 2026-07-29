/**
 * แพลตฟอร์มเริ่มต้นต่อแบรนด์ — /api/creative-brand-platforms
 * GET → { map: { [brand_id]: string[] }, formats: { [brand_id]: { [platform]: format } } }
 *        map = ลิสต์แพลตฟอร์มที่แบรนด์นั้น "ลง" (ไม่มีคีย์ = ลงทุกที่) · formats = รูปแบบโพสต์เริ่มต้นต่อแพลตฟอร์ม
 * PUT   body = { map?, formats? } → บันทึกก้อนที่ส่งมา
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
const KEY_FMT = "creative_brand_formats";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [{ data }, { data: dataFmt }] = await Promise.all([
    admin.from("ui_config").select("value").eq("key", KEY).maybeSingle(),
    admin.from("ui_config").select("value").eq("key", KEY_FMT).maybeSingle(),
  ]);
  const raw = (data as { value?: Record<string, unknown> } | null)?.value ?? {};
  // กันข้อมูลเพี้ยน: เก็บเฉพาะ array of string
  const map: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw)) if (Array.isArray(v)) map[k] = v.filter((x): x is string => typeof x === "string");
  const rawF = (dataFmt as { value?: Record<string, unknown> } | null)?.value ?? {};
  const formats: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(rawF)) if (v && typeof v === "object" && !Array.isArray(v)) formats[k] = v as Record<string, string>;
  return NextResponse.json({ map, formats, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  let body: { map?: Record<string, string[]>; formats?: Record<string, Record<string, string>> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const rows = [] as { key: string; value: unknown; updated_at: string }[];
  if (body.map) rows.push({ key: KEY, value: body.map, updated_at: now });
  if (body.formats) rows.push({ key: KEY_FMT, value: body.formats, updated_at: now });
  if (rows.length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้บันทึก" }, { status: 400 });
  const { error } = await admin.from("ui_config").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "update", entityType: "creative_brand_platforms", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brands: Object.keys(body.map ?? {}).length } });
  return NextResponse.json({ ok: true, error: null });
}
