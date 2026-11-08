/**
 * มุมมองหน้าร้าน (Seller Center) ฝั่ง server — อ่าน DB แล้วสรุปด้วยกฎกลาง lib/platform-listing-health
 * ใช้: GET /api/platform-catalog?view=shop (หน้าสินค้าบนแพลตฟอร์ม → มุมมองหน้าร้าน · เมนูในแอปจัดการงาน)
 * อ่านอย่างเดียว ไม่แก้อะไรในระบบหรือบนร้าน
 *
 * ความเร็ว: ข้อมูลดิบจากร้านมีคำอธิบายยาว ๆ → select เฉพาะช่องที่ใช้ (ตัวเลือก/รูป/สถานะ) ไม่ดึง raw ทั้งก้อน
 *   (LINE ทั้งร้าน ~920 รายการ ≈ ตัวเลือก 2.5MB ฝั่ง server · ส่งให้หน้าเว็บเฉพาะสรุป)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { duplicateCounts, summarizeListing, type ShopItem, type ShopParent } from "@/lib/platform-listing-health";

type Admin = ReturnType<typeof supabaseAdmin>;
const CHUNK = 200;   // .in() ยาวเกินจะโดนตัด/ช้า → ถามเป็นชุด

type ListingRow = {
  id: string; external_product_id: string | null; title: string | null; sku_code: string | null;
  matched_parent_sku_id: string | null; price: number | null; match_ignored: boolean | null; last_imported_at: string | null;
  line_id: unknown; line_display: unknown; line_variants: unknown; line_images: unknown; line_cat: unknown; lazada: unknown;
};

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

/** รายการบนร้าน (ร้าน + แบรนด์) + ช่องจากข้อมูลดิบเฉพาะที่ใช้สรุป */
async function loadListings(admin: Admin, platformId: string, brandId: string): Promise<ListingRow[]> {
  return fetchAllPages<ListingRow>((from, to) => {
    let q = admin.from("platform_catalog_listings")
      .select("id, external_product_id, title, sku_code, matched_parent_sku_id, price, match_ignored, last_imported_at, line_id:raw->line->id, line_display:raw->line->isDisplay, line_variants:raw->line->variants, line_images:raw->line->imageUrls, line_cat:raw->line->category, lazada:raw->lazada")
      .eq("platform_id", platformId);
    if (brandId) q = q.eq("brand_id", brandId);
    return q.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: ListingRow[] | null; error: unknown }>;
  }, { page: 500 });
}

/** ประกอบ raw กลับเป็นรูปเดิม (เฉพาะช่องที่เลือกมา) ให้กฎกลางอ่านได้เหมือนข้อมูลเต็ม */
function rawSlice(r: ListingRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (r.line_id != null || r.line_variants != null) {
    out.line = { id: r.line_id, isDisplay: r.line_display, variants: r.line_variants, imageUrls: r.line_images, category: r.line_cat };
  }
  if (r.lazada != null) out.lazada = r.lazada;
  return out;
}

/** สถานะงานที่ "ปิดแล้ว" อ่านจากตารางสถานะงาน (is_terminal) — ไม่ hardcode */
async function terminalStatuses(admin: Admin): Promise<Set<string>> {
  const { data } = await admin.from("erp_creative_statuses").select("key").eq("is_terminal", true);
  const keys = ((data ?? []) as { key: string }[]).map((s) => s.key);
  return new Set(keys.length ? keys : ["done", "cancelled", "published"]);
}

/** จำนวนงาน (แอปจัดการงาน) ที่ยังไม่ปิด ต่อ Parent SKU — นับทั้งงานที่ผูกหลายสินค้า และช่องสินค้าหลักของงาน */
async function openTaskCounts(admin: Admin, parentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!parentIds.length) return out;
  const terminal = await terminalStatuses(admin);
  const pairs: { task_id: string; parent_sku_id: string }[] = [];
  await Promise.all(chunks(parentIds).map(async (ids) => {
    const [{ data: links }, { data: direct }] = await Promise.all([
      admin.from("erp_creative_task_parent_skus").select("task_id, parent_sku_id").in("parent_sku_id", ids),
      admin.from("erp_creative_tasks").select("id, parent_sku_id").in("parent_sku_id", ids).eq("is_active", true),
    ]);
    for (const l of (links ?? []) as { task_id: string; parent_sku_id: string }[]) pairs.push(l);
    for (const t of (direct ?? []) as { id: string; parent_sku_id: string }[]) pairs.push({ task_id: t.id, parent_sku_id: t.parent_sku_id });
  }));
  const taskIds = [...new Set(pairs.map((p) => p.task_id))];
  const open = new Set<string>();
  await Promise.all(chunks(taskIds).map(async (ids) => {
    const { data } = await admin.from("erp_creative_tasks").select("id, status").in("id", ids).eq("is_active", true);
    for (const t of (data ?? []) as { id: string; status: string | null }[]) if (!terminal.has(t.status ?? "")) open.add(t.id);
  }));
  const seen = new Set<string>();
  for (const p of pairs) {
    const k = `${p.parent_sku_id}|${p.task_id}`;
    if (!open.has(p.task_id) || seen.has(k)) continue;
    seen.add(k);
    out.set(p.parent_sku_id, (out.get(p.parent_sku_id) ?? 0) + 1);
  }
  return out;
}

type ParentRow = { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null };

