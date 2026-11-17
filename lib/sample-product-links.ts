/**
 * อัลบั้ม SAMPLE ↔ สินค้า (Parent SKU / SKU ลูก) — ฝั่ง server (เจ้าของเลือกจาก widget 2026-11-17: ระดับ A + โชว์แบบ A + ข้อ 1-5)
 *
 * ที่เก็บ: asset_collections.parent_sku_codes / sku_codes (jsonb array รหัส · migration 202612190200) — sku_codes ว่าง = ทั้งรุ่น
 * ใช้โดย: GET/POST /api/sample-images (?children_of · ?product · action "link") · หน้า Parent แท็บภาพรวมอ่านผ่าน lib/parent-links-registry
 * รูป SAMPLE ไม่ปนแกลเลอรีรูปสินค้า (แยกส่วน "รูป SAMPLE") · รูปสินค้าเดิม = erp_playground_attachments (parent_skus_v2 / skus_v2)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { SAMPLE_ALBUM_MARK, parseSampleMark } from "@/lib/sample-images";

type Admin = ReturnType<typeof supabaseAdmin>;

/** jsonb array → รหัสไม่ซ้ำ ตัดช่องว่าง (สูงสุด 50) */
export function codeList(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return [...new Set(x.map((v) => String(v ?? "").trim()).filter(Boolean))].slice(0, 50);
}

export type ChildSku = { id: string; code: string; name: string; image_key: string | null };

/** SKU ลูกของรุ่น (ยังเปิดใช้) เรียงรหัส */
export async function childSkus(admin: Admin, parentId: string): Promise<ChildSku[]> {
  const { data, error } = await admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key, is_active")
    .eq("parent_sku_id", parentId).order("code", { ascending: true }).limit(300);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null; is_active: boolean | null }[])
    .filter((r) => r.is_active !== false && r.code)
    .map((r) => ({ id: r.id, code: String(r.code), name: r.name_th ?? "", image_key: r.cover_image_r2_key }));
}

export type ProductImage = { key: string; label: string };

/** รูปที่มีอยู่แล้วของ Parent + SKU ที่เชื่อม (แกลเลอรีสินค้า · รูปหลักก่อน) — ไว้เทียบกับ SAMPLE */
export async function productImages(admin: Admin, parentCodes: string[], skuCodes: string[], limit = 16): Promise<ProductImage[]> {
  const out: ProductImage[] = [];
  const seen = new Set<string>();
  const pull = async (table: "parent_skus_v2" | "skus_v2", codes: string[]) => {
    if (!codes.length || out.length >= limit) return;
    const { data: recs } = await admin.from(table).select("id, code, cover_image_r2_key").in("code", codes);
    const rows = (recs ?? []) as { id: string; code: string; cover_image_r2_key: string | null }[];
    if (!rows.length) return;
    const codeOf = new Map(rows.map((r) => [r.id, r.code]));
    const { data: atts } = await admin.from("erp_playground_attachments").select("entity_id, file_path, content_type, is_primary, sort_order, created_at")
      .eq("entity_type", table).in("entity_id", rows.map((r) => r.id))
      .order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).order("created_at", { ascending: true }).limit(80);
    for (const a of (atts ?? []) as { entity_id: string; file_path: string | null; content_type: string | null }[]) {
      if (out.length >= limit) break;
      if (!a.file_path || !(a.content_type ?? "").startsWith("image/") || seen.has(a.file_path)) continue;
      seen.add(a.file_path); out.push({ key: a.file_path, label: codeOf.get(a.entity_id) ?? "" });
    }
    for (const r of rows) {   // ไม่มีแกลเลอรีแต่มีรูปปก
      if (out.length >= limit) break;
      if (r.cover_image_r2_key && !seen.has(r.cover_image_r2_key)) { seen.add(r.cover_image_r2_key); out.push({ key: r.cover_image_r2_key, label: r.code }); }
    }
  };
  await pull("parent_skus_v2", parentCodes);
  await pull("skus_v2", skuCodes);
  return out;
}

export type ProductSampleAlbum = {
  id: string; name: string; parent_name: string | null; sku_codes: string[];
  photos: { id: string; key: string }[]; total: number;
};

