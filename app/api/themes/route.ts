/**
 * คลังธีม (ธีมกลาง ERP เฟส 2 · docs/erp-theme.md)
 * GET  /api/themes[?trash=1]                         → { data: ThemeRow[] }  (theme.view)
 * POST /api/themes { name, preset_key?, from_id?, config? } → สร้างธีมใหม่ / ทำสำเนา (theme.edit)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { THEME_COLS, hasUnpublished, themeActor, type ThemeRow } from "@/lib/erp-themes-server";
import { normalizeThemeConfig, presetConfig } from "@/lib/erp-theme-config";
import { usageByTheme } from "@/lib/erp-theme-assign";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "theme.view"); if (denied) return denied;
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  let q = supabaseAdmin().from("erp_themes").select(THEME_COLS).order("updated_at", { ascending: false }).limit(500);
  q = trash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: "โหลดคลังธีมไม่สำเร็จ", details: error.message }, { status: 500 });
  const rows = (data ?? []) as ThemeRow[];
  const [{ count }, { data: asg }] = await Promise.all([
    trash ? Promise.resolve({ count: rows.length }) : supabaseAdmin().from("erp_themes").select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
    supabaseAdmin().from("erp_theme_assignments").select("scope, theme_id"),
  ]);
  const usage = usageByTheme((asg ?? []) as { scope: string; theme_id: string }[]);
  return NextResponse.json({
    data: rows.map((r) => ({ ...r, has_unpublished: hasUnpublished(r), usage: usage[r.id] ?? { apps: [], company: false } })),
    trash_count: count ?? 0, error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "theme.edit"))) return NextResponse.json({ error: "คุณไม่มีสิทธิ์สร้างธีม (theme.edit)" }, { status: 403 });
  const actor = await themeActor(request);
  let body: { name?: string; preset_key?: string; from_id?: string; config?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const admin = supabaseAdmin();

  let config = body.config ? normalizeThemeConfig(body.config) : presetConfig(body.preset_key);
  let preset = body.preset_key ?? null;
  let name = (body.name ?? "").trim().slice(0, 80);
  if (body.from_id) {
    const { data: src } = await admin.from("erp_themes").select("name,preset_key,draft_config").eq("id", body.from_id).maybeSingle();
    if (!src) return NextResponse.json({ error: "ไม่พบธีมต้นฉบับ" }, { status: 404 });
    config = normalizeThemeConfig(src.draft_config);
    preset = src.preset_key;
    if (!name) name = `${src.name} (สำเนา)`.slice(0, 80);
  }
  if (!name) return NextResponse.json({ error: "กรุณาตั้งชื่อธีม" }, { status: 400 });

  const { data, error } = await admin.from("erp_themes").insert({
    name, preset_key: preset, draft_config: config,
    created_by: actor?.id ?? null, created_by_name: actor?.name ?? null,
    updated_by: actor?.id ?? null, updated_by_name: actor?.name ?? null,
  }).select(THEME_COLS).single();
  if (error) return NextResponse.json({ error: "สร้างธีมไม่สำเร็จ", details: error.message }, { status: 500 });

  await writeAudit(admin, {
    action: body.from_id ? "duplicate" : "create", entityType: "erp_theme", entityId: data.id,
    actorId: actor?.id, actorName: actor?.name, metadata: { record_label: name, preset_key: preset, from_id: body.from_id ?? null },
  });
  return NextResponse.json({ data, error: null });
}
