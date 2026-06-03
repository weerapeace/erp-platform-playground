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

/** เขียน audit 1 รายการ — คืน true ถ้าสำเร็จ */
export async function writeAudit(admin: Admin, entry: AuditEntry): Promise<boolean> {
  const { error } = await admin.from("audit_logs").insert(toRow(entry));
  if (error) {
    console.error(`[audit] เขียน log ล้มเหลว action=${entry.action} entity=${entry.entityType}:`, error.message);
    return false;
  }
  return true;
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
