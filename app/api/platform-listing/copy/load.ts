/**
 * ตัวโหลดของ "ลงร้านอื่นจากรายการนี้" (ไม่ใช่ route · import ได้) — รายการต้นทาง + สินค้าในระบบ + ร่างของร้านปลายทาง
 * แปลงร้านต้นทาง = lib/listing-copy-source · กฎจับคู่ = lib/listing-copy-map
 * Lazada: ดึงสดด้วยของใช้ร่วม ../../lazada/shared (loadLazListingLive — ตัวเดียวกับลิ้นชักสินค้า) · ดึงไม่ได้ = ใช้สำเนาย่อในระบบ + เตือน
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadListingContexts } from "@/lib/product-listing-context";
import { lazadaListingView } from "@/lib/lazada-listing-edit";
import { LISTING_GONE_STATUS } from "@/lib/platform-listing-health";
import { sourceFromLazadaSlim, sourceFromLazadaView, sourceFromLineRaw, sourceFromShopeeRaw, type CopySource, type CopySourceMeta } from "@/lib/listing-copy-source";
import type { CopyDraft, CopySystem, CopyTarget } from "@/lib/listing-copy-map";
import { loadLazListingLive } from "../../lazada/shared";

export type CopyContext = {
  source: CopySource;
  system: CopySystem;
  draft: CopyDraft;
  parentId: string;
  parentCode: string;
  targetPlatformId: string;
  /** แถวร่างเดิม (ไว้เทียบประวัติ) */
  draftRow: Record<string, unknown> | null;
};
export type CopyLoad = { ok: true; ctx: CopyContext } | { ok: false; status: number; error: string };

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

export async function loadCopyContext(admin: SupabaseClient, listingId: string, target: CopyTarget, userId: string | null): Promise<CopyLoad> {
  const { data: l } = await admin.from("platform_catalog_listings")
    .select("id, platform_id, brand_id, external_product_id, title, status, raw, matched_parent_sku_id").eq("id", listingId).maybeSingle();
  const row = l as Row | null;
  if (!row) return { ok: false, status: 404, error: "ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)" };
  if (str(row.status) === LISTING_GONE_STATUS) return { ok: false, status: 400, error: "รายการนี้ไม่อยู่บนร้านแล้ว — ใช้เป็นต้นแบบไม่ได้" };
  const parentId = str(row.matched_parent_sku_id);
  if (!parentId) return { ok: false, status: 400, error: "รายการนี้ยังไม่จับคู่กับสินค้าในระบบ — จับคู่ก่อนถึงจะลงร้านอื่นได้" };

  const [{ data: srcPf }, { data: tgtPf }] = await Promise.all([
    admin.from("erp_platforms").select("id, code, name_th").eq("id", str(row.platform_id)).maybeSingle(),
    admin.from("erp_platforms").select("id, code").eq("code", target).maybeSingle(),
  ]);
  const sp = srcPf as Row | null; const tp = tgtPf as Row | null;
  if (!sp) return { ok: false, status: 400, error: "ไม่รู้ว่ารายการนี้อยู่ร้านไหน" };
  if (!tp) return { ok: false, status: 400, error: "ยังไม่มีร้านปลายทางนี้ในระบบ" };
  if (str(sp.code) === target) return { ok: false, status: 400, error: "ร้านต้นทางกับปลายทางเป็นร้านเดียวกัน" };

  // ---------- ร้านต้นทาง ----------
  const meta: CopySourceMeta = { listingId, platformCode: str(sp.code), platformName: str(sp.name_th) || str(sp.code), externalId: str(row.external_product_id) || null, title: str(row.title) || null };
  let source: CopySource;
  if (meta.platformCode === "lazada") {
    let live = await loadLazListingLive(admin, listingId, userId);
    // Lazada จำกัดความถี่ ("Api access frequency exceeds the limit (ban 1s)") — รอแล้วลองอีกครั้งเดียว
    if (!live.ok && /frequency|ban\s*\d/i.test(live.error)) { await new Promise((r) => setTimeout(r, 1200)); live = await loadLazListingLive(admin, listingId, userId); }
    const view = live.ok ? lazadaListingView(live.item) : null;
    source = view ? sourceFromLazadaView(view, meta)
      : sourceFromLazadaSlim(row.raw, meta, `ดึงข้อมูลสดจาก Lazada ไม่ได้ (${live.ok ? "ข้อมูลไม่ครบ" : live.error}) — ใช้สำเนาในระบบ มีแค่ชื่อกับราคา`);
  } else if (meta.platformCode === "line_shopping") {
    source = sourceFromLineRaw(row.raw, meta);
  } else if (meta.platformCode === "shopee") {
    source = sourceFromShopeeRaw(row.raw, meta);
  } else {
    return { ok: false, status: 400, error: `ยังใช้รายการจาก ${meta.platformName} เป็นต้นแบบไม่ได้` };
  }

  // ---------- สินค้าในระบบ + ร่างของร้านปลายทาง ----------
  const targetPlatformId = str(tp.id);
  const [items, { data: skus }] = await Promise.all([
    loadListingContexts(admin, [parentId], targetPlatformId),
    admin.from("skus_v2").select("id, code, fake_price, list_price, is_active").eq("parent_sku_id", parentId).order("code"),
  ]);
  const it = items[0];
  if (!it) return { ok: false, status: 400, error: "ไม่พบสินค้าที่จับคู่ไว้ในระบบ" };
  const p = it.parent;
  const namePf = str(p.name_platform), nameTh = str(p.name_th);
  const system: CopySystem = {
    name: namePf || nameTh, altNames: [nameTh, namePf].filter(Boolean),
    description: str(p.description), altDescriptions: [],
    brand: str(p.brand_name), weightKg: Number(p.weight_kg) > 0 ? Number(p.weight_kg) : 0,
    imageCount: it.images.length, categoryLabel: it.platformCategory || null,
    skus: ((skus ?? []) as Row[]).map((s) => ({
      id: str(s.id), code: str(s.code),
      fake: s.fake_price == null ? null : Number(s.fake_price), sale: s.list_price == null ? null : Number(s.list_price),
      active: s.is_active !== false,
    })),
  };
  const d = it.draft as Row | null;
  const draft: CopyDraft = {
    title: d?.title == null ? null : String(d.title), description: d?.description == null ? null : String(d.description),
    categoryPath: d?.category_path == null ? null : String(d.category_path),
    extra: (d?.extra && typeof d.extra === "object" ? d.extra : {}) as Record<string, unknown>,
  };
  return { ok: true, ctx: { source, system, draft, parentId, parentCode: str(p.code), targetPlatformId, draftRow: d } };
}
