/**
 * จัดการ "ชนิดไฟล์นำเข้า" ต่อแพลตฟอร์ม — /api/platform-import-profiles
 *  GET    ?platform_id=  (products.platforms.view)
 *         → { platformCode, builtin: ImportProfile[] (จากโค้ด, อ่านอย่างเดียว), custom: DbRow[] (ผู้ใช้สร้าง) }
 *  POST   {platform_id, profile_key, label, kind, level, section, *_row_index, detect, field_map, is_active, sort_order}  (products.platforms.edit) → สร้าง
 *  PATCH  {id, ...}  (products.platforms.edit) → แก้ custom ตาม id
 *  DELETE ?id=  (products.platforms.edit) → ลบ custom
 * โปรไฟล์มาตรฐาน (Shopee 5 + generic) อยู่ในโค้ด lib/platform-import-profiles — แก้ผ่านที่นี่ไม่ได้ (ใช้ "คัดลอกไปปรับแต่ง")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { profilesForPlatform, IMPORT_TARGET_FIELDS } from "@/lib/platform-import-profiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_FIELD_KEYS = new Set(IMPORT_TARGET_FIELDS.map((f) => f.key as string));
const SEL = "id, platform_id, profile_key, label, kind, level, section, header_row_index, label_row_index, data_start_row_index, detect, field_map, is_active, sort_order, updated_at";

async function platformCodeOf(platformId: string): Promise<string> {
  const { data } = await supabaseAdmin().from("erp_platforms").select("code").eq("id", platformId).maybeSingle();
  return String((data as { code?: string } | null)?.code ?? "");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const platformId = (new URL(request.url).searchParams.get("platform_id") ?? "").trim();
  if (!platformId) return NextResponse.json({ platformCode: "", builtin: [], custom: [], error: null });
  const code = await platformCodeOf(platformId);
  const { data } = await supabaseAdmin().from("platform_import_profiles").select(SEL).eq("platform_id", platformId).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  return NextResponse.json({ platformCode: code, builtin: profilesForPlatform(code), custom: (data ?? []) as Record<string, unknown>[], error: null });
}

// ตรวจ + ปั้นแถวสำหรับบันทึก
function buildRow(body: Record<string, unknown>): { row?: Record<string, unknown>; error?: string } {
  const profile_key = String(body.profile_key ?? "").trim();
  const label = String(body.label ?? "").trim();
  if (!profile_key) return { error: "ต้องตั้งรหัสชนิดไฟล์ (profile_key)" };
  if (!label) return { error: "ต้องตั้งชื่อชนิดไฟล์" };
  if (!/^[a-z0-9_]+$/i.test(profile_key)) return { error: "รหัสชนิดไฟล์ใช้ได้เฉพาะ a-z, 0-9, _" };
  const kind = body.kind === "orders" ? "orders" : "catalog";
  const level = body.level === "variation" ? "variation" : "product";
  // field_map: เก็บเฉพาะ key มาตรฐาน + ค่าเป็น array ของชื่อคอลัมน์
  const rawMap = (body.field_map && typeof body.field_map === "object") ? body.field_map as Record<string, unknown> : {};
  const field_map: Record<string, string[]> = {};
  for (const k of Object.keys(rawMap)) {
    if (!VALID_FIELD_KEYS.has(k)) continue;
    const v = rawMap[k];
    const arr = (Array.isArray(v) ? v : [v]).map((x) => String(x ?? "").trim()).filter(Boolean);
    if (arr.length) field_map[k] = arr;
  }
  const d = (body.detect && typeof body.detect === "object") ? body.detect as Record<string, unknown> : {};
  const detect: Record<string, unknown> = {};
  if (d.metaEquals != null && String(d.metaEquals).trim() !== "") { detect.metaEquals = String(d.metaEquals).trim(); detect.metaRow = Number(d.metaRow ?? 1); detect.metaCol = Number(d.metaCol ?? 0); }
  if (Array.isArray(d.headerIncludes)) { const inc = d.headerIncludes.map((x) => String(x).trim()).filter(Boolean); if (inc.length) detect.headerIncludes = inc; }
  const ri = (v: unknown, def: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def; };
  return { row: {
    profile_key, label, kind, level,
    section: String(body.section ?? "").trim() || profile_key,
    header_row_index: ri(body.header_row_index, 0),
    label_row_index: body.label_row_index == null || body.label_row_index === "" ? null : ri(body.label_row_index, 0),
    data_start_row_index: ri(body.data_start_row_index, 1),
    detect, field_map,
    is_active: body.is_active !== false,
    sort_order: ri(body.sort_order, 0),
  } };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const platform_id = String(body.platform_id ?? "").trim();
  if (!platform_id) return NextResponse.json({ error: "ต้องระบุ platform_id" }, { status: 400 });
  const { row, error } = buildRow(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const admin = supabaseAdmin();
  const { data, error: e } = await admin.from("platform_import_profiles")
    .insert({ ...row, platform_id, created_by: user?.id ?? null, updated_by: user?.id ?? null })
    .select("id").single();
  if (e) return NextResponse.json({ error: e.code === "23505" ? "มีชนิดไฟล์รหัสนี้อยู่แล้ว" : e.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "platform_import_profile", entityId: (data as { id?: string } | null)?.id ?? null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform_id, profile_key: row!.profile_key } });
  return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id ?? null, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const { row, error } = buildRow(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const admin = supabaseAdmin();
  const { error: e } = await admin.from("platform_import_profiles").update({ ...row, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", id);
  if (e) return NextResponse.json({ error: e.code === "23505" ? "มีชนิดไฟล์รหัสนี้อยู่แล้ว" : e.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "platform_import_profile", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { profile_key: row!.profile_key } });
  return NextResponse.json({ ok: true, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("platform_import_profiles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "platform_import_profile", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ ok: true, error: null });
}
