/**
 * เวอร์ชันเอกสารกลาง (ของกลางฝั่ง server) — ตาราง document_revisions เก็บ "ทั้งใบ" ต่อเวอร์ชัน
 * ★ 2026-11-15 เจ้าของ: "อยากให้ใบที่ยืนยันแล้ว แก้ไขได้ด้วย แต่ต้องเก็บประวัติ" — เริ่มใช้กับใบสำคัญรับ · ใบสั่งซื้อ/ใบสั่งขายใช้ตารางเดียวกันได้ (entity_type)
 *   ต่างจาก lib/record-versions (entity_field_history) ที่เก็บทีละช่องของสินค้า
 * ใช้: /api/purchasing/vouchers/[id]/confirm (v1) · /revise (แก้หลังยืนยัน) · migration 202612180210_document_revisions
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const VOUCHER_ENTITY = "purchase_vouchers_v2";

export type RevisionRow = {
  id: string; entity_type: string; entity_id: string; rev_no: number; action: string; reason: string | null;
  diff: { label: string; before: string | null; after: string | null }[] | null;
  actor_name: string | null; created_at: string;
  snapshot?: unknown;
};

export async function saveRevision(admin: SupabaseClient, r: { entityType: string; entityId: string; revNo: number; action: string; reason: string | null; snapshot: unknown; diff: unknown; actorId: string | null; actorName: string | null; createdAt?: string }): Promise<void> {
  const { error } = await admin.from("document_revisions").upsert({
    entity_type: r.entityType, entity_id: r.entityId, rev_no: r.revNo, action: r.action, reason: r.reason, snapshot: r.snapshot, diff: r.diff,
    actor_id: r.actorId, actor_name: r.actorName, ...(r.createdAt ? { created_at: r.createdAt } : {}),
  }, { onConflict: "entity_type,entity_id,rev_no" });
  if (error) throw new Error("เก็บเวอร์ชันไม่สำเร็จ: " + error.message);
}

/** ทุกเวอร์ชัน (ใหม่ → เก่า) · withSnapshot = แนบเอกสารทั้งใบด้วย (หนัก — ใช้เมื่อเปิดดูเวอร์ชันเดียว) */
export async function listRevisions(admin: SupabaseClient, entityType: string, entityId: string, withSnapshot = false): Promise<RevisionRow[]> {
  const cols = `id, entity_type, entity_id, rev_no, action, reason, diff, actor_name, created_at${withSnapshot ? ", snapshot" : ""}`;
  const { data } = await admin.from("document_revisions").select(cols).eq("entity_type", entityType).eq("entity_id", entityId).order("rev_no", { ascending: false });
  return (data ?? []) as unknown as RevisionRow[];
}

export async function getRevision(admin: SupabaseClient, entityType: string, entityId: string, revNo: number): Promise<RevisionRow | null> {
  const { data } = await admin.from("document_revisions").select("id, entity_type, entity_id, rev_no, action, reason, diff, actor_name, created_at, snapshot")
    .eq("entity_type", entityType).eq("entity_id", entityId).eq("rev_no", revNo).maybeSingle();
  return (data ?? null) as unknown as RevisionRow | null;
}
