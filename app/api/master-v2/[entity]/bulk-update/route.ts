/**
 * POST /api/master-v2/<entity>/bulk-update
 * แก้ไขหลายรายการ "ทั้งหมดที่ตรงตัวกรอง" (ข้ามหน้า) — server-side
 *
 * body: {
 *   changes: Record<string, unknown>,          // ค่าใหม่ที่จะตั้งให้ทุกแถวที่ตรง
 *   search?: string, filters?: {...}, include_inactive?: boolean,
 *   base_filter?: {...}, actor?: string,
 * }
 *
 * ปลอดภัย:
 *  - ใช้ applyListFilters (ตัวเดียวกับ list GET) → แถวที่กระทบ = แถวที่ผู้ใช้เห็นเป๊ะ
 *  - resolve id ทั้งหมดที่ตรงก่อน แล้ว update เป็น batch ตาม id (กัน update เกินขอบเขต)
 *  - cap 20,000 แถว — ถ้าเกินให้ผู้ใช้กรองให้แคบลง
 *  - ตรวจ permission, กัน key อันตราย (id/created_at), audit log
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveEntity, applyListFilters, friendlyDbError, type ColFilter } from "../route";
import { auditDiff, auditRecordLabel, writeAudit, writeAuditMany, type AuditEntry } from "@/lib/audit";
import { hasSecretFields } from "@/lib/settings-secrets";
import { guardApi } from "@/lib/api-auth";
import { getFieldAccess } from "@/lib/field-permissions";
import { isGeneratedColumn, generatedHint } from "@/lib/generated-columns";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE = /^[a-z_][a-z0-9_]*$/i;
const BLOCKED_KEYS = new Set(["id", "created_at", "updated_at"]);
const MAX_ROWS = 20000;
/** แก้ไม่เกินเท่านี้ → จดประวัติรายแถว "จาก → เป็น" ด้วย (เกินนี้จดแถวสรุปอย่างเดียว กันประวัติบวม) */
const PER_ROW_AUDIT_MAX = 200;

type Admin = ReturnType<typeof supabaseAdmin>;

/** ค่าเดิมของแถวที่จะแก้ (อ่านก่อน update) — ใช้ทำประวัติรายแถว */
async function snapshotRows(admin: Admin, table: string, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin.from(table).select("*").in("id", ids.slice(i, i + 100));
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) out.set(String(r.id), r);
  }
  return out;
}

