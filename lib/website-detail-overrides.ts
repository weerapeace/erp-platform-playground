/**
 * "จับคู่รายละเอียดหน้าเว็บ" เฉพาะรุ่น — ค่าใน store_listings.web_details
 *   { [detailItemId]: { show?: boolean, text?: string } }
 *   - show=true  บังคับโชว์หัวข้อนี้กับรุ่นนี้ (แม้ค่ากลางไม่ครอบคลุม/ปิดอยู่)
 *   - show=false ซ่อนหัวข้อนี้กับรุ่นนี้
 *   - text       เนื้อหาเฉพาะรุ่นนี้ แทนเนื้อหาจากแหล่งข้อมูลกลาง
 *   - ไม่มี key  = ตามค่ากลางของธีม (lib/website-theme.ts detailItems)
 * ใช้ร่วมกันโดย /api/parent-web-listings (บันทึก) และ /api/public/storefront/products (ส่งให้เว็บร้าน)
 */
export type DetailOverride = { show?: boolean; text?: string };

export function cleanDetailOverrides(raw: unknown): Record<string, DetailOverride> {
  const out: Record<string, DetailOverride> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    if (!/^[\w-]{1,64}$/.test(id) || !v || typeof v !== "object") continue;
    const o = v as { show?: unknown; text?: unknown };
    const e: DetailOverride = {};
    if (typeof o.show === "boolean") e.show = o.show;
    if (typeof o.text === "string" && o.text.trim()) e.text = o.text.trim().slice(0, 3000);
    if (e.show !== undefined || e.text !== undefined) out[id] = e;
  }
  return out;
}
