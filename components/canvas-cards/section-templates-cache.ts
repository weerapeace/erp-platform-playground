// โหลดเทมเพลตโซนกระดาน (ui_config board_section_templates) แบบจำไว้ในหน้า — ใช้ร่วมกันระหว่างชุดการ์ดกลางกับหน้าตั้งค่า
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
