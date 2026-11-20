/**
 * ผล "พร้อมลงร้าน" ที่จดไว้ (ตาราง platform_create_readiness) — ของกลางฝั่ง server
 * เขียน: cron /api/cron/platform-readiness (ทุกคืน) + /api/product-platforms/create-readiness (ตรวจสดในหน้า)
 * อ่าน: lib/platform-cross-shop-server (ป้ายพร้อมลงขึ้นทันที + ตัวกรอง "พร้อมลงเลย")
 * ค่าคำนวณจาก lib/platform-create-readiness-server เท่านั้น (ไม่มีตัวตรวจตัวที่ 2) · ไม่ throw (จดไม่ได้ = ไม่เป็นไร ตรวจใหม่ได้)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateReadiness } from "@/lib/platform-create-readiness";

export type StoredReadiness = { ready: boolean; on_shop: string | null; missing: string[]; error: string | null; checked_at: string };

export const isReady = (r: Pick<CreateReadiness, "error" | "on_shop" | "missing">): boolean => !r.error && !r.on_shop && !r.missing.length;

/** จดผลตรวจ — ร้านที่ "ตรวจไม่สำเร็จ" ไม่ทับผลดีเดิม (ร้านตอบช้าชั่วคราว) */
export async function saveReadiness(admin: SupabaseClient, parentId: string, results: CreateReadiness[]): Promise<void> {
  const rows = results.filter((r) => !r.error).map((r) => ({
    parent_sku_id: parentId, platform_code: r.code, ready: isReady(r), on_shop: r.on_shop, missing: r.missing, error: null, checked_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  try {
    const { error } = await admin.from("platform_create_readiness").upsert(rows, { onConflict: "parent_sku_id,platform_code" });
    if (error) console.warn("[readiness-store] save", error.message);
  } catch (e) { console.warn("[readiness-store] save", (e as Error).message); }
}

/** อ่านผลที่จดไว้ของหลายสินค้า → parent → ร้าน → ผล */
export async function loadReadiness(admin: SupabaseClient, parentIds: string[]): Promise<Map<string, Record<string, StoredReadiness>>> {
  const out = new Map<string, Record<string, StoredReadiness>>();
  for (let i = 0; i < parentIds.length; i += 300) {
    try {
      const { data, error } = await admin.from("platform_create_readiness")
        .select("parent_sku_id, platform_code, ready, on_shop, missing, error, checked_at").in("parent_sku_id", parentIds.slice(i, i + 300)).limit(5000);
      if (error) { console.warn("[readiness-store] load", error.message); continue; }
      for (const r of (data ?? []) as ({ parent_sku_id: string; platform_code: string } & StoredReadiness)[]) {
        const m = out.get(r.parent_sku_id) ?? out.set(r.parent_sku_id, {}).get(r.parent_sku_id)!;
        m[r.platform_code] = { ready: !!r.ready, on_shop: r.on_shop, missing: Array.isArray(r.missing) ? r.missing.map(String) : [], error: r.error, checked_at: r.checked_at };
      }
    } catch (e) { console.warn("[readiness-store] load", (e as Error).message); }
  }
  return out;
}
