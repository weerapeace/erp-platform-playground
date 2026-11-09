/**
 * 📂 ประวัติตัวแยกไฟล์ ERP — GET /api/file-sort/history   (สิทธิ์ tasks.view หรือ assets.view)
 *   อ่านจากประวัติกลาง (audit_logs action file_sort.upload / file_sort.undo) — ไม่มีตารางของตัวเอง
 *   หน้า Task Manager › ประวัติไฟล์:  ?q= รหัสรุ่น/ชื่องาน · profile=product|content|artwork · actor=<user id> · days=7|30|90 (ว่าง = ทั้งหมด)
 *                                     · before=<ISO> (หน้าถัดไป) · limit (≤100) · include=actors (รายชื่อคนที่เคยใช้ ไว้ทำตัวกรอง)
 *   กล่องในหน้างาน:                   ?parent_ids=a,b (สินค้าที่ผูกกับงาน) · codes=PIX39 (รหัสรุ่น) · limit
 *   → { entries: [{ id, action, entity_type, entity_id, actor_name, metadata, created_at, view }], has_more, actors? }
 *   ย้ายกลับที่เจอครั้งที่ลงไฟล์ของมัน = รวมเข้าแถวนั้น (lib/file-sort-history) · คำแปลภาษาคน = lib/audit-format
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeAudit } from "@/lib/audit-format";
import { enrichAuditRows, loadAuditProfiles, type RawAuditRow } from "@/lib/audit-view-server";
import { FILE_SORT_ACTIONS, cleanHistoryTerm, mergeFileSortUndo } from "@/lib/file-sort-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, action, entity_type, entity_id, actor_user_id, metadata, created_at";
const NO_STORE = { "Cache-Control": "no-store" };
const listParam = (v: string | null) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "tasks.view")) && !(await apiCan(request, "assets.view"))) {
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดูประวัติไฟล์ (ต้องเข้า Task Manager หรือคลังไฟล์ได้)" }, { status: 403, headers: NO_STORE });
  }
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  const limit = Math.min(100, Math.max(1, Math.round(Number(sp.get("limit")) || 50)));
  const base = () => admin.from("audit_logs").select(COLS).in("action", [...FILE_SORT_ACTIONS]);
  const fail = () => NextResponse.json({ error: "โหลดประวัติไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500, headers: NO_STORE });

  let rows: RawAuditRow[] = [];
  let hasMore = false;
  const parentIds = listParam(sp.get("parent_ids")).filter((x) => UUID.test(x)).map((x) => x.toLowerCase()).slice(0, 10);
  const codes = listParam(sp.get("codes")).map(cleanHistoryTerm).filter(Boolean).slice(0, 10);
  if (parentIds.length || codes.length) {
    // กล่องในหน้างาน: สินค้าที่ผูก (parent_ids) หรือรหัสรุ่น (ประวัติที่ชื่อโฟลเดอร์ตรงรหัส) — รวมแล้วตัดซ้ำ
    const queries = [
      ...parentIds.map((id) => base().contains("metadata", { parent_ids: [id] })),
      ...(codes.length ? [base().in("metadata->>model", codes)] : []),
    ].map((q) => q.order("created_at", { ascending: false }).limit(limit));
    const res = await Promise.all(queries);
    if (res.some((r) => r.error)) return fail();
    const byId = new Map<string, RawAuditRow>();
    for (const r of res) for (const row of (r.data ?? []) as RawAuditRow[]) byId.set(row.id, row);
    const all = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    hasMore = all.length > limit;
    rows = all.slice(0, limit);
  } else {
    let q = base();
    const term = cleanHistoryTerm(sp.get("q"));
    if (term) q = q.or(`metadata->>model.ilike.*${term}*,metadata->>name.ilike.*${term}*`);
    const profile = sp.get("profile");
    if (profile === "product" || profile === "content" || profile === "artwork") q = q.eq("metadata->>profile", profile);
    const actor = sp.get("actor");
    if (actor && UUID.test(actor)) q = q.eq("actor_user_id", actor);
    const days = Number(sp.get("days"));
    if (days > 0) q = q.gte("created_at", new Date(Date.now() - Math.min(days, 3650) * 86_400_000).toISOString());
    const before = sp.get("before");
    if (before && !Number.isNaN(Date.parse(before))) q = q.lt("created_at", new Date(before).toISOString());
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit + 1);
    if (error) return fail();
    const got = (data ?? []) as RawAuditRow[];
    hasMore = got.length > limit;
    rows = got.slice(0, limit);
  }

  const enriched = await enrichAuditRows(request, admin, rows);
  const entries = mergeFileSortUndo(enriched).map((r) => ({ ...r, view: describeAudit(r) }));

  let actors: { id: string; name: string }[] | undefined;
  if (sp.get("include") === "actors") {
    const { data } = await admin.from("audit_logs").select("actor_user_id").in("action", [...FILE_SORT_ACTIONS]).not("actor_user_id", "is", null).order("created_at", { ascending: false }).limit(2000);
    const ids = [...new Set(((data ?? []) as { actor_user_id: string | null }[]).map((r) => r.actor_user_id).filter((x): x is string => !!x))];
    if (ids.length) {
      const profiles = await loadAuditProfiles(admin);
      actors = ids.map((id) => { const p = profiles.find((x) => x.id === id); return { id, name: p?.display_name || p?.email || "ผู้ใช้" }; })
        .sort((a, b) => a.name.localeCompare(b.name, "th"));
    } else actors = [];
  }
  return NextResponse.json({ entries, has_more: hasMore, ...(actors ? { actors } : {}), error: null }, { headers: NO_STORE });
}
