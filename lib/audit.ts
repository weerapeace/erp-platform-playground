/**
 * Audit log กลาง (ของกลาง) — เขียนประวัติ "ใครทำอะไร เมื่อไหร่" ลงตาราง audit_logs
 *
 * ⚠️ ตารางจริงชื่อ `audit_logs` (ไม่ใช่ erp_audit_logs)
 *    schema: actor_user_id(uuid) | action | entity_type | entity_id(uuid) | metadata(jsonb) | created_at
 *    ชื่อผู้ทำ (actorName) เก็บใน metadata.actor — หน้าดูประวัติอ่านจาก metadata->>'actor' ก่อน
 *
 * หลักการ: ไม่ throw — action หลัก (อนุมัติ/สร้าง PO/รับของ) ต้องไม่ล้มเพราะเขียน log ไม่ได้
 *          แต่ถ้าเขียนพลาดจะ console.error เสมอ (ไม่เงียบเหมือนของเดิมที่ best-effort)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

type Admin = ReturnType<typeof supabaseAdmin>;

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export type AuditEntry = {
  /** create | update | delete | approve | reject | receive | ... */
  action:      string;
  /** ชนิดเอกสาร เช่น purchase_requests_v2 */
  entityType:  string;
  /** id ของ record (uuid) — ไม่ใช่ uuid จะเก็บ null (id ดิบไปอยู่ใน metadata ได้) */
  entityId?:   string | null;
  /** uuid ของผู้ทำ (auth user id) */
  actorId?:    string | null;
  /** ชื่อผู้ทำ (โชว์ในหน้าประวัติ) */
  actorName?:  string | null;
  metadata?:   Record<string, unknown>;
};

function toRow(e: AuditEntry) {
  return {
    actor_user_id: isUuid(e.actorId) ? e.actorId : null,
    action:        e.action,
    entity_type:   e.entityType,
    entity_id:     isUuid(e.entityId) ? e.entityId : null,
    metadata:      { actor: e.actorName ?? null, ...(e.metadata ?? {}) },
  };
}

/** เหมือน writeAudit แต่คืน id ของ log (ไว้ให้ขั้นถัดไปอ้างถึงได้ เช่น ย้อนการส่งออก qc.unship) — null = เขียนไม่สำเร็จ */
export async function writeAuditId(admin: Admin, entry: AuditEntry): Promise<string | null> {
  const { data, error } = await admin.from("audit_logs").insert(toRow(entry)).select("id").single();
  if (error) {
    console.error(`[audit] เขียน log ล้มเหลว action=${entry.action} entity=${entry.entityType}:`, error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

/** เขียน audit 1 รายการ — คืน true ถ้าสำเร็จ */
export async function writeAudit(admin: Admin, entry: AuditEntry): Promise<boolean> {
  const { error } = await admin.from("audit_logs").insert(toRow(entry));
  if (error) {
    console.error(`[audit] เขียน log ล้มเหลว action=${entry.action} entity=${entry.entityType}:`, error.message);
    return false;
  }
  return true;
}

/**
 * เขียน audit โดยหา "ใครทำ" จาก request เอง (token ผู้ใช้) — สำหรับ API route ที่ไม่ได้ดึง user มาไว้แล้ว
 * หา user ไม่ได้ = บันทึกแบบไม่ระบุผู้ทำ (ไม่ throw)
 */
export async function writeAuditFor(request: Request, admin: Admin, entry: Omit<AuditEntry, "actorId" | "actorName">): Promise<boolean> {
  let actorId: string | null = null, actorName: string | null = null;
  try { const { data: { user } } = await supabaseFromRequest(request).auth.getUser(); actorId = user?.id ?? null; actorName = user?.email ?? null; }
  catch { /* ไม่มีตัวตน */ }
  return writeAudit(admin, { ...entry, actorId, actorName });
}

// ── จด "จากอะไรเป็นอะไร" (ของกลาง) ────────────────────────────────────────────
// ใช้: อ่านค่าเดิมของช่องที่จะแก้ก่อนบันทึก → หลังบันทึกเรียก auditDiff(before, patch) → ใส่ metadata.changes
// หน้าประวัติ (lib/audit-format) อ่านรูปแบบนี้ได้เลย · ข้อความยาว/ก้อน JSON ตัดเหลือ ~300 ตัวอักษร (ฉบับเต็มอยู่ที่ระบบเวอร์ชัน)
// ค่าอ่อนไหว (เงินเดือน/ราคาทุน) จดไว้ได้ — หน้าประวัติซ่อนค่าตามสิทธิ์ผู้ดู · ค่าความลับ (โทเคน) ส่งชื่อช่องใน secret → ไม่จดค่าเลย

export type AuditChangeRecord = { field: string; old: unknown; new: unknown; label?: string };

const DIFF_SKIP = new Set(["id", "created_at", "updated_at", "created_by", "updated_by"]);
const DIFF_MAX_TEXT = 300;

function compactAuditValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "string") return v.length > DIFF_MAX_TEXT ? `${v.slice(0, DIFF_MAX_TEXT - 1)}…` : v;
  if (v && typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > DIFF_MAX_TEXT ? { preview: `${s.slice(0, DIFF_MAX_TEXT - 1)}…` } : v;
  }
  return v;
}

function sameAuditValue(a: unknown, b: unknown): boolean {
  if ((a && typeof a === "object") || (b && typeof b === "object")) return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return String(a ?? "") === String(b ?? "");   // 590 กับ "590" / null กับ "" = เท่ากัน
}

/** เทียบค่าเดิมกับค่าที่บันทึก → รายการช่องที่เปลี่ยนจริง (ช่องที่ค่าเท่าเดิมไม่จด) */
export function auditDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  opts: { secret?: string[] } = {},
): AuditChangeRecord[] {
  const out: AuditChangeRecord[] = [];
  const secret = new Set(opts.secret ?? []);
  for (const k of Object.keys(after)) {
    if (DIFF_SKIP.has(k)) continue;
    const o = before ? before[k] : undefined;
    const n = after[k];
    if (sameAuditValue(o, n)) continue;
    out.push(secret.has(k)
      ? { field: k, old: "(ค่าความลับ)", new: "(ค่าความลับ)" }
      : { field: k, old: compactAuditValue(o), new: compactAuditValue(n) });
  }
  return out;
}

