"use client";

/**
 * ผู้ช่วยเสียง × Platform (ชั้น 3) — อ่านสถานะ "สินค้านี้ลงร้านไหนแล้ว" ด้วย API + กฎเดียวกับแท็บแพลตฟอร์มของ Parent SKU
 *   GET /api/product-platforms?parent_sku_id= (สิทธิ์ products.platforms.view) → shopStatusOf (lib/platform-visibility)
 * ไม่ส่งอะไรขึ้นร้าน — แค่เตรียมค่าให้ตัวช่วยลงสินค้าของเดิม (AddToPlatformWizard) คนกดลงเอง
 */
import { apiFetch } from "@/lib/api";
import { hasCreatePreview } from "@/lib/platform-create-registry";
import { shopStatusOf, type ShopStatus, type ShopStatusInput } from "@/lib/platform-visibility";

export type VoiceShopInfo = ShopStatus & {
  parent: { id: string; code: string; name: string | null; brandId: string | null };
  /** ร้านที่ยังไม่ลง และระบบลงให้ได้ (มีตัวสร้างสินค้า) */
  addable: { code: string; name: string }[];
};

export async function loadShopInfo(parentId: string, fallback: { code: string; name: string | null }): Promise<VoiceShopInfo> {
  const r = await apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(parentId)}`);
  const j = (await r.json().catch(() => ({}))) as Partial<ShopStatusInput> & { parent?: { code?: string; name_th?: string; name_platform?: string; brand_id?: string | null }; error?: string };
  if (!r.ok || j.error) throw new Error(j.error || "โหลดสถานะร้านไม่สำเร็จ");
  const st = shopStatusOf({
    platforms: j.platforms ?? [], drafts: j.drafts ?? {}, accounts: j.accounts ?? {},
    matchedListings: j.matchedListings ?? {}, hiddenPlatformCodes: j.hiddenPlatformCodes ?? [],
  });
  return {
    ...st,
    parent: { id: parentId, code: j.parent?.code || fallback.code, name: j.parent?.name_th || j.parent?.name_platform || fallback.name, brandId: j.parent?.brand_id ?? null },
    addable: st.notListed.filter((p) => hasCreatePreview(p.code)),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[\s._\-]/g, "");
/** ชื่อร้านที่พูด → ร้านในรายการ (ชื่อหรือรหัสมีคำนี้) · ไม่เจอ = null */
export function matchShop<T extends { code: string; name: string }>(target: string, list: T[]): T | null {
  const t = norm(target);
  if (!t) return null;
  return list.find((p) => norm(p.code) === t || norm(p.name) === t)
    ?? list.find((p) => norm(p.name).includes(t) || t.includes(norm(p.name)) || norm(p.code).includes(t) || t.includes(norm(p.code)))
    ?? null;
}
