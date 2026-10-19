/**
 * พรีวิวสดของตัวจัดหน้าเว็บ — ตัดสินว่า "หลังบันทึกร่าง ต้องโหลดพรีวิวใหม่ไหม"
 *
 * พรีวิวสด (เว็บร้านตอบ storefront-live-ready): ERP ส่งโครงหน้าล่าสุด (storefront-blocks-live) ทุกครั้งที่แก้ → เห็นทันที
 *   - Section ทั่วไป + รูปลักษณ์ทุก Section = วาดใหม่ในพรีวิวเอง ไม่ต้องโหลดหน้าใหม่
 *   - Section ที่ดึงข้อมูลสินค้า/หมวด (LIVE_RELOAD_TYPES) = เนื้อหาเปลี่ยน → โหลดพรีวิวใหม่หลังบันทึกร่าง (เซิร์ฟเวอร์ต้องดึงข้อมูลใหม่)
 * เว็บร้านรุ่นเก่า (ไม่ตอบ) = แบบเดิม: โครงหน้าเปลี่ยนอะไรก็โหลดใหม่ (ยกเว้นเนื้อในผืนผ้าใบที่รับสดอยู่แล้ว)
 *
 * ชนิดที่ต้องโหลดใหม่: เว็บร้านบอกมาเองตอนตอบ storefront-live-ready { serverTypes } (ตาม SERVER_TYPES ของเว็บรุ่นนั้น)
 * เว็บที่ยังไม่บอก = ใช้ LIVE_RELOAD_TYPES (ชุดเดิม) — กันพรีวิวค้างของเก่าระหว่างเว็บร้านยังไม่อัปเดต
 */
type AnyBlock = { id: string; type: string; enabled?: boolean; visibility?: unknown; style?: unknown } & Record<string, unknown>;

export const LIVE_RELOAD_TYPES: readonly string[] = ["featured", "products", "personalize", "beltbuilder", "drop"];

/** แบบเดิม (พรีวิวไม่รับค่าสด): ทุกอย่างยกเว้นเนื้อในผืนผ้าใบ */
export function previewStructureSig(blocks: AnyBlock[]): string {
  return JSON.stringify(blocks.map((b) => (b.type === "canvas" ? { id: b.id, type: b.type, enabled: b.enabled, visibility: b.visibility, style: b.style } : b)));
}

/**
 * ลายเซ็นของ "สิ่งที่พรีวิวสดทำเองไม่ได้" — เปลี่ยน = ต้องโหลดพรีวิวใหม่
 * live = เฉพาะเนื้อหาของ Section ที่ดึงข้อมูล (เรียงตาม id — ย้ายลำดับไม่ต้องโหลดใหม่ · รูปลักษณ์/ซ่อน/ปิด ไม่นับ)
 */
export function previewReloadSig(blocks: AnyBlock[], live: boolean, serverTypes?: readonly string[] | null): string {
  if (!live) return previewStructureSig(blocks);
  const types = serverTypes ?? LIVE_RELOAD_TYPES;
  const data = blocks
    .filter((b) => types.includes(b.type) && b.enabled !== false)
    .map((b) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { style, visibility, enabled, ...content } = b;
      return content;
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify(data);
}