/**
 * ก้อน metadata "แก้อะไร จากอะไรเป็นอะไร" พร้อมใส่ใน writeAudit — ใช้แทนการจดแค่ชื่อช่อง
 *   metadata: { ...auditChangeMeta(before, patch) }
 * - before ว่าง (อ่านค่าเดิมไม่ได้) → จดแค่ชื่อช่อง (changed_fields) เหมือนเดิม ไม่ล้ม
 * - opaque = ช่องก้อนข้อมูลภายใน (config/JSON ยาว) → จดแค่ว่า "แก้รายละเอียด" (changed_detail) ไม่จดค่า
 * - onlyKnown = เทียบเฉพาะช่องที่มีในค่าเดิม (ฟอร์มที่ส่งชื่อช่องไม่ตรงคอลัมน์) — ช่องอื่นจดแค่ชื่อ
 * - secret = ค่าความลับ (โทเคน/รหัสผ่าน) → ไม่จดค่า
 */
export function auditChangeMeta(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  opts: { secret?: string[]; opaque?: string[]; onlyKnown?: boolean } = {},
): { changes?: AuditChangeRecord[]; changed_fields?: string[]; changed_detail?: string[] } {
  const keys = Object.keys(after).filter((k) => !DIFF_SKIP.has(k));
  if (!before) return keys.length ? { changed_fields: keys } : {};
  const opaque = new Set(opts.opaque ?? []);
  const diffAfter: Record<string, unknown> = {};
  const detail: string[] = [];
  const unknown: string[] = [];
  for (const k of keys) {
    if (opaque.has(k)) { if (!sameAuditValue(before[k], after[k])) detail.push(k); continue; }
    if (opts.onlyKnown && !(k in before)) { unknown.push(k); continue; }
    diffAfter[k] = after[k];
  }
  const changes = auditDiff(before, diffAfter, { secret: opts.secret });
  return {
    ...(changes.length ? { changes } : {}),
    ...(detail.length ? { changed_detail: detail } : {}),
    ...(unknown.length ? { changed_fields: unknown } : {}),
  };
}

