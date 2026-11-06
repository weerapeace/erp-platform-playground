import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditLogPermissionFor } from "@/lib/audit-log-access";
import { ACTION_GROUPS, actionGroupFilter, AUDIT_NOISE_ENTITY_TYPES, AUDIT_SEARCH_KEYS, type AuditActionGroup, type AuditView } from "@/lib/audit-format";
import { AUDIT_MODULES, moduleFilterOr, type AuditModuleKey } from "@/lib/audit-entities";
import { enrichAuditRows, loadAuditProfiles, type RawAuditRow } from "@/lib/audit-view-server";
import { addDaysYmd, todayBangkok } from "@/lib/date";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---- Types ----

export type AuditLogEntry = {
  id:          string;
  action:      string;   // create | update | delete | ...
  entity_type: string;
  entity_id:   string | null;
  actor_name:  string;
  actor_user_id?: string | null;
  metadata:    Record<string, unknown>;
  created_at:  string;
  total_count: number;
  /** ผลแปลเป็นภาษาคน (lib/audit-format) — ค่าที่ผู้ดูไม่มีสิทธิ์ถูกซ่อนแล้ว */
  view?:       AuditView;
};

export type AuditGroupCounts = Record<AuditActionGroup | "all", number>;

export type AuditLogsResponse = {
  data:  AuditLogEntry[];
  total: number;
  error: string | null;
  /** จำนวนแยกกลุ่ม ตามตัวกรองปัจจุบัน (ส่งเมื่อขอ counts=1) */
  counts?: AuditGroupCounts;
  /** รายชื่อคนสำหรับตัวกรอง (ส่งเมื่อขอ include=actors) */
  actors?: { id: string; name: string }[];
};

// ---- GET /api/audit-logs ----
//
// Query params (ทุกตัวไม่บังคับ):
//   entity_type, entity_id — ประวัติของชนิด/รายการเดียว
//   action      — ชื่อ action ตรงตัว (เดิม)  ·  group — create|update|status|delete|output (ตาม lib/audit-format)
//   module      — โมดูล (lib/audit-entities)  ·  actor — user id  ·  q — ค้นเลขเอกสาร/ชื่อ/รหัสรายการ
//   from, to    — YYYY-MM-DD เวลาไทย (ไม่ระบุ + ไม่เจาะรายการ = 90 วันล่าสุด กันหน้าช้า)
//   noise       — 1 = รวมบันทึกอัตโนมัติ (กระดานเซฟเอง/อัปโหลดไฟล์ดิบ) · 0 = ซ่อน (ค่าเริ่ม: ซ่อนเมื่อไม่เจาะรายการ)
//   counts=1    — แนบจำนวนแยกกลุ่ม  ·  include=actors — แนบรายชื่อคน
//   limit (≤200) / offset
// สิทธิ์: ดูทั้งระบบ/หมวดอ่อนไหว = admin.audit_log · ประวัติรายการเดียว/หมวดทั่วไป = พนักงานที่ล็อกอิน (lib/audit-log-access)
// ค่าอ่อนไหวในประวัติ (ราคาทุน/เงินเดือน) ซ่อนตามสิทธิ์ผู้ดู (lib/audit-view-server)

const SELECT = "id, action, entity_type, entity_id, actor_user_id, metadata, created_at";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isYmd = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
/** ค่าใน .or() ที่มีอักขระพิเศษต้องครอบ "..." */
const quoteVal = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

type Filters = {
  entityType: string | null; entityId: string | null; action: string | null;
  group: AuditActionGroup | null; module: AuditModuleKey | null;
  actorOr: string | null; searchOr: string | null;
  fromIso: string | null; toIso: string | null; hideNoise: boolean;
};

/** ตัวสร้างคำค้นของ supabase-js (ใช้แค่เมธอดกรองที่ต้องการ) */
type Filterable = {
  eq(col: string, v: unknown): Filterable; neq(col: string, v: unknown): Filterable;
  gte(col: string, v: unknown): Filterable; lt(col: string, v: unknown): Filterable;
  or(f: string): Filterable; not(col: string, op: string, v: unknown): Filterable;
};

function applyGroup<Q>(q: Q, g: AuditActionGroup): Q {
  const gf = actionGroupFilter(g);
  let x = q as unknown as Filterable;
  if (gf.or) x = x.or(gf.or);
  for (const p of gf.not) x = x.not("action", "ilike", p);
  return x as unknown as Q;
}