/** ประวัติรายแถว (action update · via bulk) → ไปโผล่ในประวัติของรายการนั้นด้วย */
function perRowEntries(
  table: string, entity: string, snap: Map<string, Record<string, unknown>>, ids: string[], changes: Record<string, unknown>,
  actorId: string, actorName: string | null,
): AuditEntry[] {
  const secret = hasSecretFields(table) ? Object.keys(changes) : [];
  const out: AuditEntry[] = [];
  for (const id of ids) {
    const before = snap.get(id);
    const diff = auditDiff(before, changes, { secret });
    if (diff.length === 0) continue;
    out.push({ action: "update", entityType: table, entityId: id, actorId, actorName,
      metadata: { entity, via: "bulk", changes: diff, ...auditRecordLabel(before) } });
  }
  return out;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
): Promise<NextResponse> {
  const { entity } = await params;
  // ตรวจสิทธิ์แก้หลายรายการ (bulk edit) ก่อน — ไม่ล็อกอิน/ไม่มีสิทธิ์ → 401
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: {
    changes?: Record<string, unknown>;
    edits?: { id: string; changes: Record<string, unknown> }[];   // โหมด batch ราย id (ค่าต่างกันได้)
    search?: string;
    filters?: Record<string, ColFilter>;
    base_filter?: Record<string, ColFilter>;
    include_inactive?: boolean;
    actor?: string;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // สิทธิ์ระดับฟิลด์ (ของกลาง) — กันแก้คอลัมน์ที่ role นี้ไม่มีสิทธิ์แก้
  const { readonlyCols } = await getFieldAccess(request, supabaseAdmin(), cfg.table);
  const readonlySet = new Set(readonlyCols);

  // คอลัมน์ที่ DB คำนวณเอง (เช่น color_platform_en) ส่งไป Postgres จะปฏิเสธทั้งคำสั่ง → ตัดออก + จำไว้บอกผู้ใช้
  const droppedGenerated = new Set<string>();
  const sanitize = (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (isGeneratedColumn(k)) { droppedGenerated.add(k); continue; }
      if (SAFE.test(k) && !BLOCKED_KEYS.has(k) && !readonlySet.has(k)) out[k] = v;
    }
    return out;
  };
  const generatedOnlyError = () => {
    const col = [...droppedGenerated][0];
    return NextResponse.json({ error: `แก้ช่อง "${col}" ตรงนี้ไม่ได้ — ${generatedHint(col)}` }, { status: 400 });
  };

  // ---- โหมด batch ราย id: รับ edits[] (แต่ละแถวมีค่าของตัวเอง) → จัดกลุ่มแถวที่ค่าเหมือนกัน → UPDATE ทีละกลุ่ม ----
  if (Array.isArray(body.edits)) {
    const edits = body.edits;
    if (edits.length === 0) return NextResponse.json({ ok: true, affected: 0, error: null });
    if (edits.length > MAX_ROWS) return NextResponse.json({ error: `แก้ครั้งละไม่เกิน ${MAX_ROWS.toLocaleString()} แถว` }, { status: 400 });
    const admin2 = supabaseAdmin();
    // group: serialized changes → ids
    const groups = new Map<string, { changes: Record<string, unknown>; ids: string[] }>();
    for (const e of edits) {
      if (!e?.id) continue;
      const c = sanitize(e.changes ?? {});
      if (Object.keys(c).length === 0) continue;
      const key = JSON.stringify(c);
      const g = groups.get(key) ?? { changes: c, ids: [] };
      g.ids.push(String(e.id));
      groups.set(key, g);
    }
    if (groups.size === 0 && droppedGenerated.size > 0) return generatedOnlyError();
    const actorName2 = body.actor ?? user.email ?? null;
    const allIds = [...groups.values()].flatMap((g) => g.ids);
    // แก้ไม่เยอะ → อ่านค่าเดิมไว้ทำประวัติรายแถว "จาก → เป็น"
    const snap = allIds.length <= PER_ROW_AUDIT_MAX ? await snapshotRows(admin2, cfg.table, allIds) : null;
    const rowAudits: AuditEntry[] = [];
    let affected2 = 0;
    for (const g of groups.values()) {
      for (let i = 0; i < g.ids.length; i += 500) {
        const chunk = g.ids.slice(i, i + 500);
        const { error } = await admin2.from(cfg.table).update(g.changes).in("id", chunk);
        if (error) {
          if (rowAudits.length) await writeAuditMany(admin2, rowAudits);   // ที่แก้สำเร็จไปแล้วต้องมีประวัติ
          return NextResponse.json({ error: friendlyDbError(error.message), affected: affected2 }, { status: 400 });
        }
        affected2 += chunk.length;
        if (snap) rowAudits.push(...perRowEntries(cfg.table, entity, snap, chunk, g.changes, user.id, actorName2));
      }
    }
    if (rowAudits.length) await writeAuditMany(admin2, rowAudits);
    await writeAudit(admin2, {
      action: "master.bulk_update", entityType: cfg.table,
      actorId: user.id, actorName: actorName2,
      metadata: { entity, mode: "edits", groups: groups.size, affected: affected2,
        changed_fields: [...new Set([...groups.values()].flatMap((g) => Object.keys(g.changes)))] },
    });
    return NextResponse.json({ ok: true, affected: affected2, error: null });
  }

  // sanitize changes (กัน key อันตราย + คอลัมน์ที่ไม่มีสิทธิ์แก้)
  const changes: Record<string, unknown> = sanitize(body.changes ?? {});
  if (Object.keys(changes).length === 0 && droppedGenerated.size > 0) return generatedOnlyError();
  if (Object.keys(changes).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลที่จะแก้ (หรือคุณไม่มีสิทธิ์แก้ฟิลด์ที่เลือก)" }, { status: 400 });

  const admin = supabaseAdmin();
  const colFilters: Record<string, ColFilter> = { ...(body.base_filter ?? {}), ...(body.filters ?? {}) };
  const includeInactive = body.include_inactive === true;

  // 1) resolve id ทั้งหมดที่ตรงตัวกรอง (batch ละ 1000)
  const ids: string[] = [];
  let from = 0;
  const BATCH = 1000;
  for (;;) {
    let q = admin.from(cfg.table).select("id").range(from, from + BATCH - 1);
    q = applyListFilters(q, { searchColumns: cfg.searchColumns, search: body.search ?? "", colFilters, softDeleteColumn: cfg.softDeleteColumn, includeInactive });
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as { id: string }[];
    for (const r of rows) ids.push(String(r.id));
    if (rows.length < BATCH) break;
    if (ids.length > MAX_ROWS) return NextResponse.json({ error: `มีรายการที่ตรงมากเกิน ${MAX_ROWS.toLocaleString()} — กรุณากรองให้แคบลง` }, { status: 400 });
    from += BATCH;
  }
  if (ids.length === 0) return NextResponse.json({ ok: true, affected: 0, error: null });

  // 2) update ทีละ batch ตาม id (แก้ไม่เยอะ → อ่านค่าเดิมไว้ทำประวัติรายแถว)
  const actorName = body.actor ?? user.email ?? null;
  const snap = ids.length <= PER_ROW_AUDIT_MAX ? await snapshotRows(admin, cfg.table, ids) : null;
  const rowAudits: AuditEntry[] = [];
  let affected = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { error } = await admin.from(cfg.table).update(changes).in("id", chunk);
    if (error) {
      if (rowAudits.length) await writeAuditMany(admin, rowAudits);
      return NextResponse.json({ error: friendlyDbError(error.message), affected }, { status: 400 });
    }
    affected += chunk.length;
    if (snap) rowAudits.push(...perRowEntries(cfg.table, entity, snap, chunk, changes, user.id, actorName));
  }

  // 3) audit (ของกลาง — ลง audit_logs, ไม่ throw) · รายแถว + แถวสรุป
  if (rowAudits.length) await writeAuditMany(admin, rowAudits);
  await writeAudit(admin, {
    action: "master.bulk_update", entityType: cfg.table,
    actorId: user.id, actorName,
    metadata: { entity, mode: "filter", changes: hasSecretFields(cfg.table) ? Object.keys(changes) : changes, affected },
  });

  return NextResponse.json({ ok: true, affected, error: null });
}