/**
 * เทียบ "รายการบรรทัด" ก่อน/หลัง (วัตถุดิบในสูตร / รายการในเอกสาร) ที่บันทึกแบบแทนที่ทั้งชุด
 * → ได้แถว "จาก → เป็น" ต่อรายการ: เพิ่มใหม่ (ว่าง → 3 ม.) · เอาออก (2 ม. → ว่าง) · เปลี่ยนจำนวน (2 → 3)
 * รวมจำนวนตามรหัส (key) ก่อนเทียบ — รายการซ้ำรหัสนับรวม · เกิน max แสดงเป็น "อีก N รายการ"
 */
export function auditLinesDiff(
  before: Record<string, unknown>[],
  after: Record<string, unknown>[],
  opts: { key: string; qty: string; uom?: string; name?: string; noun?: string; max?: number; prefix?: string },
): AuditChangeRecord[] {
  const pre = opts.prefix ?? "line";   // ชื่อช่องในประวัติ = "<prefix>:<รหัส>" (เช่น cost_line = ตัวเลขต้นทุน → หน้าประวัติซ่อนตามสิทธิ์)
  type Agg = { qty: number; uom: string; name: string };
  const agg = (rows: Record<string, unknown>[]) => {
    const m = new Map<string, Agg>();
    for (const r of rows) {
      const name = opts.name ? String(r[opts.name] ?? "").trim() : "";
      const k = String(r[opts.key] ?? "").trim() || name;
      if (!k) continue;
      const cur = m.get(k) ?? { qty: 0, uom: opts.uom ? String(r[opts.uom] ?? "").trim() : "", name };
      cur.qty += Number(r[opts.qty]) || 0;
      m.set(k, cur);
    }
    return m;
  };
  const a = agg(before), b = agg(after);
  const show = (x: Agg | undefined) => (x ? `${Math.round(x.qty * 10000) / 10000}${x.uom ? ` ${x.uom}` : ""}` : null);
  const out: AuditChangeRecord[] = [];
  let more = 0;
  const max = opts.max ?? 30;
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const o = a.get(k), n = b.get(k);
    if (o && n && show(o) === show(n)) continue;
    if (out.length >= max) { more++; continue; }
    const name = (n?.name || o?.name || "").slice(0, 40);
    out.push({ field: `${pre}:${k}`, label: `${opts.noun ?? "รายการ"} ${k}${name && name !== k ? ` · ${name}` : ""}`, old: show(o), new: show(n) });
  }
  if (more) out.push({ field: `${pre}:_more`, label: "รายการอื่น ๆ", old: null, new: `เปลี่ยนอีก ${more} รายการ` });
  return out;
}

/** อ่านแถวเต็มของ record ไว้เทียบก่อน/หลังแก้ — อ่านไม่ได้ = null (ไม่ throw · ไม่ขวาง action หลัก) */
export async function auditSnapshot(admin: Admin, table: string, id: string, idCol = "id"): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await admin.from(table).select("*").eq(idCol, id).maybeSingle();
    if (error) { console.error(`[audit] อ่านค่าเดิม ${table} ไม่ได้:`, error.message); return null; }
    return (data as Record<string, unknown> | null) ?? null;
  } catch { return null; }
}

const LABEL_CODE_KEYS = ["code", "pr_no", "po_no", "so_no", "mo_no", "doc_no", "sku", "bom_code", "contract_no", "employee_code"];
const LABEL_NAME_KEYS = ["name_th", "name", "title", "nickname", "item_name", "label"];

/** เลขเอกสาร/ชื่อของแถว → ใส่ใน metadata ให้หน้าประวัติโชว์ว่า "รายการไหน" ได้ ({code, name}) */
export function auditRecordLabel(row: Record<string, unknown> | null | undefined): { code?: string; name?: string } {
  if (!row) return {};
  const pick = (keys: string[]) => {
    for (const k of keys) { const v = row[k]; if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120); if (typeof v === "number") return String(v); }
    return undefined;
  };
  const code = pick(LABEL_CODE_KEYS);
  const name = pick(LABEL_NAME_KEYS);
  return { ...(code ? { code } : {}), ...(name && name !== code ? { name } : {}) };
}

/** เขียน audit หลายรายการพร้อมกัน (เช่น อนุมัติหลายใบ = 1 แถวต่อใบ) — คืนจำนวนที่เขียนได้ */
export async function writeAuditMany(admin: Admin, entries: AuditEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  const { error } = await admin.from("audit_logs").insert(entries.map(toRow));
  if (error) {
    console.error(`[audit] เขียน log (${entries.length} แถว) ล้มเหลว:`, error.message);
    return 0;
  }
  return entries.length;
}
