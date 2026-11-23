/**
 * สินค้าซ้ำบนร้าน (1 รุ่นในระบบ = หลายรายการบนร้าน) — ส่วนคิด (pure · เทสต์ได้ · ห้าม import "@/...")
 *
 * เจ้าของเลือก 2026-11-23: วิธี B (ระบบชี้ · เจ้าของลบเองใน Seller Centre) + ข้อ 1-5
 *   1 กฎเลือกตัวที่เก็บ: เปิดขายอยู่ → ยอดขาย 90 วัน → อัปเดตล่าสุด (เปลี่ยนเองได้ในหน้าจอ)
 *   2 ก่อนเปิดไปลบ เช็กสด: ออเดอร์ค้าง · โปรโมชัน (API /api/platform-catalog/duplicates action check)
 *   3 "ไม่ใช่ตัวซ้ำ" ซ่อนกลุ่มที่ตั้งใจลงซ้ำ (ui_config ต่อร้าน×แบรนด์ · ย้อนกลับได้)
 *   4 ตัวที่ยังเปิดขายซ้อน → ปิดขายแทนการลบได้ (ย้อนกลับได้)
 *   5 Lazada / TikTok ทีหลัง — การจัดกลุ่มใช้ได้ทุกร้านแล้ว (เช็กสด/ปิดขาย = Shopee ก่อน)
 * เจอจริง 2026-11-22: Louis Montini บน Shopee มี 81 รุ่นที่ซ้ำ (เกิน 86 รายการ) · LY22 ซ้ำเพราะลงจากระบบก่อนมีด่านกันลงซ้ำ
 */

export type DupListing = {
  id: string; externalId: string; status: string | null; price: number | null; title: string | null;
  image: string | null; updateTime: number | null;
  /** ยอดขาย (ชิ้น) 90 วันจากออเดอร์ในระบบ */
  sales90: number;
  /** ระบบเราสร้างรายการนี้ (ตัวช่วยลงสินค้า) */
  byErp: boolean;
};
export type DupTag = "two_selling" | "none_selling" | "erp_made";
export type DupGroup = {
  parentId: string; code: string; name: string | null; cover: string | null;
  listings: DupListing[];
  /** ตัวที่ระบบแนะนำให้เก็บ + เหตุผล */
  keepId: string; keepReason: string;
  tags: DupTag[];
  ignored: boolean;
};

const selling = (s: string | null) => String(s ?? "").toLowerCase() === "normal";

/** ข้อ 1: เปิดขายอยู่ → ยอดขาย 90 วัน → อัปเดตล่าสุด → รหัสบนร้านเก่ากว่า (ตัวเดิม) */
export function pickKeep(listings: readonly DupListing[]): { keepId: string; keepReason: string } {
  const sorted = [...listings].sort((a, b) =>
    Number(selling(b.status)) - Number(selling(a.status))
    || b.sales90 - a.sales90
    || (b.updateTime ?? 0) - (a.updateTime ?? 0)
    || a.externalId.localeCompare(b.externalId, undefined, { numeric: true }));
  const k = sorted[0];
  if (!k) return { keepId: "", keepReason: "" };
  const reason = selling(k.status) && listings.filter((l) => selling(l.status)).length === 1 ? "ตัวเดียวที่เปิดขาย"
    : k.sales90 > 0 ? `ขายได้มากสุดใน 90 วัน (${k.sales90} ชิ้น)`
    : k.updateTime ? "อัปเดตล่าสุด" : "รายการเดิม (รหัสเก่ากว่า)";
  return { keepId: k.id, keepReason: reason };
}

export function dupTags(listings: readonly DupListing[]): DupTag[] {
  const n = listings.filter((l) => selling(l.status)).length;
  const out: DupTag[] = [];
  if (n >= 2) out.push("two_selling");
  if (n === 0) out.push("none_selling");
  if (listings.some((l) => l.byErp)) out.push("erp_made");
  return out;
}

export const DUP_TAG_LABEL: Record<DupTag, string> = {
  two_selling: "เปิดขายซ้อน",
  none_selling: "ไม่มีตัวเปิดขาย",
  erp_made: "ระบบสร้างซ้ำ",
};

/**
 * รายการบนร้าน (จับคู่แล้ว · ไม่นับตัวที่ไม่อยู่บนร้านแล้ว) → กลุ่มที่ซ้ำ (≥ 2 รายการ/รุ่น)
 * เรียง: เปิดขายซ้อน → ระบบสร้างซ้ำ → จำนวนรายการมากก่อน → รหัส
 */
export function buildDuplicateGroups(
  rows: readonly (DupListing & { parentId: string })[],
  parents: Readonly<Record<string, { code: string; name: string | null; cover: string | null }>>,
  ignored: ReadonlySet<string>,
): DupGroup[] {
  const by = new Map<string, DupListing[]>();
  for (const r of rows) { const { parentId, ...l } = r; (by.get(parentId) ?? by.set(parentId, []).get(parentId)!).push(l); }
  const out: DupGroup[] = [];
  for (const [parentId, listings] of by) {
    if (listings.length < 2) continue;
    const p = parents[parentId];
    out.push({ parentId, code: p?.code ?? "", name: p?.name ?? null, cover: p?.cover ?? null, listings, ...pickKeep(listings), tags: dupTags(listings), ignored: ignored.has(parentId) });
  }
  const rank = (g: DupGroup) => (g.tags.includes("two_selling") ? 0 : g.tags.includes("erp_made") ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || b.listings.length - a.listings.length || a.code.localeCompare(b.code));
}

/** ui_config key ของกลุ่มที่ "ไม่ใช่ตัวซ้ำ" (ต่อร้าน × แบรนด์) */
export const dupIgnoredKey = (platformId: string, brandId: string) => `platform_dupes_ignored:${platformId}:${brandId}`;

/** สถานะออเดอร์บน Shopee ที่ยังไม่จบ (ห้ามลบรายการระหว่างนี้) */
export const SHOPEE_OPEN_ORDER_STATUSES = ["UNPAID", "READY_TO_SHIP", "PROCESSED", "RETRY_SHIP", "IN_CANCEL", "TO_RETURN"] as const;
