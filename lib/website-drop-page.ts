/**
 * 🧱 หน้าของแต่ละชุดมาใหม่ (/new/<ชุด>) — จัดด้วยตัวจัดหน้า 3 แผงตัวเดียวกับแท็บ "หน้าเว็บ"
 *   เก็บที่ store_new_drops.layout (เผยแพร่แล้ว) / draft_layout (ร่าง) · null ทั้งคู่ = หน้าตาเดิม (เว็บร้านวาดเอง)
 *   โครงตั้งต้น = Section "🆕 ชุดมาใหม่" (ชุดของหน้านี้) 1 ตัว id คงที่ DROP_PAGE_MAIN_ID
 *     → เว็บร้านโหมดพรีวิวที่ยังไม่มีหน้า วาดโครงเดียวกันฝั่งเซิร์ฟเวอร์ได้ (id ตรงกัน พรีวิวสดไม่ขึ้น "กำลังโหลด")
 * ใช้: API /api/website/new-drops/page (ERP) · /api/public/storefront/new-drops/page (เว็บร้าน) · components/website-drop-page-builder
 * ไฟล์ pure (ไม่มี "use client")
 */
import { newBlock, normalizeBlocks, type Block } from "@/lib/website-blocks";

/** ⚠️ ต้องตรงกับเว็บร้าน src/app/new/[drop]/page.tsx (DROP_PAGE_MAIN_ID) */
export const DROP_PAGE_MAIN_ID = "drop-main";

/** โครงตั้งต้นของหน้าชุด: แบนเนอร์ชุด + นับถอยหลัง/สินค้า (Section ชุดมาใหม่ · ชุดของหน้านี้) */
export function defaultDropPageBlocks(): Block[] {
  const b = newBlock("drop", 1);
  return normalizeBlocks([{ ...b, id: DROP_PAGE_MAIN_ID }]);
}

/** Section ที่เว็บร้านใช้: พรีวิว = ร่าง (ไม่มี = ที่เผยแพร่) · ปกติ = ที่เผยแพร่ · null = ยังไม่จัด (หน้าตาเดิม) */
export function dropPageLayout(row: { layout?: unknown; draft_layout?: unknown }, preview: boolean): Block[] | null {
  const pick = preview ? (row.draft_layout ?? row.layout) : row.layout;
  if (!Array.isArray(pick)) return null;
  return normalizeBlocks(pick);
}
