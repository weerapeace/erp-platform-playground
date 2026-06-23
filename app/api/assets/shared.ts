/**
 * Assets Library API — ตัวช่วยฝั่ง server ที่แตะ DB/R2 (ของกลางของ /api/assets/*)
 *
 * แยกมาไว้ที่นี่ (ไม่ใช่ใน route.ts) เพราะ route.ts ของ Next export ได้แค่ handler/config
 * หน้า client import "type" จากไฟล์นี้ได้ (type ถูกลบตอน build → ไม่ลากโค้ด server เข้า bundle)
 */
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import type { AssetType } from "@/lib/assets";

export type Db = ReturnType<typeof supabaseAdmin>;

export type AssetRow = {
  id: string;
  title: string;
  file_name: string;
  r2_key: string;
  url: string;                 // /api/r2-image?key=... (แสดงรูป / ดาวน์โหลด)
  asset_type: AssetType;
  content_type: string | null;
  ext: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  description: string | null;
  collection_id: string | null;
  status: string;              // active | trashed
  trashed_at: string | null;
  uploaded_by: string | null;
  created_at: string;
  master_path: string | null;   // path ไฟล์ต้นฉบับบน NAS (\\nas\... หรือ Z:\...)
  master_url: string | null;    // ลิงก์เว็บ NAS (Synology) เปิดจากนอกออฟฟิศ
  source: string;               // upload | odoo_product | artwork
  artwork_type: string | null;  // โลโก้/ลายพิมพ์/แพทเทิร์น/ม็อกอัป/... (เฉพาะ artwork)
  tags: string[];
  usage_count: number;
};

export type AssetUsage = {
  module: string;
  record_id: string;
  record_label: string | null;
  field: string | null;
  created_at: string;
};

export type AssetDetail = AssetRow & { usages: AssetUsage[]; collection_ids: string[] };

/** dict columns ที่ดึงจากตาราง assets */
type AssetDbRow = {
  id: string; title: string; file_name: string; r2_key: string; asset_type: AssetType;
  content_type: string | null; ext: string | null; size_bytes: number | null;
  width: number | null; height: number | null; description: string | null;
  collection_id: string | null; status: string; trashed_at: string | null;
  uploaded_by: string | null; created_at: string;
  master_path: string | null; master_url: string | null;
  source: string; artwork_type: string | null;
};

export const urlFor = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;

/** ตัด char พิเศษที่ทำ .or() ของ PostgREST พัง */
export const sanitizeToken = (t: string) => t.replace(/[,()%*]/g, " ").trim();

/** ประกอบ AssetRow จากแถว DB + tags + usage_count */
export function buildRow(r: AssetDbRow, tags: string[], usageCount: number): AssetRow {
  return {
    id: r.id,
    title: r.title || r.file_name,
    file_name: r.file_name,
    r2_key: r.r2_key,
    url: urlFor(r.r2_key),
    asset_type: r.asset_type,
    content_type: r.content_type,
    ext: r.ext,
    size_bytes: r.size_bytes,
    width: r.width,
    height: r.height,
    description: r.description,
    collection_id: r.collection_id,
    status: r.status,
    trashed_at: r.trashed_at,
    uploaded_by: r.uploaded_by,
    created_at: r.created_at,
    master_path: r.master_path,
    master_url: r.master_url,
    source: r.source,
    artwork_type: r.artwork_type,
    tags,
    usage_count: usageCount,
  };
}

/** ชื่อแท็กต่อ asset id */
export async function loadTags(admin: Db, ids: string[]): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>();
  if (ids.length === 0) return m;
  const { data } = await admin.from("asset_tag_map").select("asset_id, asset_tags(name)").in("asset_id", ids);
  type TagJoin = { asset_id: string; asset_tags: { name: string } | { name: string }[] | null };
  for (const row of (data ?? []) as unknown as TagJoin[]) {
    const at = row.asset_tags;
    const name = Array.isArray(at) ? at[0]?.name : at?.name;
    if (!name) continue;
    const arr = m.get(row.asset_id) ?? [];
    arr.push(name);
    m.set(row.asset_id, arr);
  }
  return m;
}

/** จำนวน "ถูกใช้" ต่อ asset id */
export async function loadUsageCounts(admin: Db, ids: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (ids.length === 0) return m;
  const { data } = await admin.from("asset_usages").select("asset_id").in("asset_id", ids);
  for (const row of (data ?? []) as { asset_id: string }[]) m.set(row.asset_id, (m.get(row.asset_id) ?? 0) + 1);
  return m;
}

/** ดึง 1 แถวพร้อม tags + usage_count */
export async function rowOf(admin: Db, r: AssetDbRow): Promise<AssetRow> {
  const tags  = (await loadTags(admin, [r.id])).get(r.id) ?? [];
  const usage = (await loadUsageCounts(admin, [r.id])).get(r.id) ?? 0;
  return buildRow(r, tags, usage);
}

/** สร้างแท็กถ้ายังไม่มี แล้วผูกเข้ากับ asset (ชื่อแท็ก → id) */
export async function attachTags(admin: Db, assetId: string, names: string[]): Promise<void> {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const { data: ex } = await admin.from("asset_tags").select("id").eq("name", name).maybeSingle();
    if (ex?.id) { ids.push(ex.id as string); continue; }
    const { data: created } = await admin.from("asset_tags").insert({ name }).select("id").maybeSingle();
    if (created?.id) ids.push(created.id as string);
  }
  if (ids.length)
    await admin.from("asset_tag_map").upsert(
      ids.map((tag_id) => ({ asset_id: assetId, tag_id })),
      { onConflict: "asset_id,tag_id", ignoreDuplicates: true },
    );
}

/** auth.uid ของผู้เรียก (สำหรับ audit) — null ถ้าไม่มี */
export async function actorId(request: NextRequest): Promise<string | null> {
  try {
    const { data } = await supabaseFromRequest(request).auth.getUser();
    return data.user?.id ?? null;
  } catch { return null; }
}

/** อัลบั้มทั้งหมดที่ asset อยู่ (asset อยู่ได้หลายอัลบั้ม ผ่าน asset_collection_map) */
export async function loadCollectionIds(admin: Db, assetId: string): Promise<string[]> {
  const { data } = await admin.from("asset_collection_map").select("collection_id").eq("asset_id", assetId);
  return (data ?? []).map((r) => (r as { collection_id: string }).collection_id);
}

/** ตั้งอัลบั้มของ asset (แทนที่ทั้งชุด) + sync assets.collection_id = อัลบั้มแรก (ให้ฟิลเตอร์ "ไม่อยู่อัลบั้ม" ทำงาน) */
export async function setCollections(admin: Db, assetId: string, ids: string[]): Promise<void> {
  const clean = [...new Set(ids.filter(Boolean))];
  await admin.from("asset_collection_map").delete().eq("asset_id", assetId);
  if (clean.length)
    await admin.from("asset_collection_map").upsert(
      clean.map((collection_id) => ({ asset_id: assetId, collection_id })),
      { onConflict: "asset_id,collection_id", ignoreDuplicates: true });
  await admin.from("assets").update({ collection_id: clean[0] ?? null }).eq("id", assetId);
}
