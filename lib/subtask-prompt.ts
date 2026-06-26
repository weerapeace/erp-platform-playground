// ============================================================
// Subtask prompt template (ของกลาง) — เติมตัวแปร {{...}} ในแม่แบบ prompt
// ใช้ฝั่ง preview (หน้าเทมเพลต) + ฝั่งจริง (ปุ่ม copy prompt ในงานย่อย)
// ============================================================

// ตัวแปรที่รองรับ (โชว์เป็นคู่มือในตัวแก้ + เติมค่าจริงตอน copy)
export const PROMPT_VARS: { key: string; hint: string }[] = [
  { key: "brand_name", hint: "ชื่อแบรนด์" },
  { key: "task_name", hint: "ชื่องาน" },
  { key: "parent_sku", hint: "รหัส Parent SKU" },
  { key: "sku_list", hint: "รายการ SKU" },
  { key: "product_name", hint: "ชื่อสินค้า" },
  { key: "price", hint: "ราคา" },
  { key: "collection", hint: "คอลเลกชัน" },
  { key: "colors", hint: "สี" },
  { key: "materials", hint: "วัสดุ" },
  { key: "platforms", hint: "แพลตฟอร์ม" },
  { key: "approved_image_urls", hint: "ลิงก์รูปที่อนุมัติ" },
  { key: "notes", hint: "หมายเหตุ/บรีฟ" },
  { key: "output_format", hint: "รูปแบบผลลัพธ์ที่ต้องการ" },
];

export type PromptVars = Partial<Record<(typeof PROMPT_VARS)[number]["key"], string>>;

/** เติม {{var}} ในแม่แบบ — ตัวแปรที่ไม่มีค่า → แทนด้วยช่องว่าง แล้วยุบบรรทัดว่างซ้อน */
export function renderPrompt(template: string | null | undefined, vars: PromptVars): string {
  return (template ?? "")
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => (vars as Record<string, string>)[k] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
