/**
 * บันทึก "สินค้าบนร้าน" ที่ดึงผ่าน API ลง platform_catalog_listings + จับคู่ด้วยรหัสตรง — ของกลาง (server)
 * ใช้: /api/lazada/sync-products (ร้านอื่นที่ต่อ API ทีหลังใช้ตัวนี้ได้เลย)
 *
 * กติกา (ปลอดภัยก่อน):
 *   - upsert ตาม external_product_id ภายใน (ร้าน × แบรนด์) — เติม/อัปเดต ไม่ลบของเดิม
 *   - จับคู่อัตโนมัติเฉพาะ "รหัสตรงเป๊ะ" (SKU บนร้าน = รหัส SKU ลูก หรือรหัส Parent ในระบบ)
 *     ที่เหลือให้ตัวเดาคู่ (lib/platform-match-suggest) เสนอ แล้วคนกดยืนยันในหน้า สินค้าบนแพลตฟอร์ม
 *   - คู่ที่มีอยู่แล้วไม่ทับ (คนจับคู่/แก้ไว้ = คนตัดสินแล้ว) · ไม่แตะสถานะ "ไม่ต้องจับคู่"
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

export type CatalogSyncItem = {
  external_product_id: string;
  title: string | null;
  /** รหัส SKU บนร้าน (ตัวแรกใช้โชว์) */
  skus: string[];
  price: number | null;
  status?: string | null;
  /** เก็บใต้ key ของร้าน เช่น { lazada: {...} } — merge กับของเดิม */
  raw: Record<string, unknown>;
};

/** รหัส → parent_sku_id (รหัส SKU ลูกมาก่อน แล้วค่อยรหัส Parent) · ถามเป็นชุดละ 200 กัน URL ยาวเกิน */
export async function parentIdsByCode(admin: Admin, codes: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  const bySku = new Map<string, string>(), byParent = new Map<string, string>();
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200);
    const [{ data: skus }, { data: parents }] = await Promise.all([
      admin.from("skus_v2").select("code, parent_sku_id").in("code", chunk),
      admin.from("parent_skus_v2").select("id, code").in("code", chunk),
    ]);
    for (const s of (skus ?? []) as { code: string; parent_sku_id: string | null }[]) if (s.parent_sku_id) bySku.set(s.code, s.parent_sku_id);
    for (const p of (parents ?? []) as { id: string; code: string }[]) byParent.set(p.code, p.id);
  }
  const out = new Map(byParent);
  for (const [k, v] of bySku) out.set(k, v);   // SKU ลูกชนะ (เจาะจงกว่า)
  return out;
}

export async function upsertCatalogListings(
  admin: Admin,
  args: { platformId: string; brandId: string; source: "api" | "import"; items: CatalogSyncItem[] },
): Promise<{ created: number; updated: number; matched: number; newly_matched: number }> {
  const { platformId, brandId, source, items } = args;
  if (items.length === 0) return { created: 0, updated: 0, matched: 0, newly_matched: 0 };
  const codeMap = await parentIdsByCode(admin, items.flatMap((i) => i.skus));
  const matchOf = (i: CatalogSyncItem): string | null => {
    for (const sk of i.skus) { const id = codeMap.get(sk); if (id) return id; }
    return null;
  };

  const existing = new Map<string, Record<string, unknown>>();
  const extIds = [...new Set(items.map((i) => i.external_product_id))];
  for (let i = 0; i < extIds.length; i += 300) {
    const { data } = await admin.from("platform_catalog_listings").select("id, external_product_id, title, price, status, matched_parent_sku_id, raw")
      .eq("platform_id", platformId).eq("brand_id", brandId).in("external_product_id", extIds.slice(i, i + 300));
    for (const r of (data ?? []) as Record<string, unknown>[]) existing.set(String(r.external_product_id), r);
  }

  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [], updates: Record<string, unknown>[] = [];
  let matched = 0, newlyMatched = 0;
  for (const it of items) {
    const found = existing.get(it.external_product_id);
    const keep = (found?.matched_parent_sku_id as string | null | undefined) ?? null;
    const auto = keep ? null : matchOf(it);
    const m = keep ?? auto;
    if (m) matched++;
    if (auto) newlyMatched++;
    const base = {
      platform_id: platformId, brand_id: brandId, source, last_imported_at: now, updated_at: now,
      external_product_id: it.external_product_id, sku_code: it.skus[0] ?? null, matched_parent_sku_id: m,
    };
    if (found) {
      const prevRaw = (found.raw && typeof found.raw === "object") ? found.raw as Record<string, unknown> : {};
      updates.push({ id: found.id, ...base, title: it.title ?? (found.title ?? null), price: it.price ?? (found.price ?? null), status: it.status ?? (found.status ?? null), raw: { ...prevRaw, ...it.raw } });
    } else {
      inserts.push({ ...base, title: it.title, price: it.price, status: it.status ?? null, raw: it.raw });
    }
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await admin.from("platform_catalog_listings").insert(inserts.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await admin.from("platform_catalog_listings").upsert(updates.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  return { created: inserts.length, updated: updates.length, matched, newly_matched: newlyMatched };
}
