/**
 * แอปไหนใช้ธีมไหน (ธีมกลาง ERP เฟส 3 · docs/erp-theme.md)
 * GET  /api/themes/assignments                      → { assignments, apps, themes }            (theme.view)
 * PUT  /api/themes/assignments { changes: [{scope, theme_id|null}] } → บันทึกทั้งหมด · คืน previous ไว้ย้อนกลับ (theme.assign)
 * POST /api/themes/assignments { action: "clear_header", app_key }   → ให้แถบบนของแอปตามธีม (ล้างสีเดิม) · คืน previous
 *      { action: "restore_header", app_key, values }                → ย้อนสีแถบบนเดิม                       (theme.assign)
 * ทุกการเปลี่ยนลง audit (changes: auditDiff)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { themeActor } from "@/lib/erp-themes-server";
import { CLEAR_HEADER, appScope, isThemeScope, type AppHeaderFields } from "@/lib/erp-theme-assign";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const fail = (error: string, status: number, details?: string) => NextResponse.json({ error, details }, { status });
const HEADER_COLS = "key, theme_color, theme_color2, header_style, header_image";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "theme.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [a, apps, themes] = await Promise.all([
    admin.from("erp_theme_assignments").select("scope, theme_id, updated_by_name, updated_at"),
    admin.from("erp_app_groups").select(`${HEADER_COLS}, label, icon, sort_order, default_href`).order("sort_order"),
    admin.from("erp_themes").select("id, name, published_version, draft_config, published_config, deleted_at").is("deleted_at", null).order("name"),
  ]);
  const err = a.error || apps.error || themes.error;
  if (err) return fail("โหลดข้อมูลไม่สำเร็จ", 500, err.message);
  return NextResponse.json({
    assignments: a.data ?? [],
    apps: apps.data ?? [],
    themes: (themes.data ?? []).map((t) => ({ id: t.id, name: t.name, published_version: t.published_version, config: t.published_config ?? t.draft_config })),
    error: null,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "theme.assign"))) return fail("คุณไม่มีสิทธิ์เลือกธีมให้แอป (theme.assign)", 403);
  let body: { changes?: { scope?: unknown; theme_id?: unknown }[] };
  try { body = await request.json(); } catch { return fail("ข้อมูลไม่ถูกต้อง", 400); }
  const changes = (body.changes ?? []).filter((c) => isThemeScope(c.scope)).map((c) => ({ scope: c.scope as string, theme_id: typeof c.theme_id === "string" && c.theme_id ? c.theme_id : null }));
  if (!changes.length) return fail("ไม่มีรายการที่เปลี่ยน", 400);
  const admin = supabaseAdmin();
  const actor = await themeActor(request);

  // ธีมที่จะตั้งต้องมีจริง · ไม่อยู่ถังขยะ · เผยแพร่แล้ว
  const ids = [...new Set(changes.map((c) => c.theme_id).filter(Boolean))] as string[];
  if (ids.length) {
    const { data: ok } = await admin.from("erp_themes").select("id, name, published_version, deleted_at").in("id", ids);
    for (const id of ids) {
      const t = (ok ?? []).find((x) => x.id === id);
      if (!t || t.deleted_at) return fail("มีธีมที่ไม่พบหรืออยู่ในถังขยะ", 409);
      if (!t.published_version) return fail(`ธีม "${t.name}" ยังไม่เคยเผยแพร่ เผยแพร่ก่อนถึงจะเลือกให้แอปได้`, 409);
    }
  }
  const scopes = changes.map((c) => c.scope);
  const { data: beforeRows } = await admin.from("erp_theme_assignments").select("scope, theme_id").in("scope", scopes);
  const before = Object.fromEntries((beforeRows ?? []).map((r) => [r.scope as string, r.theme_id as string]));

  const now = new Date().toISOString();
  const ups = changes.filter((c) => c.theme_id).map((c) => ({ scope: c.scope, theme_id: c.theme_id, updated_by: actor?.id ?? null, updated_by_name: actor?.name ?? null, updated_at: now }));
  const dels = changes.filter((c) => !c.theme_id).map((c) => c.scope);
  if (ups.length) { const { error } = await admin.from("erp_theme_assignments").upsert(ups, { onConflict: "scope" }); if (error) return fail("บันทึกไม่สำเร็จ", 500, error.message); }
  if (dels.length) { const { error } = await admin.from("erp_theme_assignments").delete().in("scope", dels); if (error) return fail("บันทึกไม่สำเร็จ", 500, error.message); }

  const after = Object.fromEntries(changes.map((c) => [c.scope, c.theme_id]));
  await writeAudit(admin, {
    action: "update", entityType: "erp_theme_assignment", actorId: actor?.id, actorName: actor?.name,
    metadata: { record_label: `ธีมของแอป (${changes.length} รายการ)`, changes: auditDiff(before, after) },
  });
  return NextResponse.json({ ok: true, previous: scopes.map((s) => ({ scope: s, theme_id: before[s] ?? null })), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "theme.assign"))) return fail("คุณไม่มีสิทธิ์เปลี่ยนแถบบนของแอป (theme.assign)", 403);
  let body: { action?: string; app_key?: string; values?: AppHeaderFields };
  try { body = await request.json(); } catch { return fail("ข้อมูลไม่ถูกต้อง", 400); }
  const key = String(body.app_key ?? "");
  if (!isThemeScope(appScope(key))) return fail("ไม่พบแอป", 400);
  const admin = supabaseAdmin();
  const actor = await themeActor(request);
  const { data: app } = await admin.from("erp_app_groups").select(`${HEADER_COLS}, label`).eq("key", key).maybeSingle();
  if (!app) return fail("ไม่พบแอป", 404);
  const previous: AppHeaderFields = { theme_color: app.theme_color, theme_color2: app.theme_color2, header_style: app.header_style, header_image: app.header_image };

  let patch: AppHeaderFields;
  if (body.action === "clear_header") patch = { ...CLEAR_HEADER };
  else if (body.action === "restore_header" && body.values) {
    const v = body.values;
    const hex = (x: unknown) => (typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x) ? x : null);
    patch = { theme_color: hex(v.theme_color), theme_color2: hex(v.theme_color2), header_style: ["solid", "gradient", "image"].includes(String(v.header_style)) ? v.header_style! : "gradient", header_image: typeof v.header_image === "string" ? v.header_image.slice(0, 500) : null };
  } else return fail("ไม่รู้จักคำสั่งนี้", 400);

  const { error } = await admin.from("erp_app_groups").update(patch).eq("key", key);
  if (error) return fail("บันทึกไม่สำเร็จ", 500, error.message);
  await writeAudit(admin, {
    action: body.action === "clear_header" ? "update" : "restore", entityType: "erp_app_group", actorId: actor?.id, actorName: actor?.name,
    metadata: { record_label: `แถบบนของแอป ${app.label}`, app_key: key, changes: auditDiff(previous as Record<string, unknown>, patch as Record<string, unknown>) },
  });
  return NextResponse.json({ ok: true, previous, error: null });
}