/** อัลบั้ม SAMPLE ที่เชื่อมกับสินค้านี้ (หลายอัลบั้มได้) + รูปในแต่ละอัลบั้ม · SKU ลูก = อัลบั้มที่เลือก SKU นี้ หรือเชื่อมทั้งรุ่น */
export async function albumsForProduct(admin: Admin, kind: "parent" | "sku", id: string, perAlbum = 24): Promise<{ parent_code: string | null; sku_code: string | null; albums: ProductSampleAlbum[] }> {
  let parentCode: string | null = null, skuCode: string | null = null;
  if (kind === "parent") {
    const { data } = await admin.from("parent_skus_v2").select("code").eq("id", id).maybeSingle();
    parentCode = (data as { code: string | null } | null)?.code ?? null;
  } else {
    const { data } = await admin.from("skus_v2").select("code, parent_sku_id").eq("id", id).maybeSingle();
    const s = data as { code: string | null; parent_sku_id: string | null } | null;
    skuCode = s?.code ?? null;
    if (s?.parent_sku_id) {
      const { data: p } = await admin.from("parent_skus_v2").select("code").eq("id", s.parent_sku_id).maybeSingle();
      parentCode = (p as { code: string | null } | null)?.code ?? null;
    }
  }
  if (!parentCode && !skuCode) return { parent_code: null, sku_code: null, albums: [] };

  type Row = { id: string; name: string; display_name: string | null; description: string | null; parent_sku_codes: unknown; sku_codes: unknown; created_at: string };
  const rows: Row[] = [];
  const sel = "id, name, display_name, description, parent_sku_codes, sku_codes, created_at";
  if (parentCode) {
    const { data, error } = await admin.from("asset_collections").select(sel).like("description", `${SAMPLE_ALBUM_MARK}%`)
      .filter("parent_sku_codes", "cs", JSON.stringify([parentCode])).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
  }
  if (skuCode) {
    const { data, error } = await admin.from("asset_collections").select(sel).like("description", `${SAMPLE_ALBUM_MARK}%`)
      .filter("sku_codes", "cs", JSON.stringify([skuCode])).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Row[]) if (!rows.some((x) => x.id === r.id)) rows.push(r);
  }
  // หน้า SKU: อัลบั้มที่เลือก SKU อื่นของรุ่นไว้ (ไม่ใช่ตัวนี้) ไม่เกี่ยว
  const picked = kind === "sku" ? rows.filter((r) => { const sk = codeList(r.sku_codes); return !sk.length || (skuCode ? sk.includes(skuCode) : false); }) : rows;
  if (!picked.length) return { parent_code: parentCode, sku_code: skuCode, albums: [] };

  const parentIds = [...new Set(picked.map((r) => parseSampleMark(r.description)?.parentId).filter((x): x is string => !!x))];
  const parentNames = new Map<string, string>();
  if (parentIds.length) {
    const { data } = await admin.from("asset_collections").select("id, name, display_name").in("id", parentIds);
    for (const p of (data ?? []) as { id: string; name: string; display_name: string | null }[]) parentNames.set(p.id, p.display_name?.trim() || p.name);
  }
  const { data: map } = await admin.from("asset_collection_map").select("asset_id, collection_id, sort_order").in("collection_id", picked.map((r) => r.id));
  const links = (map ?? []) as { asset_id: string; collection_id: string; sort_order: number | null }[];
  const assets = new Map<string, { r2_key: string; created_at: string }>();
  const assetIds = [...new Set(links.map((l) => l.asset_id))];
  for (let i = 0; i < assetIds.length; i += 200) {
    const { data } = await admin.from("assets").select("id, r2_key, status, created_at").in("id", assetIds.slice(i, i + 200));
    for (const a of (data ?? []) as { id: string; r2_key: string; status: string | null; created_at: string }[]) if (a.status !== "trashed" && a.r2_key) assets.set(a.id, a);
  }
  const albums = picked.map((r) => {
    const ps = links.filter((l) => l.collection_id === r.id && assets.has(l.asset_id))
      .sort((x, y) => (x.sort_order ?? 1e9) - (y.sort_order ?? 1e9) || assets.get(x.asset_id)!.created_at.localeCompare(assets.get(y.asset_id)!.created_at));
    const pid = parseSampleMark(r.description)?.parentId ?? null;
    return { id: r.id, name: r.display_name?.trim() || r.name, parent_name: pid ? parentNames.get(pid) ?? null : null, sku_codes: codeList(r.sku_codes),
      photos: ps.slice(0, perAlbum).map((l) => ({ id: l.asset_id, key: assets.get(l.asset_id)!.r2_key })), total: ps.length };
  });
  return { parent_code: parentCode, sku_code: skuCode, albums };
}
