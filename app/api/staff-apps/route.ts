/**
 * /api/staff-apps — แอปพนักงาน (ตัวช่วยสร้างใน /admin/app-manager · docs/staff-apps.md · กฎ lib/staff-apps.ts)
 * สิทธิ์: admin.users ทุกคำสั่ง (เหมือนหน้าจัดการแอป)
 *
 * GET                    → { apps: แอปพนักงานทั้งหมด (รวมร่าง + ถังขยะ) + last_snapshot, templates }
 * GET ?versions=<id>     → { versions: [...] } ประวัติเวอร์ชันของแอป
 * POST { action, ... }
 *   create        { label, template?: <appKey แอปหลัก>, copy_from?: <id แอปพนักงาน> } → แอปร่างใหม่
 *   save_draft    { id, draft }                 → บันทึกร่าง (พนักงานยังไม่เห็น)
 *   publish       { id, note? }                 → เขียนร่างลงเมนูจริง + เก็บเวอร์ชัน
 *   unpublish     { id }                        → กลับเป็นร่าง (พนักงานไม่เห็น · ข้อมูลเดิมอยู่ครบ)
 *   load_version  { id, version_no }            → เอาเวอร์ชันเก่ามาเป็นร่าง (ยังไม่เผยแพร่ — กดเผยแพร่เองเพื่อย้อนจริง)
 *   trash         { id } / restore { id }       → ถังขยะ (กู้คืนได้)
 *   purge         { id }                        → ลบถาวร (เฉพาะที่อยู่ในถังขยะ) — ถอดแอปออกจากทุกเมนูก่อน
 * ทุกคำสั่งที่เปลี่ยนข้อมูลลง audit_logs (changes: auditDiff)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit, auditDiff } from "@/lib/audit";
import { appMenuRows } from "@/lib/app-menu-layout";
import {
  cleanDraft, draftFromMenus, newStaffAppKey, planDetachAll, planPublish, publishProblems,
  STAFF_APP_TEMPLATES, type StaffAppDraft, type MenuPublishPatch,
} from "@/lib/staff-apps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PERM = "admin.users";
const APP_COLS = "id, key, label, label_en, icon, icon_url, theme_color, sort_order, kind, status, draft, audience, published_version, published_at, deleted_at, is_active, permission_key, default_href, updated_at";
const MENU_COLS = "id, label, href, icon, section, parent_id, sort_order, app_keys, app_overrides, is_active, show_in_sidebar, permission_key";

type AppRow = {
  id: string; key: string; label: string; label_en: string | null; icon: string | null; theme_color: string | null; sort_order: number | null;
  kind: string; status: string; draft: unknown; audience: unknown; published_version: number; published_at: string | null; deleted_at: string | null;
};
type MenuRow = { id: string; label: string; section: string | null; parent_id: string | null; sort_order: number; app_keys: string[] | null; app_overrides: unknown; is_active: boolean | null; show_in_sidebar: boolean | null };

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function actor(request: NextRequest): Promise<{ id: string | null; name: string | null }> {
  try {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    if (!user) return { id: null, name: null };
    const { data: p } = await supabaseAdmin().from("user_profiles").select("display_name").eq("id", user.id).maybeSingle();
    const prof = (p ?? {}) as { display_name?: string | null };
    return { id: user.id, name: prof.display_name || user.email || null };
  } catch { return { id: null, name: null }; }
}

async function loadApp(id: string): Promise<AppRow | null> {
  const { data } = await supabaseAdmin().from("erp_app_groups").select(APP_COLS).eq("id", id).eq("kind", "staff").maybeSingle();
  return (data as AppRow | null) ?? null;
}

async function loadMenus(): Promise<MenuRow[]> {
  const { data, error } = await supabaseAdmin().from("erp_menu_items").select(MENU_COLS).order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MenuRow[];
}

async function applyMenuPatches(patches: MenuPublishPatch[]): Promise<string | null> {
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  for (const p of patches) {
    const { id, ...set } = p;
    const { error } = await admin.from("erp_menu_items").update({ ...set, updated_at: now }).eq("id", id);
    if (error) return error.message;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const deny = await guardApi(request, PERM);
  if (deny) return deny;
  const admin = supabaseAdmin();
  const vid = request.nextUrl.searchParams.get("versions");
  if (vid) {
    const { data, error } = await admin.from("erp_app_versions")
      .select("id, version_no, note, created_by_name, created_at, snapshot").eq("app_id", vid).order("version_no", { ascending: false }).limit(50);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ versions: data ?? [], error: null }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data, error } = await admin.from("erp_app_groups").select(APP_COLS).eq("kind", "staff").order("sort_order", { ascending: true });
  if (error) return bad(error.message, 500);
  const apps = (data ?? []) as AppRow[];
  // เวอร์ชันล่าสุดของแต่ละแอป (ไว้บอก "มีแก้ที่ยังไม่เผยแพร่")
  const last: Record<string, unknown> = {};
  if (apps.length) {
    const { data: vs } = await admin.from("erp_app_versions").select("app_id, version_no, snapshot").in("app_id", apps.map((a) => a.id)).order("version_no", { ascending: false });
    for (const v of (vs ?? []) as { app_id: string; snapshot: unknown }[]) if (!(v.app_id in last)) last[v.app_id] = v.snapshot;
  }
  return NextResponse.json({
    apps: apps.map((a) => ({ ...a, last_snapshot: last[a.id] ?? null })),
    templates: STAFF_APP_TEMPLATES,
    error: null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const deny = await guardApi(request, PERM);
  if (deny) return deny;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("invalid JSON"); }
  const action = String(body.action ?? "");
  const admin = supabaseAdmin();
  const who = await actor(request);
  const audit = (act: string, app: { id: string; key: string; label: string }, metadata: Record<string, unknown> = {}) =>
    writeAudit(admin, { action: `staff_app.${act}`, entityType: "erp_app_groups", entityId: app.id, actorId: who.id, actorName: who.name, metadata: { key: app.key, label: app.label, ...metadata } });
  const now = new Date().toISOString();

  // ── สร้าง (ว่าง / แม่แบบ / คัดลอก) ──
  if (action === "create") {
    const label = String(body.label ?? "").trim().slice(0, 40);
    if (!label) return bad("ตั้งชื่อแอปก่อน");
    const { data: keys } = await admin.from("erp_app_groups").select("key, sort_order");
    const all = (keys ?? []) as { key: string; sort_order: number | null }[];
    let draft: StaffAppDraft = cleanDraft({ label, sections: [], menus: [] });
    const template = typeof body.template === "string" ? body.template : "";
    const copyFrom = typeof body.copy_from === "string" ? body.copy_from : "";
    if (copyFrom) {
      const src = await loadApp(copyFrom);
      if (!src) return bad("ไม่พบแอปต้นฉบับ", 404);
      draft = cleanDraft({ ...cleanDraft(src.draft), label });
    } else if (template) {
      const tpl = STAFF_APP_TEMPLATES.find((t) => t.key === template);
      if (!tpl) return bad("ไม่พบแม่แบบนี้");
      const rows = appMenuRows((await loadMenus()) as (MenuRow & { is_active: boolean; show_in_sidebar: boolean })[], template);
      draft = draftFromMenus(label, rows, template, { icon: tpl.icon, label_en: tpl.label_en });
    }
    const key = newStaffAppKey(all.map((k) => k.key));
    const sort = Math.max(0, ...all.map((k) => k.sort_order ?? 0)) + 10;
    const row = {
      key, label, label_en: draft.label_en ?? null, icon: draft.icon ?? "📱", theme_color: draft.theme_color ?? null, sort_order: sort,
      kind: "staff", status: "draft", draft, audience: null, permission_key: null, is_active: true,
    };
    const { data, error } = await admin.from("erp_app_groups").insert(row).select(APP_COLS).single();
    if (error) return bad(error.message, 500);
    const created = data as AppRow;
    await audit("create", created, { from: copyFrom ? `copy:${copyFrom}` : template ? `template:${template}` : "blank", menus: draft.menus.length });
    return NextResponse.json({ app: created, error: null });
  }

  const id = String(body.id ?? "");
  if (!id) return bad("ต้องมี id");
  const app = await loadApp(id);
  if (!app) return bad("ไม่พบแอปพนักงานนี้", 404);

  if (action === "save_draft") {
    const draft = cleanDraft(body.draft);
    if (!draft.label) return bad("ตั้งชื่อแอปก่อน");
    const before = cleanDraft(app.draft);
    const { data, error } = await admin.from("erp_app_groups").update({ draft, updated_at: now }).eq("id", id).select(APP_COLS).single();
    if (error) return bad(error.message, 500);
    const changes = auditDiff(before as unknown as Record<string, unknown>, draft as unknown as Record<string, unknown>);
    if (changes.length) await audit("save_draft", app, { changes });
    return NextResponse.json({ app: data, error: null });
  }

  if (action === "publish") {
    const draft = cleanDraft(app.draft);
    const menus = await loadMenus();
    const problems = publishProblems(draft, menus);
    if (problems.length) return NextResponse.json({ error: problems.join(" · "), problems }, { status: 400 });
    const patches = planPublish(draft, menus, app.key);
    const err = await applyMenuPatches(patches);
    if (err) return bad(`เขียนเมนูไม่สำเร็จ: ${err}`, 500);
    const version = (app.published_version ?? 0) + 1;
    const appSet = {
      label: draft.label, label_en: draft.label_en ?? null, icon: draft.icon ?? app.icon ?? "📱", theme_color: draft.theme_color ?? null,
      audience: draft.audience ?? null, status: "published", published_version: version, published_at: now, updated_at: now,
    };
    const { data, error } = await admin.from("erp_app_groups").update(appSet).eq("id", id).select(APP_COLS).single();
    if (error) return bad(error.message, 500);
    const note = String(body.note ?? "").trim().slice(0, 200) || null;
    const { error: vErr } = await admin.from("erp_app_versions").insert({ app_id: id, version_no: version, snapshot: draft, note, created_by: who.id, created_by_name: who.name });
    if (vErr) console.warn("[staff-apps] save version failed", vErr.message);
    await audit("publish", app, {
      version, note, menus_changed: patches.length,
      changes: auditDiff(app as unknown as Record<string, unknown>, appSet as unknown as Record<string, unknown>),
    });
    return NextResponse.json({ app: data, version, menus_changed: patches.length, error: null });
  }

  if (action === "unpublish") {
    const { data, error } = await admin.from("erp_app_groups").update({ status: "draft", updated_at: now }).eq("id", id).select(APP_COLS).single();
    if (error) return bad(error.message, 500);
    await audit("unpublish", app, { changes: auditDiff({ status: app.status }, { status: "draft" }) });
    return NextResponse.json({ app: data, error: null });
  }

  if (action === "load_version") {
    const no = Number(body.version_no);
    const { data: v } = await admin.from("erp_app_versions").select("snapshot").eq("app_id", id).eq("version_no", no).maybeSingle();
    if (!v) return bad("ไม่พบเวอร์ชันนี้", 404);
    const draft = cleanDraft((v as { snapshot: unknown }).snapshot);
    const before = cleanDraft(app.draft);
    const { data, error } = await admin.from("erp_app_groups").update({ draft, updated_at: now }).eq("id", id).select(APP_COLS).single();
    if (error) return bad(error.message, 500);
    await audit("load_version", app, { version_no: no, changes: auditDiff(before as unknown as Record<string, unknown>, draft as unknown as Record<string, unknown>) });
    return NextResponse.json({ app: data, error: null });
  }

  if (action === "trash" || action === "restore") {
    const deleted_at = action === "trash" ? now : null;
    const { data, error } = await admin.from("erp_app_groups").update({ deleted_at, updated_at: now }).eq("id", id).select(APP_COLS).single();
    if (error) return bad(error.message, 500);
    await audit(action, app, { changes: auditDiff({ deleted_at: app.deleted_at }, { deleted_at }) });
    return NextResponse.json({ app: data, error: null });
  }

  if (action === "purge") {
    if (!app.deleted_at) return bad("ย้ายเข้าถังขยะก่อน ถึงจะลบถาวรได้");
    const err = await applyMenuPatches(planDetachAll(await loadMenus(), app.key));
    if (err) return bad(`ถอดแอปออกจากเมนูไม่สำเร็จ: ${err}`, 500);
    const { error } = await admin.from("erp_app_groups").delete().eq("id", id);
    if (error) return bad(error.message, 500);
    await audit("purge", app, { before: { label: app.label, draft: app.draft, published_version: app.published_version } });
    return NextResponse.json({ ok: true, error: null });
  }

  return bad("ไม่รู้จักคำสั่งนี้");
}
