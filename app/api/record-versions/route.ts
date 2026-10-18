/**
 * 🕘 Record Versions — เวอร์ชันเก่าของ Parent SKU / SKU (ของกลาง lib/record-versions)
 *
 * GET  /api/record-versions?entity_type=parent_skus_v2&entity_id=<uuid>[&field_key=description][&limit=100]
 *      → { versions: (RecordVersion & { is_current })[], current: { field_key → ค่าปัจจุบัน } } เรียงใหม่ → เก่า
 *      guard products.view
 * GET  /api/record-versions?task_id=<uuid>[&subtask_id=<uuid>] → { changes: TaskChange[] } สิ่งที่แก้ในงานนี้ (ทุกสินค้า) · guard tasks.view
 * POST /api/record-versions  { version_id }  → ย้อนกลับ/กู้คืนเวอร์ชันนั้น (ค่าปัจจุบันถูกจดเป็นเวอร์ชันใหม่ ย้อนกลับได้อีก)
 *      guard products.edit + สิทธิ์ระดับฟิลด์ (ฟิลด์ที่ role นี้แก้ไม่ได้ → 403) · audit version_restore
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getFieldAccess } from "@/lib/field-permissions";
import { COVER_COLUMN, editContextFromRequest, isVersionCurrent, listTaskVersions, listVersions, loadCurrentState, restoreVersion, VERSIONED_TABLES } from "@/lib/record-versions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD = /^[a-z0-9_]+$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = new URL(request.url).searchParams;
  // 🔁 สรุป "สิ่งที่แก้ในงานนี้" (การ์ดงานย่อยโหมดใหม่) — ?task_id=<uuid>[&subtask_id=<uuid>] · สิทธิ์ดูงาน
  const taskId = (sp.get("task_id") ?? "").trim();
  if (taskId) {
    const denied = await guardApi(request, "tasks.view");
    if (denied) return denied;
    const subtaskId = (sp.get("subtask_id") ?? "").trim();
    if (!UUID.test(taskId) || (subtaskId && !UUID.test(subtaskId))) return NextResponse.json({ error: "task_id/subtask_id ไม่ถูกต้อง" }, { status: 400 });
    try {
      const changes = await listTaskVersions(supabaseAdmin(), taskId, { subtaskId: subtaskId || null });
      return NextResponse.json({ changes, error: null });
    } catch (e) {
      return NextResponse.json({ error: "โหลดสิ่งที่แก้ในงานไม่สำเร็จ กรุณาลองใหม่", detail: e instanceof Error ? e.message : null }, { status: 500 });
    }
  }
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const entityType = (sp.get("entity_type") ?? "").trim();
  const entityId = (sp.get("entity_id") ?? "").trim();
  const fieldKey = (sp.get("field_key") ?? "").trim();
  if (!VERSIONED_TABLES.includes(entityType)) return NextResponse.json({ error: "entity_type ไม่รองรับ" }, { status: 400 });
  if (!UUID.test(entityId)) return NextResponse.json({ error: "entity_id ไม่ถูกต้อง" }, { status: 400 });
  if (fieldKey && !FIELD.test(fieldKey)) return NextResponse.json({ error: "field_key ไม่ถูกต้อง" }, { status: 400 });
  try {
    const admin = supabaseAdmin();
    const [list, cur, access] = await Promise.all([
      listVersions(admin, entityType, entityId, { fieldKey: fieldKey || null, limit: Number(sp.get("limit")) || 100 }),
      loadCurrentState(admin, entityType, entityId),
      getFieldAccess(request, admin, entityType),
    ]);
    // ฟิลด์ที่ role นี้มองไม่เห็น → ไม่โชว์ประวัติด้วย (กันข้อมูลหลุดทางประวัติ)
    const hidden = new Set(access.hiddenCols);
    const versions = list
      .filter((v) => !(v.kind === "field" && hidden.has(v.field_key)) && !(v.field_key === "cover" && hidden.has(COVER_COLUMN)))
      .map((v) => ({ ...v, is_current: isVersionCurrent(v, cur) }));
    const current = Object.fromEntries(Object.entries(cur.text).filter(([k]) => !hidden.has(k)));
    return NextResponse.json({ versions, current, error: null });
  } catch (e) {
    return NextResponse.json({ error: "โหลดประวัติเวอร์ชันไม่สำเร็จ กรุณาลองใหม่", detail: e instanceof Error ? e.message : null }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: { version_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const versionId = String(body.version_id ?? "").trim();
  if (!UUID.test(versionId)) return NextResponse.json({ error: "version_id ไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  // สิทธิ์ระดับฟิลด์ (ของกลาง) — ช่องที่ role นี้แก้ไม่ได้ ห้ามย้อนผ่านทางนี้
  const { data: v } = await admin.from("entity_field_history").select("entity_type, field_key, kind").eq("id", versionId).maybeSingle();
  if (v?.entity_type && VERSIONED_TABLES.includes(v.entity_type as string)) {
    const access = await getFieldAccess(request, admin, v.entity_type as string);
    const col = v.kind === "field" ? (v.field_key as string) : v.field_key === "cover" ? COVER_COLUMN : null;
    if (col && (access.readonlyCols.includes(col) || access.hiddenCols.includes(col)))
      return NextResponse.json({ error: "คุณไม่มีสิทธิ์แก้ช่องนี้ จึงย้อนเวอร์ชันไม่ได้" }, { status: 403 });
  }

  const res = await restoreVersion(admin, versionId, { actorId: user.id, actorName: user.email ?? null, ...editContextFromRequest(request) });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.already) {
    await writeAudit(admin, {
      action: "version_restore", entityType: res.table, entityId: res.entityId,
      actorId: user.id, actorName: user.email ?? null,
      metadata: { version_id: versionId, field_key: res.fieldKey, kind: res.kind },
    });
  }
  return NextResponse.json({ ok: true, already: res.already, field_key: res.fieldKey, kind: res.kind, error: null });
}