/** Parent SKU ที่ไม่มีรูปปก → ดูว่ามีรูปที่อื่นไหม (แกลเลอรี/รูป SKU) */
async function imageStates(admin: Admin, noCover: string[]): Promise<Map<string, "sku_only" | "none">> {
  const hasGallery = new Set<string>();
  const hasSku = new Set<string>();
  await Promise.all(chunks(noCover).map(async (ids) => {
    const [{ data: slots }, { data: skus }] = await Promise.all([
      admin.from("product_image_slots").select("owner_id").in("owner_id", ids),
      admin.from("skus_v2").select("parent_sku_id").in("parent_sku_id", ids).not("cover_image_r2_key", "is", null),
    ]);
    for (const s of (slots ?? []) as { owner_id: string }[]) hasGallery.add(s.owner_id);
    for (const s of (skus ?? []) as { parent_sku_id: string }[]) hasSku.add(s.parent_sku_id);
  }));
  const out = new Map<string, "sku_only" | "none">();
  // มีรูปในแกลเลอรีแต่ไม่ตั้งปก = ยังมีรูปให้ใช้ → นับรวมกับ "มีรูปที่ SKU" (ตั้งปกได้เลย ไม่ต้องถ่ายใหม่)
  for (const id of noCover) out.set(id, hasGallery.has(id) || hasSku.has(id) ? "sku_only" : "none");
  return out;
}

export type ShopViewData = {
  items: ShopItem[];
  not_listed: ShopParent[] | null;
  no_image: ShopParent[] | null;
  last_imported_at: string | null;
};

/**
 * ข้อมูลทั้งหมดของมุมมองหน้าร้าน
 * brandId ว่าง = ทุกแบรนด์ (ไม่คำนวณ "ยังไม่ลง/ไม่มีรูป" เพราะต้องรู้ว่าสินค้าแบรนด์ไหนควรอยู่ร้านนี้)
 */
export async function loadShopView(admin: Admin, platformId: string, platformCode: string, brandId: string): Promise<ShopViewData> {
  const [rows, brandParents] = await Promise.all([
    loadListings(admin, platformId, brandId),
    brandId
      ? fetchAllPages<ParentRow>((from, to) => admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key")
          .eq("brand_id", brandId).eq("is_active", true).order("code", { ascending: true }).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: ParentRow[] | null; error: unknown }>)
      : Promise.resolve(null),
  ]);

  // สินค้าในระบบที่จับคู่ไว้ (รหัส/ชื่อ/รูปปก) — ใช้ของแบรนด์ที่โหลดมาแล้วถ้ามี ที่เหลือถามเพิ่ม
  const pMap = new Map<string, ParentRow>((brandParents ?? []).map((p) => [p.id, p]));
  const matchedIds = [...new Set(rows.map((r) => r.matched_parent_sku_id).filter((x): x is string => !!x))];
  const missingIds = matchedIds.filter((id) => !pMap.has(id));
  await Promise.all(chunks(missingIds).map(async (ids) => {
    const { data } = await admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", ids);
    for (const p of (data ?? []) as ParentRow[]) pMap.set(p.id, p);
  }));

  const listedIds = new Set(matchedIds);
  const notListedRows = brandParents ? brandParents.filter((p) => !listedIds.has(p.id)) : null;
  const noCoverRows = brandParents ? brandParents.filter((p) => !p.cover_image_r2_key) : null;

  const taskParentIds = [...new Set([...matchedIds, ...(notListedRows ?? []).map((p) => p.id), ...(noCoverRows ?? []).map((p) => p.id)])];
  const [tasks, imgStates] = await Promise.all([
    openTaskCounts(admin, taskParentIds),
    noCoverRows ? imageStates(admin, noCoverRows.map((p) => p.id)) : Promise.resolve(new Map<string, "sku_only" | "none">()),
  ]);

  const dups = duplicateCounts(rows);
  let last: string | null = null;
  const items: ShopItem[] = rows.map((r) => {
    if (r.last_imported_at && (!last || r.last_imported_at > last)) last = r.last_imported_at;
    const p = r.matched_parent_sku_id ? pMap.get(r.matched_parent_sku_id) : undefined;
    return {
      ...summarizeListing(platformCode, rawSlice(r), r.price != null ? Number(r.price) : null),
      id: r.id, external_product_id: r.external_product_id, title: r.title, sku_code: r.sku_code,
      matched_parent_sku_id: r.matched_parent_sku_id, matched_code: p?.code ?? null, matched_name: p?.name_th ?? null,
      matched_cover_key: p?.cover_image_r2_key ?? null,
      match_ignored: !!r.match_ignored, dup_count: dups.get(r.id) ?? 0,
      open_tasks: r.matched_parent_sku_id ? (tasks.get(r.matched_parent_sku_id) ?? 0) : 0,
    };
  });

  const toParent = (p: ParentRow): ShopParent => ({
    id: p.id, code: p.code ?? "", name: p.name_th, cover_key: p.cover_image_r2_key,
    image_state: p.cover_image_r2_key ? "ok" : (imgStates.get(p.id) ?? "none"),
    open_tasks: tasks.get(p.id) ?? 0,
  });

  return {
    items,
    not_listed: notListedRows ? notListedRows.map(toParent) : null,
    no_image: noCoverRows ? noCoverRows.map(toParent) : null,
    last_imported_at: last,
  };
}
