/**
 * เปิดหน้าใหม่ให้เช็กหลังส่งขึ้นร้าน — ส่วนคิด (pure · เทสต์ได้) · ของกลาง
 *
 * เจ้าของสั่ง 2026-11-21: "กดส่งเสร็จให้เด้งหน้าใหม่เพื่อเช็ก เปิด-ปิดได้ที่ตั้งค่า เลือกได้ว่าจะเปิดหน้าสินค้า หรือหน้าลงสินค้าใน platform"
 *   เลือกแบบ A (เปิดแท็บรอไว้ตอนกดส่ง — ไม่โดนเบราว์เซอร์บล็อก) · ค่าหลัก = Seller Center · ค่าเริ่มต้น = ปิด (ใครใช้ไปเปิดเอง)
 *   ข้อ 1 ส่งหลายตัว → เปิดอย่างมาก 5 แท็บ ที่เหลือเป็นปุ่มในแจ้งผล · ข้อ 2 หน้าสินค้ายังไม่พร้อม → เปิด Seller Center แทน + บอกเหตุผล · ข้อ 3 ปุ่ม ⚙ ในขั้นยืนยัน
 * ตัวเปิดแท็บ + หน้าตั้งค่า (หน้าเว็บ) = components/push-open · ลิงก์ = lib/platform-links (listingLinks — ตัวเดียวกับปุ่มดูหน้าร้าน/Seller Center)
 * ใช้: ทุกปุ่มที่ส่งขึ้นร้าน (ตัวช่วยลงสินค้า · อัปเดตให้ตรง · เปลี่ยนรูปปก …) — คู่มือ docs/push-open.md
 */
import { listingLinks, type ListingLinks } from "@/lib/platform-links";

export type PushOpenPage = "store" | "seller" | "both";
/** ค่าแยกรายร้าน: "" = ใช้ค่าหลัก · off = ไม่เปิด */
export type PushOpenShopChoice = PushOpenPage | "off" | "";
export type PushOpenPrefs = { enabled: boolean; page: PushOpenPage; perShop: Record<string, PushOpenShopChoice> };

/** user_ui_prefs key (useUserPref — ตามไปทุกเครื่อง) */
export const PUSH_OPEN_PREF_KEY = "push_open_after_publish";
export const DEFAULT_PUSH_OPEN: PushOpenPrefs = { enabled: false, page: "seller", perShop: {} };
/** เปิดพร้อมกันได้อย่างมากกี่แท็บ (ข้อ 1) — ที่เหลือเป็นปุ่มในแจ้งผล */
export const PUSH_OPEN_MAX_TABS = 5;

export const PUSH_OPEN_PAGE_LABEL: Record<PushOpenPage, string> = {
  store: "หน้าสินค้าที่ลูกค้าเห็น",
  seller: "หน้าแก้สินค้าใน Seller Center",
  both: "ทั้งสองหน้า",
};
/** ร้านที่ตั้งแยกได้ (หน้าตั้งค่า) — code = erp_platforms.code */
export const PUSH_OPEN_SHOPS: { code: string; label: string; note?: string }[] = [
  { code: "shopee", label: "Shopee", note: "หน้าสินค้าที่ลูกค้าเห็น ต้องตั้ง Shop ID ที่บัญชีร้านก่อน" },
  { code: "lazada", label: "Lazada" },
  { code: "tiktok", label: "TikTok Shop", note: "ไม่มีลิงก์ตรงเข้าหน้าแก้สินค้า → หน้าแรกหลังร้าน + คัดลอกรหัส" },
  { code: "line_shopping", label: "LINE SHOPPING", note: "ไม่มีลิงก์ตรงเข้าหน้าแก้สินค้า → หน้าแรกหลังร้าน + คัดลอกรหัส" },
  { code: "website", label: "เว็บร้าน", note: "ไม่มี Seller Center → ผู้เรียกส่งหน้าแก้ใน ERP มาแทน" },
];

const PAGES: readonly PushOpenPage[] = ["store", "seller", "both"];
const CHOICES: readonly PushOpenShopChoice[] = ["store", "seller", "both", "off", ""];

/** ค่าที่จำไว้ → ตรวจรูป · ผิดรูป = null (ใช้ค่าเริ่มต้น) */
export function parsePushOpenPrefs(raw: unknown): PushOpenPrefs | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const perShop: Record<string, PushOpenShopChoice> = {};
  if (r.perShop && typeof r.perShop === "object" && !Array.isArray(r.perShop)) {
    for (const [k, v] of Object.entries(r.perShop as Record<string, unknown>)) if (CHOICES.includes(v as PushOpenShopChoice) && v) perShop[k] = v as PushOpenShopChoice;
  }
  return {
    enabled: r.enabled === true,
    page: PAGES.includes(r.page as PushOpenPage) ? (r.page as PushOpenPage) : DEFAULT_PUSH_OPEN.page,
    perShop,
  };
}

