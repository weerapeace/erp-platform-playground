/**
 * เดาคู่ "สินค้าบนร้าน" ↔ "สินค้าในระบบ" ฝั่ง server (อ่าน DB แล้วส่งให้ lib/platform-match-suggest) — ของกลาง
 * ใช้: /api/platform-catalog/suggest (หน้าสินค้าบนแพลตฟอร์ม) · /api/platform-match (หน้าจับคู่สินค้าเร็ว)
 * → ทุกหน้าเดาด้วยกติกาเดียวกัน · แค่เสนอ ไม่บันทึก (บันทึกที่ /api/platform-catalog/match)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import {
  isHighConfidence, prepareCandidates, skuCodeForms, suggestMatches,
  type ExtraHit, type MatchCandidate, type MatchSuggestion,
} from "@/lib/platform-match-suggest";

type Admin = ReturnType<typeof supabaseAdmin>;

// เทียบชื่อทุกคู่แพงขึ้นตามจำนวน (ร้าน × สินค้าในระบบ) — เกินนี้เดาจากรหัสอย่างเดียว กันหน้าค้าง
const NAME_COMPARE_BUDGET = 2_000_000;

export type SuggestListing = { id: string; external_product_id: string | null; title: string | null; sku_code: string | null; price: number | null; brand_id: string | null };
type ParentRow = { id: string; code: string | null; name_th: string | null; name_platform: string | null; brand_id: string | null };

export type SuggestResult = {
  listings: SuggestListing[];
  suggestions: Record<string, MatchSuggestion[]>;
  high: string[];          // listing_id ที่รหัสตรงกันและไม่กำกวม
};

/**
 * listingId = เดาเฉพาะตัวนั้น (แม้จับคู่แล้ว) · ไม่ส่ง = เดาทุกตัวที่ "ยังไม่จับคู่" ของร้าน (+แบรนด์)
 */
export async function computeMatchSuggestions(
  admin: Admin,
  args: { platformId?: string; brandId?: string; listingId?: string },
): Promise<SuggestResult> {
  const listings = await fetchAllPages<SuggestListing>((from, to) => {
    let q = admin.from("platform_catalog_listings").select("id, external_product_id, title, sku_code, price, brand_id");
    if (args.listingId) q = q.eq("id", args.listingId);
    else {
      q = q.eq("platform_id", args.platformId ?? "").is("matched_parent_sku_id", null);
      if (args.brandId) q = q.eq("brand_id", args.brandId);
    }
    return q.order("id", { ascending: true }).range(from, to);
  });
  if (listings.length === 0) return { listings, suggestions: {}, high: [] };

  // สินค้าในระบบที่จะเทียบ = แบรนด์เดียวกับสินค้าบนร้าน (ร้านไม่ระบุแบรนด์ → เทียบทุกแบรนด์)
  const brandIds = [...new Set(listings.map((l) => l.brand_id).filter(Boolean) as string[])];
  const allBrands = listings.some((l) => !l.brand_id);
  const parents = await fetchAllPages<ParentRow>((from, to) => {
    let q = admin.from("parent_skus_v2").select("id, code, name_th, name_platform, brand_id").eq("is_active", true);
    if (!allBrands) q = q.in("brand_id", brandIds);
    return q.order("id", { ascending: true }).range(from, to);
  });
  const { data: brands } = brandIds.length
    ? await admin.from("brands").select("id, name").in("id", brandIds)
    : { data: [] as { id: string; name: string | null }[] };
  const brandNames = ((brands ?? []) as { name: string | null }[]).map((b) => String(b.name ?? "")).filter(Boolean);

  // SKU บนร้านที่เป็น "รหัส SKU ลูก" ในระบบ → ชี้ไปตัวแม่ (เช่น ร้านใส่ MGN194-02 ซึ่งเป็นตัวเลือกของ MGN194)
  const formsOf = new Map(listings.map((l) => [l.id, skuCodeForms(l.sku_code)]));
  const allForms = [...new Set([...formsOf.values()].flat())];
  const variantParent = new Map<string, string>();   // code SKU ลูก → parent_sku_id
  for (let i = 0; i < allForms.length; i += 200) {
    const { data } = await admin.from("skus_v2").select("code, parent_sku_id").in("code", allForms.slice(i, i + 200));
    for (const s of (data ?? []) as { code: string; parent_sku_id: string | null }[]) if (s.parent_sku_id) variantParent.set(s.code, s.parent_sku_id);
  }

  const toCandidate = (p: ParentRow): MatchCandidate => ({ id: p.id, code: String(p.code ?? ""), name: p.name_th, alt_name: p.name_platform });
  const prepared = new Map<string, ReturnType<typeof prepareCandidates>>();   // brand_id ("" = ทุกแบรนด์) → รายการที่เตรียมแล้ว
  const candidatesFor = (bid: string | null) => {
    const key = bid ?? "";
    if (!prepared.has(key)) prepared.set(key, prepareCandidates(parents.filter((p) => !bid || p.brand_id === bid).map(toCandidate), { stripWords: brandNames }));
    return prepared.get(key)!;
  };
  const useNames = listings.length * Math.max(1, parents.length) <= NAME_COMPARE_BUDGET;

  const suggestions: Record<string, MatchSuggestion[]> = {};
  const high: string[] = [];
  for (const l of listings) {
    const forms = formsOf.get(l.id) ?? [];
    const extraHits: ExtraHit[] = forms.flatMap((f, i) => {
      const pid = variantParent.get(f);
      return pid ? [{ parent_sku_id: pid, score: i === 0 ? 95 : 85, reason: i === 0 ? "รหัส SKU ลูกตรงกัน" : "รหัส SKU ลูกใกล้เคียง" }] : [];
    });
    const s = suggestMatches(l, candidatesFor(l.brand_id), { stripWords: brandNames, useNames, extraHits });
    if (s.length === 0) continue;
    suggestions[l.id] = s;
    if (isHighConfidence(s)) high.push(l.id);
  }
  return { listings, suggestions, high };
}
