// โหลด/บันทึกเทมเพลตโซนกระดาน (ui_config board_section_templates) — จำไว้ในหน้า · ใช้ร่วมกันระหว่างชุดการ์ดกลางกับหน้าตั้งค่า
// บันทึกผ่าน /api/ui-config (ด่านสิทธิ์ + ประวัติการแก้ลง audit ที่ฝั่ง API)
import { apiFetch } from "@/lib/api";
import { BOARD_SECTION_TEMPLATES_KEY, cleanSectionConfig, type BoardSectionConfig } from "@/lib/board-section-templates";

let cache: Promise<BoardSectionConfig> | null = null;
export function loadSectionTemplates(force = false): Promise<BoardSectionConfig> {
  if (!cache || force) {
    cache = apiFetch(`/api/ui-config?key=${BOARD_SECTION_TEMPLATES_KEY}`).then((r) => r.json())
      .then((j) => cleanSectionConfig(j?.value ?? null)).catch(() => cleanSectionConfig(null));
  }
  return cache;
}
export function clearSectionTemplatesCache() { cache = null; }

/** บันทึกทั้งก้อน — ไม่สำเร็จ = throw ข้อความภาษาคน */
export async function saveSectionTemplates(next: BoardSectionConfig): Promise<void> {
  const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: BOARD_SECTION_TEMPLATES_KEY, value: next }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || (r.status === 401 || r.status === 403 ? "คุณไม่มีสิทธิ์แก้เทมเพลตโซน" : "บันทึกไม่สำเร็จ"));
  cache = Promise.resolve(next);
}
