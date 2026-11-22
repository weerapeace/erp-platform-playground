/**
 * เทมเพลตงาน — "โชว์ในหน้าสร้างงาน" (เจ้าของเลือก 2026-11-22)
 *   ค่าเก็บที่ erp_creative_task_templates.wizard_visibility
 *   all = ทุกที่ · brand = เฉพาะตอนเลือกแบรนด์ · nobrand = เฉพาะตอน "ไม่ระบุแบรนด์" · hidden = ซ่อนจากหน้าสร้างงาน
 *   ซ่อนแล้วเทมเพลตยังอยู่ (หน้าเทมเพลต / งานประจำยังใช้ได้) · เปิดกลับได้ที่ /tasks/templates
 * ใช้ที่: app/tasks/create-task-modal (กรองการ์ดเทมเพลต) · app/tasks/templates (ตั้งค่า) · API creative-templates (ตรวจค่า)
 */
export type WizardVisibility = "all" | "brand" | "nobrand" | "hidden";

export const WIZARD_VISIBILITY_OPTIONS: { value: WizardVisibility; th: string; en: string }[] = [
  { value: "all", th: "ทุกที่", en: "Everywhere" },
  { value: "brand", th: "เฉพาะตอนเลือกแบรนด์", en: "Only with a brand" },
  { value: "nobrand", th: "เฉพาะตอนไม่ระบุแบรนด์", en: "Only with no brand" },
  { value: "hidden", th: "ซ่อนจากหน้าสร้างงาน", en: "Hidden from new task" },
];

const VALID = new Set<string>(WIZARD_VISIBILITY_OPTIONS.map((o) => o.value));
export function cleanWizardVisibility(v: unknown): WizardVisibility | null {
  return typeof v === "string" && VALID.has(v) ? (v as WizardVisibility) : null;
}

/** ค่าที่ใช้จริงของเทมเพลต (ข้อมูลเก่าที่ยังไม่มีช่องนี้ → ดูจาก no_brand_only) */
export function wizardVisibilityOf(tpl: { wizard_visibility?: string | null; no_brand_only?: boolean | null }): WizardVisibility {
  return cleanWizardVisibility(tpl.wizard_visibility) ?? (tpl.no_brand_only ? "nobrand" : "all");
}

/**
 * เทมเพลตนี้โชว์ในหน้าสร้างงานไหม
 * @param brandId แบรนด์ที่เลือก ("" / null = ไม่ระบุแบรนด์)
 * เทมเพลตผูกแบรนด์ = โชว์เฉพาะแบรนด์นั้น · เทมเพลตทั่วไป (ไม่ผูกแบรนด์) = โชว์ได้ทั้งสองแบบ ตามค่าที่ตั้ง
 */
export function templateShownInWizard(tpl: { brand_id?: string | null; wizard_visibility?: string | null; no_brand_only?: boolean | null }, brandId: string | null | undefined): boolean {
  const v = wizardVisibilityOf(tpl);
  if (v === "hidden") return false;
  if (brandId) {
    if (tpl.brand_id && tpl.brand_id !== brandId) return false;
    return v !== "nobrand";
  }
  if (tpl.brand_id) return false;
  return v !== "brand";
}

/** no_brand_only (ช่องเก่า) ที่ควรเก็บคู่กัน — hidden = ไม่แตะค่าเดิม */
export function legacyNoBrandOnly(v: WizardVisibility): boolean | undefined {
  if (v === "nobrand") return true;
  if (v === "hidden") return undefined;
  return false;
}
