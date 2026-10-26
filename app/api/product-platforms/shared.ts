/**
 * ของใช้ร่วมของ /api/product-platforms/* (ไม่ใช่ route · import ได้)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import type { BulkListingItem } from "@/lib/product-listing-context";
import { prepareDraft, listingCtx, normalizePriceRule, platformPrice, sellableVariants, type PriceRule } from "@/lib/platform-listing-builder";
import { requiredChecks } from "@/lib/platform-required-fields";

type Admin = ReturnType<typeof supabaseAdmin>;

export type PlatformRow = { id: string; code: string; name_th: string; capabilities: Record<string, unknown> };

export async function loadPlatformByCode(admin: Admin, code: unknown): Promise<PlatformRow | null> {
  const c = String(code ?? "").trim();
  if (!c) return null;
  const { data } = await admin.from("erp_platforms").select("id, code, name_th, capabilities").eq("code", c).eq("is_active", true).maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return { id: String(r.id), code: String(r.code), name_th: String(r.name_th ?? r.code), capabilities: (r.capabilities as Record<string, unknown>) ?? {} };
}

/** ร้านนี้มีตัวเชื่อม "ลงสินค้าจริง" แล้วหรือยัง (erp_platforms.capabilities.api) */
export const hasRealConnector = (p: { capabilities?: Record<string, unknown> | null }) => p.capabilities?.api === true;

export type ReadinessRow = {
  id: string; code: string; name: string;
  central_category: string; platform_category: string;
  variant_count: number; image_count: number;
  price_erp: string; price_platform: string;
  status: "listed" | "ready" | "missing" | "new"; status_label: string;
  ready_now: boolean; ready_label: string; missing: string; warnings: string;
  prepared_at: string | null;
};

const range = (nums: number[]) => {
  if (!nums.length) return "—";
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return lo === hi ? `${lo.toLocaleString("th-TH")}` : `${lo.toLocaleString("th-TH")}–${hi.toLocaleString("th-TH")}`;
};

/**
 * สถานะของสินค้า 1 ตัว ต่อร้าน 1 ร้าน
 * - มีรหัสบนร้านแล้ว = ลงแล้ว
 * - มีร่าง = ตรวจจากค่าที่อยู่ในร่างจริง (ไม่เติมให้) → พร้อมลง / เตรียมแล้ว · ขาดข้อมูล
 * - ยังไม่มีร่าง = ยังไม่เตรียม + พรีวิวว่า "ถ้าเตรียมตอนนี้" พร้อมไหม
 */
export function readinessOf(platformCode: string, item: BulkListingItem, defaultRule: PriceRule): ReadinessRow {
  const d = item.draft as Record<string, unknown> | null;
  const extra = (d?.extra && typeof d.extra === "object") ? d.extra as Record<string, unknown> : {};
  const rule = extra.price_rule ? normalizePriceRule(extra.price_rule) : defaultRule;
  const vs = sellableVariants(item.variants);
  const erpPrices = vs.map((v) => ((v.sale_price ?? 0) > 0 ? v.sale_price : v.fake_price)).filter((n): n is number => n != null && n > 0);

  let checks;
  if (d) {
    checks = requiredChecks(platformCode, listingCtx({
      platformCode, title: String(d.title ?? ""), description: String(d.description ?? ""), category: String(d.category_path ?? ""),
      imageCount: Array.isArray(d.image_keys) ? d.image_keys.length : 0, variants: item.variants, parent: item.parent,
      brand: (extra.brand as string) ?? item.parent.brand_name,
    }));
  } else {
    checks = prepareDraft({ platformCode, parent: item.parent, variants: item.variants, imageKeys: item.images.map((i) => i.key), platformCategory: item.platformCategory, rule }).checks;
  }
  const blockers = checks.filter((c) => c.required && !c.ok);
  const warns = checks.filter((c) => !c.required && !c.ok);
  const ready = blockers.length === 0;
  const listed = !!d?.platform_product_id;
  const status: ReadinessRow["status"] = listed ? "listed" : d ? (ready ? "ready" : "missing") : "new";
  const STATUS_LABEL = { listed: "ลงแล้ว", ready: "พร้อมลง", missing: "เตรียมแล้ว · ขาดข้อมูล", new: "ยังไม่เตรียม" };
  const prepared = (extra.prepared && typeof extra.prepared === "object") ? (extra.prepared as Record<string, unknown>).at : null;

  return {
    id: String(item.parent.id), code: String(item.parent.code ?? ""),
    name: String(item.parent.name_platform || item.parent.name_th || ""),
    central_category: item.parent.central_category_name ?? "",
    platform_category: String(d?.category_path || item.platformCategory || ""),
    variant_count: vs.length, image_count: d && Array.isArray(d.image_keys) ? d.image_keys.length : item.images.length,
    price_erp: range(erpPrices), price_platform: range(erpPrices.map((n) => platformPrice(n, rule))),
    status, status_label: STATUS_LABEL[status],
    ready_now: ready, ready_label: ready ? "พร้อม" : `ขาด ${blockers.length} ข้อ`,
    missing: blockers.map((c) => c.note ? `${c.label} (${c.note})` : c.label).join(" · "),
    warnings: warns.map((c) => c.note ? `${c.label} (${c.note})` : c.label).join(" · "),
    prepared_at: typeof prepared === "string" ? prepared : null,
  };
}
