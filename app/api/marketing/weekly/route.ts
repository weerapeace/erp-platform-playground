/**
 * แท็บ "สรุปสัปดาห์" ของหน้าภาพรวมการตลาด — /api/marketing/weekly (แผนการตลาด รอบ 8 · เจ้าของเลือก 2026-11-27 แบบ A + ข้อ 1-4)
 * --------------------------------------------------------------------------
 *   GET    ?brand_id=&id=&trash=1   → list (ใบสรุปล่าสุด 52 ใบของแบรนด์นี้ · trash=1 = ใบที่ลบ) + report (ใบที่เลือก/ล่าสุด เต็ม)
 *   POST   { week_start, brand_id?, skip_ai? }  → สร้าง/สร้างใหม่ (ใบเดิมเก็บเป็นเวอร์ชันใน history) · มีค่า AI ≈ 1–3 บาท
 *   PATCH  { id, summary?, actions?, review? }  → แก้ข้อความ (เวอร์ชันก่อนแก้เก็บใน history)
 *          { id, restore_version: n }           → ย้อนกลับไปเวอร์ชันที่ n (เวอร์ชันปัจจุบันเก็บไว้ก่อน)
 *          { id, is_active: true }              → กู้ใบที่ลบ (ถ้าสัปดาห์นั้นยังไม่มีใบใหม่)
 *   DELETE ?id=                                 → ลบแบบเก็บไว้ (กู้คืนได้)
 * สิทธิ์: ดู = marketing.dashboard.view · สร้าง/แก้/ลบ = products.platforms.edit (ชุดเดียวกับตั้งเป้า/จุดคุ้มทุน) · ทุกการเปลี่ยนแปลงลง audit (changes)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAudit } from "@/lib/audit";
import { bkkYmd } from "@/lib/platform-dashboard-calc";
import { cleanWeeklyEdit, lastFullWeek, pushWeeklyHistory, weekLabel, weekStartOf, type WeeklyVersion } from "@/lib/marketing-weekly-calc";
import { WEEKLY_COLS, generateWeeklyReport } from "@/lib/marketing-weekly-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const EDIT_PERM = "products.platforms.edit";
const isYmd = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
async function who(request: NextRequest) { const { data: { user } } = await supabaseFromRequest(request).auth.getUser(); return user; }
const label = (r: { week_start?: unknown; data?: unknown }) => `สรุปการตลาด ${weekLabel(String(r.week_start))} · ${((r.data as { brand?: { name?: string } } | null)?.brand?.name) ?? ""}`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const brandId = isUuid(sp.get("brand_id")) ? sp.get("brand_id") : null;
  const id = sp.get("id");
  const trash = sp.get("trash") === "1";
  const admin = supabaseAdmin();
  try {
    let lq = admin.from("marketing_weekly_reports").select("id, week_start, brand_id, ai_error, edited, source, updated_at, deleted_at").eq("is_active", !trash).order("week_start", { ascending: false }).limit(52);
    lq = brandId ? lq.eq("brand_id", brandId) : lq.is("brand_id", null);
    const [{ data: list }, { data: brands }, canEdit] = await Promise.all([lq, admin.from("brands").select("id, name").order("name"), apiCan(request, EDIT_PERM)]);
    const rows = (list ?? []) as { id: string }[];
    const pick = isUuid(id) ? id : rows[0]?.id ?? null;
    let report: Record<string, unknown> | null = null;
    if (pick) {
      const { data } = await admin.from("marketing_weekly_reports").select(WEEKLY_COLS).eq("id", pick).maybeSingle();
      report = (data as Record<string, unknown> | null) ?? null;
    }
    const today = bkkYmd(Date.now()) as string;
    return NextResponse.json({ list: rows, report, brands: brands ?? [], canEdit, lastWeek: lastFullWeek(today), thisWeek: weekStartOf(today), error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/marketing/weekly]", e);
    return NextResponse.json({ error: "โหลดสรุปสัปดาห์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  let b: { week_start?: unknown; brand_id?: unknown; skip_ai?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  if (!isYmd(b.week_start)) return NextResponse.json({ error: "เลือกสัปดาห์ก่อน" }, { status: 400 });
  const weekStart = weekStartOf(b.week_start);
  const today = bkkYmd(Date.now()) as string;
  if (weekStart > weekStartOf(today)) return NextResponse.json({ error: "ยังไม่ถึงสัปดาห์นี้" }, { status: 400 });
  const brandId = isUuid(b.brand_id) ? b.brand_id : null;
  const user = await who(request);
  const admin = supabaseAdmin();
  try {
    const out = await generateWeeklyReport(admin, weekStart, brandId, { userId: user?.id ?? null, request, source: "manual" }, { skipAi: b.skip_ai === true });
    const { _before, _created, ...row } = out as Record<string, unknown> & { _before: Record<string, unknown> | null; _created: boolean };
    await writeAudit(admin, {
      action: _created ? "create" : "update", entityType: "marketing_weekly_report", entityId: String(row.id), actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { label: label(row), regenerated: !_created, ai_error: row.ai_error ?? null, ...auditChangeMeta(_before ? { ai_summary: _before.ai_summary } : {}, { ai_summary: row.ai_summary }) },
    });
    return NextResponse.json({ ok: true, report: row, error: null });
  } catch (e) {
    console.error("[api/marketing/weekly POST]", e);
    return NextResponse.json({ error: "สร้างสรุปสัปดาห์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  let b: { id?: unknown; summary?: unknown; actions?: unknown; review?: unknown; restore_version?: unknown; is_active?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  if (!isUuid(b.id)) return NextResponse.json({ error: "ไม่ได้ระบุใบสรุป" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("marketing_weekly_reports").select(WEEKLY_COLS).eq("id", b.id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบสรุปนี้" }, { status: 404 });
  const c = cur as Record<string, unknown>;
  const user = await who(request);
  const now = new Date().toISOString();
  const snapshot = (reason: string): WeeklyVersion => ({ at: now, by: user?.id ?? null, summary: (c.ai_summary as string | null) ?? null, actions: c.ai_actions, review: c.review_summary, reason });

  // กู้ใบที่ลบ
  if (b.is_active === true) {
    if (c.is_active) return NextResponse.json({ ok: true, report: c, error: null });
    let dq = admin.from("marketing_weekly_reports").select("id").eq("week_start", c.week_start as string).eq("is_active", true);
    dq = c.brand_id ? dq.eq("brand_id", c.brand_id as string) : dq.is("brand_id", null);
    const { data: dup } = await dq.maybeSingle();
    if (dup) return NextResponse.json({ error: "สัปดาห์นี้มีใบสรุปใหม่แล้ว — ลบใบใหม่ก่อนถ้าต้องการกู้ใบนี้" }, { status: 409 });
    const { data: row, error } = await admin.from("marketing_weekly_reports").update({ is_active: true, deleted_at: null, updated_by: user?.id ?? null, updated_at: now }).eq("id", b.id).select(WEEKLY_COLS).single();
    if (error) return NextResponse.json({ error: "กู้คืนไม่สำเร็จ" }, { status: 400 });
    await writeAudit(admin, { action: "restore", entityType: "marketing_weekly_report", entityId: b.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { label: label(c), ...auditChangeMeta({ is_active: false }, { is_active: true }) } });
    return NextResponse.json({ ok: true, report: row, error: null });
  }

  let patch: Record<string, unknown>;
  let reason: string;
  if (typeof b.restore_version === "number") {
    const hist = Array.isArray(c.history) ? (c.history as WeeklyVersion[]) : [];
    const v = hist[b.restore_version];
    if (!v) return NextResponse.json({ error: "ไม่พบเวอร์ชันนี้" }, { status: 404 });
    patch = { ai_summary: v.summary, ai_actions: v.actions ?? [], review_summary: v.review ?? {}, edited: true };
    reason = "ก่อนย้อนกลับ";
  } else {
    const e = cleanWeeklyEdit(b);
    if (!Object.keys(e).length) return NextResponse.json({ error: "ไม่มีอะไรเปลี่ยน" }, { status: 400 });
    patch = { ...("summary" in e ? { ai_summary: e.summary || null } : {}), ...("actions" in e ? { ai_actions: e.actions } : {}), ...("review" in e ? { review_summary: e.review } : {}), edited: true };
    // ติ๊ก "ทำแล้ว" อย่างเดียว ไม่นับเป็นเวอร์ชันใหม่ (ประวัติจะได้ไม่รก)
    const onlyDone = "actions" in e && Object.keys(e).length === 1 && JSON.stringify((e.actions ?? []).map((a) => [a.text, a.why ?? null])) === JSON.stringify(((c.ai_actions as { text: string; why?: string }[]) ?? []).map((a) => [a.text, a.why ?? null]));
    reason = onlyDone ? "" : "ก่อนแก้";
  }
  const update: Record<string, unknown> = { ...patch, updated_by: user?.id ?? null, updated_at: now };
  if (reason) update.history = pushWeeklyHistory(c.history, snapshot(reason));
  const { data: row, error } = await admin.from("marketing_weekly_reports").update(update).eq("id", b.id).select(WEEKLY_COLS).single();
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 400 });
  const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
  for (const k of ["ai_summary", "ai_actions", "review_summary"]) if (k in patch) { before[k] = c[k]; after[k] = patch[k]; }
  await writeAudit(admin, { action: "update", entityType: "marketing_weekly_report", entityId: b.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { label: label(c), restore_version: typeof b.restore_version === "number" ? b.restore_version : undefined, ...auditChangeMeta(before, after) } });
  return NextResponse.json({ ok: true, report: row, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่ได้ระบุใบสรุป" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("marketing_weekly_reports").select("week_start, data, is_active").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบสรุปนี้" }, { status: 404 });
  const user = await who(request);
  const now = new Date().toISOString();
  const { error } = await admin.from("marketing_weekly_reports").update({ is_active: false, deleted_at: now, updated_by: user?.id ?? null, updated_at: now }).eq("id", id);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "marketing_weekly_report", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { label: label(cur as Record<string, unknown>), soft: true, ...auditChangeMeta({ is_active: true }, { is_active: false }) } });
  return NextResponse.json({ ok: true, error: null });
}
