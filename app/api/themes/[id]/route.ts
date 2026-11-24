/**
 * ธีม 1 ชุด (ธีมกลาง ERP เฟส 2 · docs/erp-theme.md)
 * GET    /api/themes/:id                       → { data: ThemeRow, versions }       (theme.view)
 * PATCH  /api/themes/:id { name?, description?, draft_config? } → บันทึกร่าง         (theme.edit)
 * POST   /api/themes/:id { action }
 *          publish { note? }        → ร่าง → ฉบับเผยแพร่ + เก็บเวอร์ชัน              (theme.publish)
 *          restore_version { version } → เอาเวอร์ชันเก่ามาเป็นร่าง (ยังไม่เผยแพร่) (theme.edit)
 *          discard_draft            → ทิ้งร่าง กลับไปเท่าฉบับเผยแพร่               (theme.edit)
 *          trash / untrash          → ย้ายลงถังขยะ / กู้คืน                         (theme.edit)
 * DELETE /api/themes/:id                       → ลบถาวร (ต้องอยู่ในถังขยะก่อน)     (theme.publish)
 * ทุกการเปลี่ยนแปลงลง audit (changes: auditDiff)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { THEME_COLS, hasUnpublished, themeActor, type ThemeRow } from "@/lib/erp-themes-server";
import { normalizeThemeConfig } from "@/lib/erp-theme-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };
const fail = (error: string, status: number, details?: string) => NextResponse.json({ error, details }, { status });

async function load(id: string): Promise<ThemeRow | null> {
  const { data } = await supabaseAdmin().from("erp_themes").select(THEME_COLS).eq("id", id).maybeSingle();
  return (data as ThemeRow | null) ?? null;
}

export async function GET(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "theme.view"); if (denied) return denied;
  const { id } = await params;
  const row = await load(id);
  if (!row) return fail("ไม่พบธีมนี้", 404);
  const { data: versions } = await supabaseAdmin().from("erp_theme_versions")
    .select("version,note,published_by_name,published_at,config").eq("theme_id", id).order("version", { ascending: false }).limit(50);
  return NextResponse.json({ data: { ...row, has_unpublished: hasUnpublished(row) }, versions: versions ?? [], error: null });
}

export async function PATCH(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!(await apiCan(request, "theme.edit"))) return fail("คุณไม่มีสิทธิ์แก้ธีม (theme.edit)", 403);
  const { id } = await params;
  const before = await load(id);
  if (!before) return fail("ไม่พบธีมนี้", 404);
  if (before.deleted_at) return fail("ธีมนี้อยู่ในถังขยะ กู้คืนก่อนแก้", 409);
  const actor = await themeActor(request);
  let body: { name?: string; description?: string | null; draft_config?: unknown };
  try { body = await request.json(); } catch { return fail("ข้อมูลไม่ถูกต้อง", 400); }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim().slice(0, 80);
    if (!n) return fail("ชื่อธีมว่างไม่ได้", 400);
    patch.name = n;
  }
  if (body.description !== undefined) patch.description = body.description ? String(body.description).slice(0, 300) : null;
  if (body.draft_config !== undefined) patch.draft_config = normalizeThemeConfig(body.draft_config);
  if (!Object.keys(patch).length) return NextResponse.json({ data: before, error: null });

  const { data, error } = await supabaseAdmin().from("erp_themes")
    .update({ ...patch, updated_by: actor?.id ?? null, updated_by_name: actor?.name ?? null, updated_at: new Date().toISOString() })
    .eq("id", id).select(THEME_COLS).single();
  if (error) return fail("บันทึกร่างไม่สำเร็จ", 500, error.message);

  const changes = auditDiff(before as unknown as Record<string, unknown>, patch);
  if (changes.length) {
    await writeAudit(supabaseAdmin(), {
      action: "update", entityType: "erp_theme", entityId: id, actorId: actor?.id, actorName: actor?.name,
      metadata: { record_label: data.name, changes },
    });
  }
  return NextResponse.json({ data: { ...data, has_unpublished: hasUnpublished(data as ThemeRow) }, error: null });
}

export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  let body: { action?: string; version?: number; note?: string };
  try { body = await request.json(); } catch { return fail("ข้อมูลไม่ถูกต้อง", 400); }
  const action = body.action ?? "";
  const needPublish = action === "publish";
  const perm = needPublish ? "theme.publish" : "theme.edit";
  if (!(await apiCan(request, perm))) return fail(`คุณไม่มีสิทธิ์ทำรายการนี้ (${perm})`, 403);

  const row = await load(id);
  if (!row) return fail("ไม่พบธีมนี้", 404);
  const actor = await themeActor(request);
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const by = { updated_by: actor?.id ?? null, updated_by_name: actor?.name ?? null, updated_at: now };
  let patch: Record<string, unknown> = {};
  let meta: Record<string, unknown> = { record_label: row.name };

  if (action === "publish") {
    if (row.deleted_at) return fail("ธีมนี้อยู่ในถังขยะ", 409);
    const config = normalizeThemeConfig(row.draft_config);
    const version = (row.published_version ?? 0) + 1;
    const { error: vErr } = await admin.from("erp_theme_versions").insert({
      theme_id: id, version, config, note: body.note ? String(body.note).slice(0, 200) : null,
      published_by: actor?.id ?? null, published_by_name: actor?.name ?? null,
    });
    if (vErr) return fail("เผยแพร่ไม่สำเร็จ", 500, vErr.message);
    patch = { published_config: config, published_version: version, published_at: now, published_by_name: actor?.name ?? null };
    meta = { ...meta, version, note: body.note ?? null };
  } else if (action === "restore_version") {
    const { data: v } = await admin.from("erp_theme_versions").select("config").eq("theme_id", id).eq("version", Number(body.version)).maybeSingle();
    if (!v) return fail("ไม่พบเวอร์ชันนี้", 404);
    patch = { draft_config: normalizeThemeConfig(v.config) };
    meta = { ...meta, version: Number(body.version) };
  } else if (action === "discard_draft") {
    if (!row.published_config) return fail("ธีมนี้ยังไม่เคยเผยแพร่ ไม่มีฉบับให้ย้อนกลับ", 409);
    patch = { draft_config: row.published_config };
  } else if (action === "trash") {
    patch = { deleted_at: now };
  } else if (action === "untrash") {
    patch = { deleted_at: null };
  } else {
    return fail("ไม่รู้จักคำสั่งนี้", 400);
  }

  const { data, error } = await admin.from("erp_themes").update({ ...patch, ...by }).eq("id", id).select(THEME_COLS).single();
  if (error) return fail("บันทึกไม่สำเร็จ", 500, error.message);
  const changes = auditDiff(row as unknown as Record<string, unknown>, patch);
  await writeAudit(admin, { action: action === "trash" ? "delete" : action === "untrash" ? "restore" : action, entityType: "erp_theme", entityId: id, actorId: actor?.id, actorName: actor?.name, metadata: { ...meta, changes } });
  return NextResponse.json({ data: { ...data, has_unpublished: hasUnpublished(data as ThemeRow) }, error: null });
}

export async function DELETE(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!(await apiCan(request, "theme.publish"))) return fail("คุณไม่มีสิทธิ์ลบถาวร (theme.publish)", 403);
  const { id } = await params;
  const row = await load(id);
  if (!row) return fail("ไม่พบธีมนี้", 404);
  if (!row.deleted_at) return fail("ต้องย้ายลงถังขยะก่อน ถึงจะลบถาวรได้", 409);
  const actor = await themeActor(request);
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_themes").delete().eq("id", id);
  if (error) return fail("ลบไม่สำเร็จ", 500, error.message);
  await writeAudit(admin, { action: "purge", entityType: "erp_theme", entityId: id, actorId: actor?.id, actorName: actor?.name, metadata: { record_label: row.name, snapshot: { name: row.name, published_version: row.published_version } } });
  return NextResponse.json({ ok: true, error: null });
}
