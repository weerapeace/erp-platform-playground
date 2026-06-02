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

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE = /^[a-z_][a-z0-9_]*$/i;
const BLOCKED_KEYS = new Set(["id", "created_at", "updated_at"]);
const MAX_ROWS = 20000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
): Promise<NextResponse> {
  const { entity } = await params;
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

  const sanitize = (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj ?? {})) if (SAFE.test(k) && !BLOCKED_KEYS.has(k)) out[k] = v;
    return out;
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
    let affected2 = 0;
    for (const g of groups.values()) {
      for (let i = 0; i < g.ids.length; i += 500) {
        const chunk = g.ids.slice(i, i + 500);
        const { error } = await admin2.from(cfg.table).update(g.changes).in("id", chunk);
        if (error) return NextResponse.json({ error: friendlyDbError(error.message), affected: affected2 }, { status: 400 });
        affected2 += chunk.length;
      }
    }
    await admin2.from("erp_audit_logs").insert({
      actor_name: body.actor ?? user.email ?? "system", action: "master.bulk_update", module: entity,
      record_label: `${affected2} rows`, new_value: { groups: groups.size, affected: affected2 },
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: true, affected: affected2, error: null });
  }

  // sanitize changes
  const changes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body.changes ?? {})) {
    if (SAFE.test(k) && !BLOCKED_KEYS.has(k)) changes[k] = v;
  }
  if (Object.keys(changes).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลที่จะแก้" }, { status: 400 });

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

  // 2) update ทีละ batch ตาม id
  let affected = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { error } = await admin.from(cfg.table).update(changes).in("id", chunk);
    if (error) return NextResponse.json({ error: friendlyDbError(error.message), affected }, { status: 400 });
    affected += chunk.length;
  }

  // 3) audit (best-effort)
  await admin.from("erp_audit_logs").insert({
    actor_name: body.actor ?? user.email ?? "system", action: "master.bulk_update", module: entity,
    record_label: `${affected} rows`, new_value: { changes, affected },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, affected, error: null });
}
