/**
 * ดึงสินค้า LINE SHOPPING "ทั้งร้าน" (ไม่ใช่ route · import ได้) — ตัวดึงตัวเดียวของ LINE
 *   ใช้ 2 ที่: ปุ่ม "ดึงสินค้าจากร้าน" (/api/line-shopping/sync-products) + ตัวดึงทุกชั่วโมง (app/api/platform-catalog/refresh-changed)
 * LINE ไม่มีตัวกรอง "เฉพาะตัวที่เปลี่ยน" ใน GET /products → ดึงครบทุกหน้า (ร้าน ~930 ตัว = ~10 ครั้ง/รอบ · ไม่ชนโควตา)
 *   ยึด "ยอดที่ LINE รายงาน" (totalRow) เป็นหลัก — วนต่อจนครบตามยอด หรือหน้าว่าง
 *   ครบตามยอด (นับเลขสินค้าไม่ซ้ำ) → ตัวเดิมที่ไม่เจอ = ติดป้าย "ไม่อยู่บนร้านแล้ว" (markMissing)
 *   บันทึก + จับคู่รหัสตรงด้วยของกลาง lib/platform-catalog-sync (ทีละชุด · ไม่ทับคู่เดิม · ไม่จับคู่ตัวที่กดข้าม)
 * ⚠️ อ่านจากร้านอย่างเดียว ไม่แก้อะไรบนร้าน LINE
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { lineListProducts } from "@/lib/line-shopping";
import { upsertCatalogListings, type CatalogSyncItem, type CatalogSyncResult } from "@/lib/platform-catalog-sync";

const MAX_PAGES = 200;   // กันวนไม่จบ
const PER_PAGE = 100;
const asStr = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const asNum = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isNaN(n) ? null : n; };

export type LineProductsSyncResult =
  | ({ ok: true; api_total: number; fetched: number; complete: boolean } & Partial<CatalogSyncResult>)
  | { ok: false; error: string };

export async function syncLineProductsFull(admin: SupabaseClient, args: { platformId: string; brandId: string; apiKey: string }): Promise<LineProductsSyncResult> {
  const { platformId, brandId, apiKey } = args;
  const products: Record<string, unknown>[] = [];
  let page = 1, apiTotal = 0;
  while (page <= MAX_PAGES) {
    const res = await lineListProducts(apiKey, { page, perPage: PER_PAGE });
    if (!res.ok) return { ok: false, error: `ดึงสินค้าไม่สำเร็จ: ${res.error}` };
    const got = res.rows ?? [];
    if (page === 1) apiTotal = res.totalRow ?? 0;
    products.push(...got);
    if (got.length === 0) break;                                 // หน้าว่าง = จบ
    if (apiTotal > 0 && products.length >= apiTotal) break;      // ครบตามที่ LINE รายงาน
    if (apiTotal === 0 && got.length < PER_PAGE) break;          // ไม่รู้ยอดรวม + หน้าไม่เต็ม = จบ
    page++;
  }
  if (products.length === 0) return { ok: true, api_total: apiTotal, fetched: 0, complete: apiTotal === 0 };

  const items: CatalogSyncItem[] = [];
  for (const p of products) {
    const variants = Array.isArray(p.variants) ? p.variants as Record<string, unknown>[] : [];
    const skus = variants.map((v) => asStr(v.sku)).filter(Boolean) as string[];
    const prices = variants.map((v) => asNum(v.price)).filter((n): n is number => n != null);
    const eid = asStr(p.id);
    if (!eid) continue;
    items.push({ external_product_id: eid, title: asStr(p.name), skus, price: prices.length ? Math.min(...prices) : null, raw: { line: p } });
  }
  const complete = apiTotal > 0 && new Set(items.map((i) => i.external_product_id)).size >= apiTotal;
  try {
    const saved = await upsertCatalogListings(admin, { platformId, brandId, source: "api", items, markMissing: complete });
    return { ok: true, api_total: apiTotal, fetched: items.length, complete, ...saved };
  } catch (e) { return { ok: false, error: `บันทึกไม่สำเร็จ: ${(e as Error).message}` }; }
}
