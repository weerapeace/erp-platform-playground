/**
 * ของกลาง — ประวัติเวอร์ชันที่เผยแพร่ของหน้าเว็บร้าน (หน้าแรก store_home_versions · หน้าอื่น store_page_versions)
 * ทั้งสองตารางโครงเดียวกัน (version_no · layout · actor · created_at) → แปลงเป็นแถวที่หน้าจอใช้ด้วยตัวเดียวกัน
 * ใช้ที่: /api/website/layout/versions · /api/website/pages/versions · components/website-version-history.tsx
 */
import { BLOCK_META, normalizeBlocks, type BlockType } from "@/lib/website-blocks";

export type WebVersionRow = { version_no: number; layout: unknown; actor: string | null; created_at: string };

export interface WebVersion {
  versionNo: number;
  createdAt: string;
  actor: string | null;
  /** จำนวน Section */
  blocks: number;
  /** ชื่อ Section ที่เปิดใช้ ตามลำดับ (ให้เจ้าของจำได้ว่าเวอร์ชันนี้หน้าตาประมาณไหน) */
  labels: string[];
}

export function toWebVersion(r: WebVersionRow): WebVersion {
  const blocks = normalizeBlocks(r.layout);
  return {
    versionNo: r.version_no,
    createdAt: r.created_at,
    actor: r.actor,
    blocks: blocks.length,
    labels: blocks.filter((b) => b.enabled !== false).map((b) => {
      const m = BLOCK_META[b.type as BlockType];
      return m ? `${m.icon} ${m.label}` : String(b.type);
    }),
  };
}

/** จำนวนเวอร์ชันล่าสุดที่โชว์ในหน้าจอ */
export const VERSION_LIST_LIMIT = 30;