/** ร้านนี้เปิดหน้าไหน (ปิดฟีเจอร์ / ตั้งรายร้านว่าไม่เปิด = off) */
export function pushOpenPageFor(prefs: PushOpenPrefs, code: string): PushOpenPage | "off" {
  if (!prefs.enabled) return "off";
  const c = prefs.perShop[normCode(code)] || prefs.perShop[code];
  return c ? c : prefs.page;
}
const normCode = (code: string) => (code === "tiktok_shop" ? "tiktok" : code === "line" ? "line_shopping" : code);

/** สถานะหลังส่ง: live = ขึ้นขายแล้ว · hidden = ปิดขาย · draft = ร่างบนร้าน · review = ร้านยังตรวจอยู่ */
export type PushedState = "live" | "hidden" | "draft" | "review";
/** ของ 1 ชิ้นที่เพิ่งส่งขึ้นร้านสำเร็จ (ผู้เรียกสร้าง) · links = ลิงก์เฉพาะ (เช่น เว็บร้าน → หน้าแก้ใน ERP) ทับของ listingLinks */
export type PushedItem = {
  code: string; shopName: string; productId: string | null;
  /** ชื่อสั้นของสินค้า (โชว์ในแจ้งผล) */
  label?: string;
  state?: PushedState;
  /** platform_accounts.external_shop_id — ลิงก์หน้าสินค้า Shopee ต้องใช้ */
  shopRef?: string | null;
  links?: Partial<Pick<ListingLinks, "storefront" | "sellerCenter" | "sellerExact" | "sellerLabel">>;
};
export type PushOpenTarget = { url: string; title: string; note?: string; copyId?: string };

const NOT_READY: Record<Exclude<PushedState, "live">, string> = {
  hidden: "ปิดขายไว้ ลูกค้ายังไม่เห็นหน้าสินค้า",
  draft: "ยังเป็นร่างบนร้าน ลูกค้ายังไม่เห็น",
  review: "ร้านยังตรวจสินค้าอยู่",
};

/** หน้าที่จะเปิดของของ 1 ชิ้น ตามที่เลือก (หน้าสินค้ายังไม่พร้อม → Seller Center แทน + เหตุผล · ข้อ 2) */
export function pushOpenTargets(item: PushedItem, page: PushOpenPage): PushOpenTarget[] {
  const base = listingLinks(item.code, item.productId, item.shopRef ?? null);
  const lk = { ...base, ...Object.fromEntries(Object.entries(item.links ?? {}).filter(([, v]) => v != null)) } as ListingLinks;
  const who = item.label ? `${item.shopName} · ${item.label}` : item.shopName;
  const seller = (note?: string): PushOpenTarget | null => lk.sellerCenter ? {
    url: lk.sellerCenter, title: `${who} · ${lk.sellerLabel || "หลังร้าน"}`,
    ...(lk.sellerExact || !item.productId ? (note ? { note } : {}) : { copyId: item.productId, note: [note, `ค้นรหัส ${item.productId} ในหลังร้าน`].filter(Boolean).join(" · ") }),
  } : null;
  const out: PushOpenTarget[] = [];
  if (page === "store" || page === "both") {
    const reason = item.state && item.state !== "live" ? NOT_READY[item.state] : !lk.storefront ? (lk.storefrontHint || "ยังไม่มีลิงก์หน้าสินค้า") : null;
    if (!reason && lk.storefront) out.push({ url: lk.storefront, title: `${who} · หน้าสินค้า` });
    else if (page === "store") { const s = seller(`เปิด Seller Center แทน — ${reason}`); if (s) out.push(s); }
  }
  if (page === "seller" || page === "both") { const s = seller(); if (s) out.push(s); }
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.url) ? false : (seen.add(t.url), true)));
}

/** ของที่ส่งสำเร็จหลายชิ้น → หน้าทั้งหมดที่จะเปิด (เรียงตามที่ส่ง) */
export function planPushOpen(items: PushedItem[], prefs: PushOpenPrefs): PushOpenTarget[] {
  const out: PushOpenTarget[] = [];
  for (const it of items) {
    const page = pushOpenPageFor(prefs, it.code);
    if (page === "off") continue;
    out.push(...pushOpenTargets(it, page));
  }
  return out;
}

/** ตอนกดส่ง: เปิดแท็บรอไว้กี่แท็บ (expected = ร้าน×สินค้าที่จะส่ง) · ทั้งสองหน้า = 2 แท็บ · เพดาน 5 */
export function pushOpenTabBudget(expected: { code: string }[], prefs: PushOpenPrefs): number {
  let n = 0;
  for (const e of expected) { const p = pushOpenPageFor(prefs, e.code); n += p === "off" ? 0 : p === "both" ? 2 : 1; }
  return Math.min(PUSH_OPEN_MAX_TABS, n);
}
