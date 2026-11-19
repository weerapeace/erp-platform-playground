/**
 * /api/staff-apps/announcements — กล่องประกาศบนหน้าแรกแอปพนักงาน (lib/staff-app-extras · docs/staff-apps.md)
 *   GET    ?app=<key>            → ประกาศที่ยังแสดงอยู่ (คนที่เห็นแอปนี้)
 *   GET    ?app=<key>&manage=1   → ทั้งหมดที่ยังไม่ลบ รวมที่หมดอายุ/ยังไม่ถึงวัน (ต้องมีสิทธิ์เขียนประกาศ)
 *   POST   { app_key, title, body, level, starts_at, expires_at, pinned }   → สร้าง
 *   PATCH  { id, ...ช่องเดียวกัน }                                          → แก้
 *   DELETE ?id=                  → ลบแบบเก็บไว้ (deleted_at) · POST { action: "restore", id } = กู้คืน
 * เขียน/แก้/ลบ = สิทธิ์ staff_apps.announce (แอดมินมีเสมอ) · ทุกครั้งลง audit_logs (changes: auditDiff)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { writeAudit, auditDiff } from "@/lib/audit";
import { ANNOUNCE_PERM, announcementActive, cleanAnnouncement, sortAnnouncements, type Announcement } from "@/lib/staff-app-extras";
import { viewerOf, visibleApp } from "../_viewer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "id, app_key, title, body, level, starts_at, expires_at, pinned, created_by_name, created_at, updated_at, deleted_at";
const headers = { "Cache-Control": "private, no-store" };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });

export async function GET(request: NextRequest) {
  const viewer = await viewerOf(request);
  if (!viewer) return bad("ต้องเข้าสู่ระบบก่อน", 401);
  const app = await visibleApp(request.nextUrl.searchParams.get("app") ?? "", viewer);
  if (!app) return NextResponse.json({ data: [], canWrite: false, error: null }, { headers });
  const canWrite = await apiCan(request, ANNOUNCE_PERM);
  const manage = canWrite && request.nextUrl.searchParams.get("manage") === "1";
  const { data, error } = await supabaseAdmin().from("erp_app_announcements").select(COLS).eq("app_key", app.key).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  if (error) return bad(error.message, 500);
  const list = (data ?? []) as Announcement[];
  return NextResponse.json({ data: sortAnnouncements(manage ? list : list.filter((a) => announcementActive(a))), canWrite, error: null }, { headers });
}

async function guardWrite(request: NextRequest) {
  const viewer = await viewerOf(request);
  if (!viewer) return { err: bad("ต้องเข้าสู่ระบบก่อน", 401) } as const;
  if (!(await apiCan(request, ANNOUNCE_PERM))) return { err: bad("ไม่มีสิทธิ์เขียนประกาศ (staff_apps.announce)", 403) } as const;
  return { viewer } as const;
}

async function loadOne(id: string): Promise<Announcement | null> {
  const { data } = await supabaseAdmin().from("erp_app_announcements").select(COLS).eq("id", id).maybeSingle();
  return (data as Announcement | null) ?? null;
}

export async function POST(request: NextRequest) {
  const g = await guardWrite(request);
  if ("err" in g) return g.err;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("invalid JSON"); }
  const admin = supabaseAdmin();
  if (body.action === "restore") {
    const before = await loadOne(String(body.id ?? ""));
    if (!before) return bad("ไม่พบประกาศ", 404);
    const { data, error } = await admin.from("erp_app_announcements").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("id", before.id).select(COLS).single();
    if (error) return bad(error.message, 500);
    await writeAudit(admin, { action: "staff_app.announcement.restore", entityType: "erp_app_announcements", entityId: before.id, actorId: g.viewer.id, actorName: g.viewer.name, metadata: { app_key: before.app_key, title: before.title, changes: auditDiff({ deleted_at: before.deleted_at }, { deleted_at: null }) } });
    return NextResponse.json({ data, error: null }, { headers });
  }
  const app = await visibleApp(String(body.app_key ?? ""), g.viewer);
  if (!app) return bad("ไม่พบแอปนี้", 404);
  const c = cleanAnnouncement(body);
  if (!c.ok) return bad(c.error);
  const row = { ...c.value, app_key: app.key, created_by: g.viewer.id, created_by_name: g.viewer.name };
  const { data, error } = await admin.from("erp_app_announcements").insert(row).select(COLS).single();
  if (error) return bad(error.message, 500);
  await writeAudit(admin, { action: "staff_app.announcement.create", entityType: "erp_app_announcements", entityId: (data as Announcement).id, actorId: g.viewer.id, actorName: g.viewer.name, metadata: { app_key: app.key, ...c.value } });
  return NextResponse.json({ data, error: null }, { headers });
}

export async function PATCH(request: NextRequest) {
  const g = await guardWrite(request);
  if ("err" in g) return g.err;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("invalid JSON"); }
  const before = await loadOne(String(body.id ?? ""));
  if (!before || before.deleted_at) return bad("ไม่พบประกาศ", 404);
  const c = cleanAnnouncement({ ...before, ...body });
  if (!c.ok) return bad(c.error);
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_app_announcements").update({ ...c.value, updated_at: new Date().toISOString() }).eq("id", before.id).select(COLS).single();
  if (error) return bad(error.message, 500);
  const changes = auditDiff(before as unknown as Record<string, unknown>, c.value as unknown as Record<string, unknown>);
  if (changes.length) await writeAudit(admin, { action: "staff_app.announcement.update", entityType: "erp_app_announcements", entityId: before.id, actorId: g.viewer.id, actorName: g.viewer.name, metadata: { app_key: before.app_key, title: before.title, changes } });
  return NextResponse.json({ data, error: null }, { headers });
}

export async function DELETE(request: NextRequest) {
  const g = await guardWrite(request);
  if ("err" in g) return g.err;
  const before = await loadOne(request.nextUrl.searchParams.get("id") ?? "");
  if (!before || before.deleted_at) return bad("ไม่พบประกาศ", 404);
  const now = new Date().toISOString();
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_app_announcements").update({ deleted_at: now, updated_at: now }).eq("id", before.id);
  if (error) return bad(error.message, 500);
  await writeAudit(admin, { action: "staff_app.announcement.delete", entityType: "erp_app_announcements", entityId: before.id, actorId: g.viewer.id, actorName: g.viewer.name, metadata: { app_key: before.app_key, title: before.title, changes: auditDiff({ deleted_at: null }, { deleted_at: now }) } });
  return NextResponse.json({ ok: true, error: null }, { headers });
}
