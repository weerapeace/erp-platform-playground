/**
 * ส่งเป็นของขวัญบน LINE SHOPPING (ของกลาง · pure — ใช้ได้ทั้งหน้าเว็บและ server)
 * เจ้าของขอ 2026-11-10: ตัวช่วยลงสินค้ามีให้เลือก · ค่าเริ่ม = เปิดการส่งของขวัญ + For Her / For Him / Couples
 *   (ร้านใช้ชุดนี้อยู่แล้ว 119 สินค้า)
 * ข้อมูลบน LINE: giftOption (NO_GIFT | ALLOW_GIFT | GIFT_ONLY) + giftGroups [{id, nameEn, nameTh}]
 * ในระบบ (ร่าง extra — คีย์เดียวกับ ProductPlatformManager): gift_status (on | gift_only | off) + gift_categories (ชื่อหมวด)
 * ส่งขึ้น LINE = lib/line-gift-server (คู่มือ API ไม่มีช่องนี้ในคำขอ → ลองรูปแบบที่เป็นไปได้ แล้วดึงกลับตรวจ)
 */

export type GiftStatus = "on" | "gift_only" | "off";
export type GiftSetting = { status: GiftStatus; categories: string[] };

/** หมวดของขวัญบน LINE — id 1/2/5 ยืนยันจากข้อมูลจริงบนร้าน · 3/4/6 เดาตามลำดับในหน้า LINE (ยังไม่ยืนยัน) */
export const LINE_GIFT_GROUPS: { id: number; name: string; confirmed: boolean }[] = [
  { id: 1, name: "For Her", confirmed: true },
  { id: 2, name: "For Him", confirmed: true },
  { id: 3, name: "Mom & Kids", confirmed: false },
  { id: 4, name: "Seniors", confirmed: false },
  { id: 5, name: "Couples", confirmed: true },
  { id: 6, name: "Pet Lovers", confirmed: false },
];
export const LINE_GIFT_MAX_GROUPS = 3;
export const GIFT_STATUS_LABEL: Record<GiftStatus, string> = { on: "เปิดการส่งของขวัญ", gift_only: "เฉพาะส่งของขวัญเท่านั้น", off: "ปิดการส่งของขวัญ" };
export const DEFAULT_LINE_GIFT: GiftSetting = { status: "on", categories: ["For Her", "For Him", "Couples"] };

const OPTION_OF: Record<GiftStatus, string> = { on: "ALLOW_GIFT", gift_only: "GIFT_ONLY", off: "NO_GIFT" };
export const giftOptionOf = (s: GiftStatus): string => OPTION_OF[s];
export const giftStatusOfOption = (o: unknown): GiftStatus => (o === "ALLOW_GIFT" ? "on" : o === "GIFT_ONLY" ? "gift_only" : "off");

const isStatus = (v: unknown): v is GiftStatus => v === "on" || v === "gift_only" || v === "off";
const cleanCats = (v: unknown): string[] => {
  const names = new Set(LINE_GIFT_GROUPS.map((g) => g.name));
  return Array.isArray(v) ? [...new Set((v as unknown[]).map((x) => String(x ?? "").trim()).filter((x) => names.has(x)))].slice(0, LINE_GIFT_MAX_GROUPS) : [];
};

/** จากร่าง (extra) — ยังไม่เคยตั้ง = ค่าเริ่มของร้าน */
export function giftFromExtra(extra: Record<string, unknown> | null | undefined): GiftSetting & { isDefault: boolean } {
  const e = extra ?? {};
  const hasStatus = isStatus(e.gift_status);
  const hasCats = Array.isArray(e.gift_categories);
  return {
    status: hasStatus ? e.gift_status as GiftStatus : DEFAULT_LINE_GIFT.status,
    categories: hasCats ? cleanCats(e.gift_categories) : DEFAULT_LINE_GIFT.categories.slice(),
    isDefault: !hasStatus && !hasCats,
  };
}

/** จากข้อมูลบน LINE (raw.line) */
export function giftFromLine(row: Record<string, unknown> | null | undefined): GiftSetting {
  const groups = Array.isArray(row?.giftGroups) ? row!.giftGroups as { id?: unknown; nameEn?: unknown }[] : [];
  const byId = new Map(LINE_GIFT_GROUPS.map((g) => [g.id, g.name]));
  return {
    status: giftStatusOfOption(row?.giftOption),
    categories: groups.map((g) => byId.get(Number(g.id)) ?? String(g.nameEn ?? "")).filter(Boolean),
  };
}

/** ชื่อหมวด → id ของ LINE */
export const giftGroupIds = (names: string[]): number[] => names.map((n) => LINE_GIFT_GROUPS.find((g) => g.name === n)?.id).filter((x): x is number => x != null);

/** ตรงกันไหม (สถานะ + หมวดชุดเดียวกัน · ปิด = ไม่สนหมวด) */
export function sameGift(a: GiftSetting, b: GiftSetting): boolean {
  if (a.status !== b.status) return false;
  if (a.status === "off") return true;
  return [...a.categories].sort().join("|") === [...b.categories].sort().join("|");
}
