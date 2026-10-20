/**
 * SKU การตลาด — โหลดทุกรุ่น + ป้ายหลัก + ป้ายเสริม + แบรนด์ (ของกลางฝั่งเซิร์ฟเวอร์)
 * ใช้ที่: /api/marketing/skus (หน้า 🎯 SKU การตลาด) · /api/website/listings/catalog (ป๊อปเพิ่มสินค้าเข้าเว็บ แท็บ SKU การตลาด)
 * ข้อมูล: view marketing_sku_overview (ทุก Parent SKU ที่เปิดใช้) + marketing_sku_labels + brands
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import type { MarketingBrand, MarketingSkuItem, MarketingSkuLabel, MarketingSkuListData } from "@/lib/marketing/sku-list";

type Admin = ReturnType<typeof supabaseAdmin>;

type OverviewRow = {
  parent_sku_id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null; brand_id: string | null;
  label_id: string | null; note: string | null; marketing_updated_at: string | null; sku_total: number | null; sku_active: number | null;
  badge_ids: string[] | null;
};

const PAGE = 1000;   // PostgREST คืนได้สูงสุด 1000 แถวต่อครั้ง → ไล่ดึงเป็นหน้า

export async function loadMarketingSkuList(admin: Admin): Promise<{ data: MarketingSkuListData } | { error: string }> {
  const [labelsRes, brandsRes] = await Promise.all([
    admin.from("marketing_sku_labels").select("id, kind, name, name_en, icon, color, description, sort_order, is_active").order("sort_order").order("name"),
    admin.from("brands").select("id, name, color").eq("is_active", true).order("name"),
  ]);
  if (labelsRes.error || brandsRes.error) return { error: "โหลดข้อมูลไม่สำเร็จ: " + (labelsRes.error || brandsRes.error)!.message };

  const rows: OverviewRow[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await admin.from("marketing_sku_overview")
      .select("parent_sku_id, code, name_th, cover_image_r2_key, brand_id, label_id, note, marketing_updated_at, sku_total, sku_active, badge_ids")
      .order("code").order("parent_sku_id").range(from, from + PAGE - 1);
    if (error) return { error: "โหลดรายการรุ่นไม่สำเร็จ: " + error.message };
    rows.push(...((data ?? []) as OverviewRow[]));
    if (!data || data.length < PAGE) break;
  }

  const items: MarketingSkuItem[] = rows.map((r) => ({
    parent_sku_id: r.parent_sku_id,
    code: r.code ?? "",
    name: r.name_th ?? r.code ?? "",
    image_key: r.cover_image_r2_key,
    brand_id: r.brand_id,
    label_id: r.label_id,
    note: r.note,
    sku_total: Number(r.sku_total) || 0,
    sku_active: Number(r.sku_active) || 0,
    updated_at: r.marketing_updated_at,
    badge_ids: r.badge_ids ?? [],
  }));
  const usage = new Map<string, number>();
  for (const it of items) {
    if (it.label_id) usage.set(it.label_id, (usage.get(it.label_id) ?? 0) + 1);
    for (const b of it.badge_ids) usage.set(b, (usage.get(b) ?? 0) + 1);
  }
  const all: MarketingSkuLabel[] = ((labelsRes.data ?? []) as MarketingSkuLabel[]).map((l) => ({ ...l, usage_count: usage.get(l.id) ?? 0 }));
  const labels = all.filter((l) => !l.kind || l.kind === "status");   // ป้ายหลักเท่านั้น (ไม่ปน badge/pillar)
  const badges = all.filter((l) => l.kind === "badge");
  return { data: { items, labels, badges, brands: (brandsRes.data ?? []) as MarketingBrand[] } };
}
