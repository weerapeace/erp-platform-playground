/**
 * 🕘 ประวัติแม่แบบเอกสาร (server only) — ก่อนบันทึกทับ จดสำเนา "ทั้งใบ" ของเดิมไว้ 1 แถว
 * ที่เก็บ = ตารางเวอร์ชันกลาง entity_field_history (เดียวกับ lib/record-versions) แยกด้วย entity_type
 *   entity_type = "erp_report_templates" · field_key = "template" · old_value = สำเนาทั้งใบ (JSON)
 * เก็บล่าสุด 30 เวอร์ชันต่อใบ · best-effort: จดไม่สำเร็จ ห้ามทำให้การบันทึกพัง
 * ย้อนเวอร์ชัน = หน้าออกแบบโหลดสำเนาเข้ามาเป็นงานที่ยังไม่บันทึก → ผู้ใช้กดบันทึกเอง (ผ่านสิทธิ์ admin.reports + จดสำเนาของปัจจุบันอีกที)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

export const TEMPLATE_HISTORY_ENTITY = "erp_report_templates";
const FIELD_KEY = "template";
const KEEP = 30;

/** ช่องที่จด (ส่วนที่ "หน้าตา" ของเอกสาร — ไม่รวม flag ใช้งาน) */
export const SNAPSHOT_FIELDS = ["label", "paper_size", "orientation", "header_html", "body_html", "footer_html", "custom_css"] as const;
export type TemplateSnapshot = Partial<Record<(typeof SNAPSHOT_FIELDS)[number], string>>;

export type TemplateVersion = {
  id: string;
  changed_at: string;
  actor_name: string | null;
  changed: string[];
  snapshot: TemplateSnapshot;
};

function pick(row: Record<string, unknown>): TemplateSnapshot {
  const out: TemplateSnapshot = {};
  for (const f of SNAPSHOT_FIELDS) out[f] = String(row[f] ?? "");
  return out;
}

/** อ่านสำเนาของเดิม "ก่อน" บันทึก (null = ไม่พบ/อ่านไม่ได้) */
export async function readTemplateSnapshot(admin: Admin, id: string): Promise<TemplateSnapshot | null> {
  try {
    const { data } = await admin.from("erp_report_templates").select(SNAPSHOT_FIELDS.join(",")).eq("id", id).maybeSingle();
    return data ? pick(data as unknown as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** บันทึกสำเร็จแล้ว → จดสำเนาของเดิม (ถ้าเนื้อหาเปลี่ยนจริง) */
export async function saveTemplateVersion(
  admin: Admin,
  id: string,
  old: TemplateSnapshot,
  next: Record<string, unknown>,
  actorName: string | null,
): Promise<void> {
  try {
    const changed = SNAPSHOT_FIELDS.filter(f => f in next && String(next[f] ?? "") !== old[f]);
    if (changed.length === 0) return;
    await admin.from("entity_field_history").insert({
      entity_type: TEMPLATE_HISTORY_ENTITY,
      entity_id: id,
      field_key: FIELD_KEY,
      kind: "field",
      old_value: old,
      source: "template_edit",
      actor_name: actorName,
      meta: { changed },
    });
    // ตัดเวอร์ชันที่เกิน
    const { data: extra } = await admin.from("entity_field_history").select("id")
      .eq("entity_type", TEMPLATE_HISTORY_ENTITY).eq("entity_id", id)
      .order("changed_at", { ascending: false }).range(KEEP, KEEP + 200);
    const ids = (extra ?? []).map(r => (r as { id: string }).id);
    if (ids.length) await admin.from("entity_field_history").delete().in("id", ids);
  } catch (e) {
    console.error("[report-template-history] capture failed", e);
  }
}

export async function listTemplateVersions(admin: Admin, id: string): Promise<TemplateVersion[]> {
  const { data, error } = await admin.from("entity_field_history")
    .select("id, changed_at, actor_name, old_value, meta")
    .eq("entity_type", TEMPLATE_HISTORY_ENTITY).eq("entity_id", id).eq("field_key", FIELD_KEY)
    .order("changed_at", { ascending: false }).limit(KEEP);
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => {
    const row = r as { id: string; changed_at: string; actor_name: string | null; old_value: TemplateSnapshot | null; meta: { changed?: string[] } | null };
    return { id: row.id, changed_at: row.changed_at, actor_name: row.actor_name, changed: row.meta?.changed ?? [], snapshot: row.old_value ?? {} };
  });
}
