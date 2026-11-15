/**
 * รูปทั้งหมดของ SKU ลูก (แกลเลอรี "รูปภาพเพิ่มเติม" ในหน้า SKU) — ตัวโหลด + ตัวรวม (ใช้ได้ทั้งหน้าเว็บและหลังบ้าน)
 * --------------------------------------------------------------------------
 * ที่เก็บ: erp_playground_attachments (entity_type = skus_v2 · entity_id = id ของ SKU) — ⭐ รูปหลัก = ปก (trigger sync กับ cover_image_r2_key)
 *   (asset_usages module=product_sku ไม่มีรูปที่แกลเลอรีไม่มี — เช็กข้อมูลจริง 2026-11-15 จึงไม่อ่าน)
 * ตัวสี (master เช่น PIX22-03) กับตัวขาย (PIX22-03S): ตัวขายที่ไม่มีรูปของตัวเอง ใช้รูปของตัวสี
 * ใช้ที่: ตัวสร้างสินค้า Lazada (app/api/lazada/create-product/load → lib/lazada-create-plan) · GET /api/product-platforms?with=sku_images (ลิ้นชัก Lazada)
 * ห้าม: เขียน/ลบรูป — แก้รูปใช้แกลเลอรีกลาง (ImageManager) เท่านั้น
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const CHUNK = 100;   // ≤ 9 รูป/SKU → ≤ 900 แถวต่อรอบ (ต่ำกว่าเพดาน 1,000 แถวของ PostgREST)

/** รูปแกลเลอรีของ SKU หลายตัว → { skuId: [r2 key เรียง ⭐ ก่อน → ลำดับที่ลากไว้] } (เฉพาะไฟล์รูป · ไม่ซ้ำ) */
export async function loadSkuGalleryKeys(admin: SupabaseClient, skuIds: string[]): Promise<Record<string, string[]>> {
  const ids = [...new Set(skuIds.filter(Boolean))];
  const out: Record<string, string[]> = {};
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { data, error } = await admin.from("erp_playground_attachments").select("entity_id, file_path, content_type")
      .eq("entity_type", "skus_v2").in("entity_id", part)
      .order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).order("id", { ascending: true });
    if (error) throw new Error(`โหลดรูปของ SKU ไม่สำเร็จ: ${error.message}`);
    for (const r of (data ?? []) as { entity_id: string; file_path: string | null; content_type: string | null }[]) {
      const key = (r.file_path ?? "").trim();
      if (!key || (r.content_type && !r.content_type.startsWith("image/"))) continue;
      const list = (out[r.entity_id] ??= []);
      if (!list.includes(key)) list.push(key);
    }
  }
  return out;
}

/** รูปทั้งหมดของทุก SKU ใน Parent 1 ตัว → { รหัส SKU: [r2 key] } (รวมรูปตัวสีให้ตัวขายแล้ว · ไม่ตัดจำนวน) — ลิ้นชัก Lazada ปุ่ม "ใช้รูปทั้งหมดของ SKU นี้" */
export async function loadSkuImagesByCode(admin: SupabaseClient, parentId: string): Promise<Record<string, string[]>> {
  const { data, error } = await admin.from("skus_v2").select("id, code, cover_image_r2_key").eq("parent_sku_id", parentId);
  if (error) throw new Error(`โหลด SKU ไม่สำเร็จ: ${error.message}`);
  const rows = (data ?? []) as { id: string; code: string | null; cover_image_r2_key: string | null }[];
  const gallery = await loadSkuGalleryKeys(admin, rows.map((r) => r.id));
  const byCode = new Map(rows.map((r) => [r.code ?? "", r]));
  const src = (r: (typeof rows)[number]): SkuImageSource => ({ cover: r.cover_image_r2_key, gallery: gallery[r.id] ?? [] });
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    if (!r.code) continue;
    const base = r.code.match(/^(.*\d)[A-Za-z]+$/)?.[1];   // ตัวขาย WK42-01D → ตัวสี WK42-01 (กติกาเดียวกับ splitSkus / baseOfCode)
    const master = base ? byCode.get(base) ?? null : null;
    out[r.code] = skuImageKeys(src(r), master ? src(master) : null);
  }
  return out;
}

export type SkuImageSource = { cover: string | null; gallery: string[] };

/** รูปทั้งหมดของ SKU 1 ตัว: ปก (ของตัวเอง → ของตัวสี) → แกลเลอรีของตัวเอง → แกลเลอรีของตัวสี · ไม่ซ้ำ · ไม่ตัดจำนวน */
export function skuImageKeys(own: SkuImageSource, master?: SkuImageSource | null): string[] {
  const out: string[] = [];
  const add = (k: string | null | undefined) => { const s = (k ?? "").trim(); if (s && !out.includes(s)) out.push(s); };
  add(own.cover || master?.cover);
  own.gallery.forEach(add);
  master?.gallery.forEach(add);
  return out;
}
