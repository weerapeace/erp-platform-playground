/**
 * 🔁 ถามคลังกลางว่า "มีไฟล์นี้อยู่แล้วไหม" ก่อนอัปโหลด — POST /api/assets/find-duplicates
 *
 *   { checksums: string[] }  (sha256 hex ของไฟล์ที่จะอัป · คำนวณในเบราว์เซอร์ ไม่ต้องส่งไฟล์มาก่อน)
 *   → { data: { [checksum]: DuplicateAsset }, error: null }   เฉพาะตัวที่เจอในคลัง (active)
 *
 * ใช้คู่กับของกลาง components/duplicate-upload (ป๊อปถาม "ใช้รูปเดิม / อัปโหลดใหม่") — ใช้รูปเดิม = ไม่ส่งไฟล์ซ้ำเข้าที่เก็บไฟล์
 * อ่านอย่างเดียว (ไม่แก้ข้อมูล) · สิทธิ์เดียวกับการอัปโหลด (files.upload)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";

const HEX64 = /^[a-f0-9]{64}$/;
const MAX_CHECKSUMS = 50;
const MAX_USED_IN = 5;

export type DuplicateAsset = {
  id: string;
  r2_key: string;
  title: string | null;
  file_name: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string | null;
  uploaded_by: string | null;
  /** แท็กในคลัง (บอกที่มา เช่น "รูปสินค้า (เว็บ)") */
  tags: string[];
  /** ถูกใช้อยู่ที่ไหน (ป้ายอ่านง่าย · สูงสุด 5) + จำนวนทั้งหมด */
  usedIn: string[];
  usedCount: number;
};

type Row = { id: string; r2_key: string; checksum: string; title: string | null; file_name: string | null; size_bytes: number | null; width: number | null; height: number | null; created_at: string | null; uploaded_by: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.upload");
  if (denied) return denied;

  let body: { checksums?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const checksums = [...new Set((Array.isArray(body.checksums) ? body.checksums : []).map((c) => String(c).toLowerCase()).filter((c) => HEX64.test(c)))].slice(0, MAX_CHECKSUMS);
  if (!checksums.length) return NextResponse.json({ data: {}, error: null });

  const admin = supabaseAdmin();
  const { data: found, error } = await admin
    .from("assets")
    .select("id, r2_key, checksum, title, file_name, size_bytes, width, height, created_at, uploaded_by")
    .in("checksum", checksums)
    .eq("status", "active")
    .not("r2_key", "is", null)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "ตรวจรูปซ้ำในคลังไม่สำเร็จ" }, { status: 500 });

  // checksum ละ 1 รายการ (ตัวที่อยู่ในคลังก่อนสุด)
  const byChecksum = new Map<string, Row>();
  for (const r of (found ?? []) as Row[]) if (!byChecksum.has(r.checksum)) byChecksum.set(r.checksum, r);
  if (!byChecksum.size) return NextResponse.json({ data: {}, error: null });

  const rows = [...byChecksum.values()];
  const ids = rows.map((r) => r.id);

  const [{ data: tagRows }, { data: usageRows }] = await Promise.all([
    admin.from("asset_tag_map").select("asset_id, asset_tags(name)").in("asset_id", ids),
    admin.from("asset_usages").select("asset_id, module, record_label").in("asset_id", ids),
  ]);
  const tags = new Map<string, string[]>();
  for (const t of (tagRows ?? []) as { asset_id: string; asset_tags: { name: string } | { name: string }[] | null }[]) {
    const names = (Array.isArray(t.asset_tags) ? t.asset_tags : t.asset_tags ? [t.asset_tags] : []).map((x) => x.name).filter(Boolean);
    tags.set(t.asset_id, [...(tags.get(t.asset_id) ?? []), ...names]);
  }
  const usedIn = new Map<string, string[]>();
  const pushUse = (id: string, label: string) => usedIn.set(id, [...(usedIn.get(id) ?? []), label]);
  for (const u of (usageRows ?? []) as { asset_id: string; module: string; record_label: string | null }[]) pushUse(u.asset_id, u.record_label || u.module);

  // รูปเว็บร้าน (แถวสี / รูปบนเว็บ) ไม่ได้ลง asset_usages → หาจากหน้าสินค้าเว็บที่ใช้ key นี้
  // ทำเฉพาะตอน "เจอรูปซ้ำ" ที่มาจากโฟลเดอร์เว็บ (นาน ๆ ครั้ง) · ตาราง store_listings หลักร้อยแถว
  const webIds = new Map(rows.filter((r) => r.r2_key.startsWith("storefront-")).map((r) => [r.r2_key, r.id]));
  if (webIds.size) {
    const listings = await fetchAllPages<{ parent_sku_id: string | null; shop_id: string | null; web_images: unknown; web_sku_images: unknown }>((from, to) =>
      admin.from("store_listings").select("parent_sku_id, shop_id, web_images, web_sku_images").order("id").range(from, to));
    const hits: { assetId: string; parentId: string | null; shopId: string | null; skuId: string | null }[] = [];
    for (const l of listings) {
      for (const k of Array.isArray(l.web_images) ? l.web_images : []) {
        const id = webIds.get(String(k));
        if (id) hits.push({ assetId: id, parentId: l.parent_sku_id, shopId: l.shop_id, skuId: null });
      }
      const sku = l.web_sku_images && typeof l.web_sku_images === "object" && !Array.isArray(l.web_sku_images) ? (l.web_sku_images as Record<string, unknown>) : {};
      for (const [skuId, v] of Object.entries(sku)) {
        for (const k of Array.isArray(v) ? v : [v]) {
          const id = webIds.get(String(k));
          if (id) hits.push({ assetId: id, parentId: l.parent_sku_id, shopId: l.shop_id, skuId });
        }
      }
    }
    if (hits.length) {
      const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
      const [{ data: parents }, { data: skus }, { data: shops }] = await Promise.all([
        admin.from("parent_skus_v2").select("id, code").in("id", uniq(hits.map((h) => h.parentId))),
        admin.from("skus_v2").select("id, code").in("id", uniq(hits.map((h) => h.skuId))),
        admin.from("shops").select("id, name").in("id", uniq(hits.map((h) => h.shopId))),
      ]);
      const name = (list: unknown, id: string | null, f: "code" | "name") => (id ? ((list ?? []) as Record<string, string>[]).find((x) => x.id === id)?.[f] : undefined);
      for (const h of hits) {
        const where = h.skuId ? (name(skus, h.skuId, "code") ?? name(parents, h.parentId, "code") ?? "SKU") : `${name(parents, h.parentId, "code") ?? "สินค้า"} · รูปบนเว็บ`;
        const shop = name(shops, h.shopId, "name");
        pushUse(h.assetId, shop ? `${where} (${shop})` : where);
      }
    }
  }

  const data: Record<string, DuplicateAsset> = {};
  for (const r of rows) {
    const uses = [...new Set(usedIn.get(r.id) ?? [])];
    data[r.checksum] = {
      id: r.id, r2_key: r.r2_key, title: r.title, file_name: r.file_name, size_bytes: r.size_bytes,
      width: r.width, height: r.height, created_at: r.created_at, uploaded_by: r.uploaded_by,
      tags: [...new Set(tags.get(r.id) ?? [])], usedIn: uses.slice(0, MAX_USED_IN), usedCount: uses.length,
    };
  }
  return NextResponse.json({ data, error: null });
}
