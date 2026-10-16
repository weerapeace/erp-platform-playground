/**
 * 🏷 ป้ายบนการ์ดสินค้าของร้าน (เช่น ขายดี · ใหม่ · ลดราคา · Limited) — ของกลาง (pure ใช้ได้ทั้ง client/server)
 *
 * ร้านตั้งรายการป้ายที่เดียว (ชื่อ + สี · ลากเรียง) แล้วเลือกจากรายการ:
 *   - หน้าต่างตั้งค่าสินค้าบนเว็บ (components/parent-web-listings → CardBadgeSelect)
 *   - แก้หลายรายการ (components/website-listings-mass-edit)
 * เก็บที่ store_settings key "card_badges" (JSON) · สินค้าเก็บแค่ "ชื่อป้าย" ใน store_listings.web_badge เหมือนเดิม
 * เปลี่ยนชื่อป้ายในรายการ = สินค้าที่ใช้ชื่อเดิมเปลี่ยนตามให้ (lib/website-card-badges-db)
 * เว็บร้าน: products API ส่ง badgeColor ตามสีของป้ายในรายการ (ไม่อยู่ในรายการ = สีป้ายปกติของธีม)
 */
export interface CardBadge {
  id: string;
  name: string;
  /** #RRGGBB */
  color: string;
}

export const CARD_BADGES_KEY = "card_badges";
const HEX = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_CARD_BADGES: CardBadge[] = [
  { id: "best", name: "ขายดี", color: "#DC2626" },
  { id: "new", name: "ใหม่", color: "#2563EB" },
  { id: "sale", name: "ลดราคา", color: "#EA580C" },
  { id: "limited", name: "Limited", color: "#7C3AED" },
];

export function normalizeCardBadges(raw: unknown): CardBadge[] {
  let r = raw;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      r = null;
    }
  }
  if (!Array.isArray(r)) return DEFAULT_CARD_BADGES.map((b) => ({ ...b }));
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  const out: CardBadge[] = [];
  for (const [i, x] of r.slice(0, 30).entries()) {
    const o = (x ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name || seenName.has(name.toLowerCase())) continue;
    let id = String(o.id ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || `b${i + 1}`;
    while (seenId.has(id)) id = `${id}-${i}`;
    seenId.add(id);
    seenName.add(name.toLowerCase());
    out.push({ id, name, color: typeof o.color === "string" && HEX.test(o.color) ? o.color.toUpperCase() : "#64748B" });
  }
  return out;
}

/** ชื่อป้ายที่เปลี่ยน (id เดิม ชื่อใหม่) — ใช้เปลี่ยนชื่อป้ายในสินค้าที่ใช้อยู่ตาม */
export function badgeRenames(before: CardBadge[], after: CardBadge[]): { from: string; to: string }[] {
  const old = new Map(before.map((b) => [b.id, b.name]));
  return after.filter((b) => old.has(b.id) && old.get(b.id) !== b.name).map((b) => ({ from: old.get(b.id)!, to: b.name }));
}

/** สีของป้ายตามชื่อ (ไม่อยู่ในรายการ = null → สีป้ายปกติของธีม) */
export function badgeColorOf(list: CardBadge[], name: string | null | undefined): string | null {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return null;
  return list.find((b) => b.name.toLowerCase() === n)?.color ?? null;
}
