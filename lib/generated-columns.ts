/**
 * คอลัมน์ที่ฐานข้อมูล "คำนวณให้เอง" (GENERATED ALWAYS) — ของกลาง ใช้ได้ทั้งฝั่ง server และหน้าจอ
 *
 * ส่งค่าไปด้วยตอน insert/update แล้ว Postgres จะปฏิเสธทั้งคำสั่ง:
 *   insert → 'cannot insert a non-DEFAULT value into column "…"'
 *   update → 'column "…" can only be updated to DEFAULT'   (เคสจริง 2026-10-07: แก้ช่อง Color Platform [EN] ในตาราง SKU ลูก)
 *
 * ฝั่ง API: stripGenerated() ก่อนเขียนทุกเส้นทาง (master-v2 POST/PATCH/bulk-update, skus/copy)
 * ฝั่งหน้าจอ: isGeneratedColumn() → ช่องนั้นแก้ไม่ได้ ให้บอกว่าแก้ที่ต้นทางแทน (generatedHint)
 */
export const GENERATED_COLS = new Set([
  "color_platform_th", "color_platform_en",   // skus_v2 — คำนวณจาก color_th/color + เลขท้ายรหัส เช่น "ดำ (01)"
  "price_thb",                                 // parent_sku_supply_data — คำนวณจากราคาหยวน × เรท
  "owner_key", "search_vector",
]);

export const isGeneratedColumn = (col: string): boolean => GENERATED_COLS.has(col);

/** ตัดคอลัมน์คำนวณอัตโนมัติออกจาก payload (ถ้ามี) — คืน object เดิมถ้าไม่มีอะไรต้องตัด */
export function stripGenerated<T extends Record<string, unknown>>(payload: T): T {
  let hit = false;
  for (const k of Object.keys(payload)) if (GENERATED_COLS.has(k)) { hit = true; break; }
  if (!hit) return payload;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) if (!GENERATED_COLS.has(k)) clean[k] = v;
  return clean as T;
}

/** คำอธิบายภาษาคน ว่าช่องนี้คำนวณจากอะไร (ไว้ขึ้น tooltip/ข้อความแจ้งเตือน) */
export function generatedHint(col: string): string {
  switch (col) {
    case "color_platform_th": return "ระบบคำนวณให้เองจาก \"Color Th\" + เลขท้ายรหัส SKU (เช่น ดำ (01)) — แก้ที่ช่อง Color Th แล้วค่านี้จะเปลี่ยนตาม";
    case "color_platform_en": return "ระบบคำนวณให้เองจาก \"Color\" + เลขท้ายรหัส SKU (เช่น Black (01)) — แก้ที่ช่อง Color แล้วค่านี้จะเปลี่ยนตาม";
    case "price_thb": return "ระบบคำนวณให้เองจากราคาหยวน × เรท — แก้ที่ราคาหยวน/เรทแทน";
    default: return "ระบบคำนวณค่านี้ให้เอง แก้ตรงนี้ไม่ได้";
  }
}