function applyFilters<Q>(q: Q, f: Filters, opts: { skipGroup?: boolean } = {}): Q {
  let x = q as unknown as Filterable;
  if (f.entityType) x = x.eq("entity_type", f.entityType);
  if (f.entityId)   x = x.eq("entity_id", f.entityId);
  if (f.action)     x = x.eq("action", f.action);
  if (f.fromIso)    x = x.gte("created_at", f.fromIso);
  if (f.toIso)      x = x.lt("created_at", f.toIso);
  if (f.module)     x = x.or(moduleFilterOr(f.module));
  if (f.actorOr)    x = x.or(f.actorOr);
  if (f.searchOr)   x = x.or(f.searchOr);
  if (f.hideNoise) {   // ต้องตรงกับ isAuditNoise (lib/audit-format)
    x = x.neq("action", "canvas_update");
    x = x.or("entity_type.neq.file,action.neq.upload");
    x = x.not("entity_type", "in", `(${AUDIT_NOISE_ENTITY_TYPES.join(",")})`);
  }
  const out = x as unknown as Q;
  return f.group && !opts.skipGroup ? applyGroup(out, f.group) : out;
}

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const entityType = sp.get("entity_type") || null;
  const entityIdRaw = sp.get("entity_id") || null;
  const limit  = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "100") || 100));
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0") || 0);

  const denied = await guardApi(request, auditLogPermissionFor({ entityType, entityId: entityIdRaw })); if (denied) return denied;

  // entity_id ไม่ใช่ uuid = ไม่มีทางเจอ (คอลัมน์เป็น uuid) → ตอบว่างเลย ไม่ให้ DB ฟ้อง
  if (entityIdRaw && !isUuid(entityIdRaw)) return NextResponse.json({ data: [], total: 0, error: null } satisfies AuditLogsResponse);

  const admin = supabaseAdmin();
  const groupRaw = sp.get("group");
  const moduleRaw = sp.get("module");
  const scoped = !!(entityType || entityIdRaw);

  // ช่วงวัน (เวลาไทย) — ไม่ระบุ + ไม่เจาะรายการ = 90 วันล่าสุด
  const from = sp.get("from"), to = sp.get("to");
  const fromYmd = isYmd(from) ? from : scoped ? null : addDaysYmd(todayBangkok(), -89);
  const toYmd = isYmd(to) ? to : null;

  // คนทำ: user id → จับทั้ง actor_user_id และชื่อ/อีเมลที่จดไว้ใน metadata (แถวเก่าบางแถวไม่มี id)
  let actorOr: string | null = null;
  const actor = sp.get("actor");
  if (actor && isUuid(actor)) {
    const p = (await loadAuditProfiles(admin)).find((x) => x.id === actor);
    actorOr = [`actor_user_id.eq.${actor}`,
      ...(p?.email ? [`metadata->>actor.eq.${quoteVal(p.email)}`] : []),
      ...(p?.display_name ? [`metadata->>actor.eq.${quoteVal(p.display_name)}`] : [])].join(",");
  }

  // ค้นหา: uuid = รหัสรายการ · อื่น ๆ = เลขเอกสาร/ชื่อใน metadata
  let searchOr: string | null = null;
  const qRaw = (sp.get("q") ?? "").replace(/[,()*\\"]/g, " ").trim().slice(0, 60);
  if (qRaw) {
    searchOr = isUuid(qRaw)
      ? `entity_id.eq.${qRaw}`
      : AUDIT_SEARCH_KEYS.map((k) => `metadata->>${k}.ilike.${quoteVal(`*${qRaw}*`)}`).join(",");
  }

  const noise = sp.get("noise");
  const f: Filters = {
    entityType, entityId: entityIdRaw, action: sp.get("action") || null,
    group: ACTION_GROUPS.some((g) => g.key === groupRaw) ? (groupRaw as AuditActionGroup) : null,
    module: AUDIT_MODULES.some((m) => m.key === moduleRaw) ? (moduleRaw as AuditModuleKey) : null,
    actorOr, searchOr,
    fromIso: fromYmd ? `${fromYmd}T00:00:00+07:00` : null,
    toIso: toYmd ? `${addDaysYmd(toYmd, 1)}T00:00:00+07:00` : null,
    hideNoise: noise === "1" ? false : noise === "0" ? true : !scoped,
  };

  const mainQ = applyFilters(admin.from("audit_logs").select(SELECT, { count: "exact" }), f)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const wantCounts = sp.get("counts") === "1";
  const countOf = async (g: AuditActionGroup | null): Promise<number> => {
    let cq = applyFilters(admin.from("audit_logs").select("id", { count: "exact", head: true }), f, { skipGroup: true });
    if (g) cq = applyGroup(cq, g);
    const { count } = await cq;
    return count ?? 0;
  };

  const [main, countsArr, actorsRes] = await Promise.all([
    mainQ,
    wantCounts ? Promise.all([countOf(null), ...ACTION_GROUPS.map((g) => countOf(g.key))]) : Promise.resolve(null),
    sp.get("include") === "actors" ? loadAuditProfiles(admin) : Promise.resolve(null),
  ]);

  if (main.error) {
    console.error("[api/audit-logs] GET", main.error);
    return NextResponse.json(
      { data: [], total: 0, error: "โหลดประวัติไม่สำเร็จ ลองใหม่อีกครั้ง หรือเลือกช่วงวันให้สั้นลง" } satisfies AuditLogsResponse,
      { status: 500 },
    );
  }

  const total = main.count ?? 0;
  const rows = await enrichAuditRows(request, admin, (main.data ?? []) as RawAuditRow[]);
  const res: AuditLogsResponse = {
    data: rows.map((r) => ({ ...r, total_count: total })),
    total,
    error: null,
  };
  if (countsArr) {
    const [all, ...per] = countsArr;
    res.counts = { all, ...Object.fromEntries(ACTION_GROUPS.map((g, i) => [g.key, per[i]])) } as AuditGroupCounts;
  }
  if (actorsRes) {
    res.actors = actorsRes
      .map((p) => ({ id: p.id, name: p.display_name?.trim() || p.email || "ไม่มีชื่อ" }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }
  return NextResponse.json(res);
}
