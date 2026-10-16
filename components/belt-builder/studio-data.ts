"use client";

/**
 * สตูดิโอออกแบบเข็มขัด — ชนิดข้อมูล + ตัวช่วยเรียก API (ฝั่ง client) ที่ทุกชิ้นของสตูดิโอใช้ร่วม
 * API จริง: app/api/belt-builder/* (guardApi + writeAudit อยู่ฝั่ง server) · ที่นี่แค่ห่อ apiFetch ให้ข้อความผิดพลาดเป็นภาษาคน
 */
import { apiFetch } from "@/lib/api";
import type { Anchor, PartType } from "@/lib/belt-builder";

export type BeltPart = {
  id: string;
  shop_id: string;
  part_type: PartType;
  code: string | null;
  name_th: string;
  name_en: string | null;
  image_key: string | null;
  image_url: string | null;
  anchor: Anchor | null;
  attrs: Record<string, unknown>;
  price_delta: number;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BeltShop = { id: string; slug: string; name: string; site_url: string | null };

/** ค่ากลุ่ม 🧵 ในข้อมูลร้าน (store_settings ผ่าน /api/website/settings) */
export type BeltShopInfo = {
  belt_enabled: boolean;
  belt_base_price: number;
  belt_engraving_fee: number;
  belt_engraving_max: number;
  belt_lead_time: string;
};

export type SizeRule = {
  id: string; shop_id: string; gender: "men" | "women"; label: string | null;
  waist_min_in: number; waist_max_in: number; strap_formula: { mult: number; add_cm: number } | null;
  hole_count: number; hole_spacing_cm: number; note: string | null; sort_order: number; is_active: boolean;
};

export type BeltDesign = {
  id: string; shop_id: string; member_id: string | null; selections: Record<string, unknown>;
  total_price: number; preview_url: string | null; status: "saved" | "in_cart" | "ordered"; order_ref: string | null; created_at: string;
};

export const DESIGN_STATUS_TH: Record<string, string> = { saved: "บันทึกไว้", in_cart: "อยู่ในตะกร้า", ordered: "สั่งแล้ว" };

/** สีจุด/กล่องแทนรูปของชิ้น (attrs.color_hex หรือ metal_hex) */
export const partColor = (p: Pick<BeltPart, "attrs">): string | null => {
  const a = (p.attrs && typeof p.attrs === "object" ? p.attrs : {}) as Record<string, unknown>;
  const c = (a.color_hex as string) || (a.metal_hex as string) || "";
  return /^#[0-9a-f]{3,8}$/i.test(c) ? c : null;
};
export const partWidth = (p: Pick<BeltPart, "attrs">): number | null => {
  const a = (p.attrs && typeof p.attrs === "object" ? p.attrs : {}) as Record<string, unknown>;
  const n = Number(a.width_mm);
  return Number.isFinite(n) && n > 0 ? n : null;
};
export const hasImage = (p: Pick<BeltPart, "image_key" | "image_url">) => !!(p.image_key || p.image_url);

export const money = (v: unknown) => `฿${(Number(v) || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || j.error) {
    const msg = typeof j.error === "string" && j.error ? j.error : res.status === 401 ? "ต้องเข้าสู่ระบบและมีสิทธิ์ออกแบบเข็มขัด" : res.status === 403 ? "คุณไม่มีสิทธิ์ทำรายการนี้" : `ทำรายการไม่สำเร็จ (${res.status})`;
    throw new Error(msg);
  }
  return j;
}

export async function fetchShops(): Promise<BeltShop[]> {
  const j = await readJson(await apiFetch("/api/belt-builder/shops"));
  return (j.data ?? []) as BeltShop[];
}

/** ชิ้นส่วนทั้งหมดของร้าน (รวมที่ปิดอยู่ · ไม่รวมที่ลบแล้ว) เรียง part_type → sort_order */
export async function fetchParts(shopId: string): Promise<BeltPart[]> {
  const j = await readJson(await apiFetch(`/api/belt-builder/parts?shop_id=${encodeURIComponent(shopId)}&include_inactive=true&limit=1000`));
  return ((j.data ?? []) as BeltPart[]).filter((p) => !p.deleted_at).map(normalizePart);
}
function normalizePart(p: BeltPart): BeltPart {
  return { ...p, price_delta: Number(p.price_delta) || 0, sort_order: Number(p.sort_order) || 0, attrs: (p.attrs && typeof p.attrs === "object" ? p.attrs : {}) as Record<string, unknown> };
}

export async function patchPart(id: string, patch: Partial<BeltPart>): Promise<BeltPart> {
  const j = await readJson(await apiFetch(`/api/belt-builder/parts/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }));
  return normalizePart(j.data as BeltPart);
}
export async function createPart(body: Partial<BeltPart>): Promise<BeltPart> {
  const j = await readJson(await apiFetch("/api/belt-builder/parts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return normalizePart(j.data as BeltPart);
}
/** ลบแบบกู้คืนได้ (is_active=false + deleted_at) — หายจากสตูดิโอ แต่กู้คืนได้จากแท็บ "ตาราง" (ติ๊กโชว์ที่ปิดอยู่) */
export async function softDeletePart(id: string): Promise<void> {
  await readJson(await apiFetch(`/api/belt-builder/parts/${encodeURIComponent(id)}`, { method: "DELETE" }));
}
export async function reorderParts(shopId: string, ids: string[]): Promise<void> {
  await readJson(await apiFetch("/api/belt-builder/parts/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop_id: shopId, ids }) }));
}

export async function fetchSizeRules(shopId: string): Promise<SizeRule[]> {
  const j = await readJson(await apiFetch(`/api/belt-builder/size-rules?shop_id=${encodeURIComponent(shopId)}&include_inactive=true&limit=200`));
  return (j.data ?? []) as SizeRule[];
}
export async function patchSizeRule(id: string, patch: Partial<SizeRule>): Promise<SizeRule> {
  const j = await readJson(await apiFetch(`/api/belt-builder/size-rules/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }));
  return j.data as SizeRule;
}
export async function createSizeRule(body: Partial<SizeRule>): Promise<SizeRule> {
  const j = await readJson(await apiFetch("/api/belt-builder/size-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return j.data as SizeRule;
}
export async function deleteSizeRule(id: string): Promise<void> {
  await readJson(await apiFetch(`/api/belt-builder/size-rules/${encodeURIComponent(id)}?hard=1`, { method: "DELETE" }));
}

export async function fetchDesigns(shopId: string): Promise<{ rows: BeltDesign[]; total: number }> {
  const j = await readJson(await apiFetch(`/api/belt-builder/designs?shop_id=${encodeURIComponent(shopId)}&limit=500`));
  return { rows: (j.data ?? []) as BeltDesign[], total: Number(j.total) || 0 };
}

/** ค่ากลุ่ม 🧵 ของร้าน (อ่านจากข้อมูลร้านกลาง) */
export async function fetchShopInfo(shopSlug: string): Promise<BeltShopInfo> {
  const j = await readJson(await apiFetch(`/api/website/settings?shop=${encodeURIComponent(shopSlug)}`));
  const info = (j.info ?? {}) as Record<string, unknown>;
  return {
    belt_enabled: !!info.belt_enabled,
    belt_base_price: Number(info.belt_base_price) || 0,
    belt_engraving_fee: Number(info.belt_engraving_fee) || 0,
    belt_engraving_max: Number(info.belt_engraving_max) || 0,
    belt_lead_time: String(info.belt_lead_time ?? ""),
  };
}
/** แก้เฉพาะช่องกลุ่ม 🧵 (ช่องอื่นของร้านคงเดิม) — API เขียน audit ให้ */
export async function patchShopInfo(shopId: string, patch: Partial<BeltShopInfo>): Promise<void> {
  await readJson(await apiFetch("/api/website/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, patch }) }));
}

/** ส่งเฉพาะฟิลด์ที่เปลี่ยน (เทียบแบบ JSON) */
export function diffPatch<T extends Record<string, unknown>>(before: T, after: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) out[k] = after[k];
  return out;
}
