/**
 * 🖨 ลายรีดบนกระเป๋า — งานฝั่งเซิร์ฟเวอร์ (ใช้ service role · ห้าม import จากหน้า client)
 *
 * - ค่าตั้งต่อรุ่น = store_listings.web_print · กฎคิด/ตรวจ = lib/website-print-design (pure)
 * - คลังลาย = ไฟล์ในอัลบั้มของคลังไฟล์ (assets ผ่าน asset_collection_map) ที่ร้านเลือกให้รุ่นนั้น
 * - รูปลูกค้า = bucket "print-uploads" (ส่วนตัว) · เบราว์เซอร์อัปตรงด้วยลิงก์อัปโหลดชั่วคราว (ไม่ผ่าน Vercel ที่รับได้ ~4 MB)
 * - แบบ = store_print_designs (ราคาคิดที่นี่เท่านั้น) → ผูกรายการออเดอร์ store_order_items.print_design_id
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { newDesignCode } from "@/lib/product-configurator";
import { writeAudit } from "@/lib/audit";
import {
  normalizePlacements,
  normalizePrintDesign,
  normRot,
  fitPlacement,
  printDesignExtra,
  printDesignLabel,
  printDesignUsable,
  printNeedsReview,
  printPlacementFiles,
  PRINT_UPLOAD_MAX_BYTES,
  PRINT_UPLOAD_TYPES,
  type PrintDesignConfig,
  type PrintDesignView,
  type PrintLibLookup,
  type PrintLibraryItem,
  type PrintMethod,
  type PrintPlacement,
  type PrintZone,
} from "@/lib/website-print-design";

type Admin = SupabaseClient;
export const PRINT_BUCKET = "print-uploads";
/** เก็บรูปลูกค้าหลังส่งของ/ยกเลิก (วัน) — เจ้าของเลือก 90 วัน (2026-10-30) */
export const PRINT_KEEP_DAYS = 90;
/** แบบที่ไม่ได้สั่ง (ลูกค้าออกแบบแล้วทิ้ง) ลบรูปหลังกี่วัน */
export const PRINT_DRAFT_KEEP_DAYS = 14;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export type PrintDesignRow = {
  id: string;
  shop_id: string;
  parent_sku_id: string;
  option_id: string | null;
  code: string;
  method: PrintMethod;
  placements: PrintPlacement[];
  zones: PrintZone[];
  extra_price: number | string;
  has_upload: boolean;
  status: "draft" | "ordered";
  review_status: "pending" | "approved" | "reupload" | "rejected" | null;
  review_note: string | null;
  reviewed_at: string | null;
  order_ref: string | null;
  ordered_at: string | null;
  uploads_purged_at: string | null;
  created_at: string;
};
export const PRINT_DESIGN_SELECT = "id, shop_id, parent_sku_id, option_id, code, method, placements, zones, extra_price, has_upload, status, review_status, review_note, reviewed_at, order_ref, ordered_at, uploads_purged_at, created_at";

export const PRINT_REVIEW_LABEL: Record<NonNullable<PrintDesignRow["review_status"]>, string> = {
  pending: "รอตรวจลาย",
  approved: "อนุมัติลายแล้ว",
  reupload: "ขอรูปใหม่",
  rejected: "ปฏิเสธลาย",
};

/** ค่าตั้งลายรีดของรุ่นนี้ในร้านนี้ (รุ่นต้องเผยแพร่อยู่ + เปิดใช้ได้) */
export async function readListingPrint(sb: Admin, shopId: string, parentSkuId: string): Promise<PrintDesignConfig | null> {
  if (!UUID.test(parentSkuId)) return null;
  const { data } = await sb.from("store_listings").select("is_published, web_print").eq("shop_id", shopId).eq("parent_sku_id", parentSkuId).maybeSingle();
  if (!data || !data.is_published || !data.web_print) return null;
  const cfg = normalizePrintDesign(data.web_print);
  return printDesignUsable(cfg) ? cfg : null;
}

type AssetLite = { id: string; title: string | null; file_name: string | null; r2_key: string | null; width: number | null; height: number | null; status: string | null; asset_type: string | null };

/** ลายในอัลบั้มที่ร้านเลือกให้รุ่นนี้ (รูปเท่านั้น · ไม่รวมถังขยะ) — ลายเดียวอยู่หลายชุด = ใช้ชุดแรก */
export async function printLibraryFor(sb: Admin, cfg: PrintDesignConfig, origin: string): Promise<PrintLibraryItem[]> {
  const sets = cfg.library.filter((s) => UUID.test(s.collectionId));
  if (!sets.length) return [];
  const { data: maps } = await sb.from("asset_collection_map").select("asset_id, collection_id, added_at").in("collection_id", sets.map((s) => s.collectionId)).order("added_at", { ascending: true }).limit(2000);
  const setOf = new Map<string, string>();
  for (const m of (maps ?? []) as { asset_id: string; collection_id: string }[]) if (!setOf.has(m.asset_id)) setOf.set(m.asset_id, m.collection_id);
  const ids = [...setOf.keys()];
  const rows: AssetLite[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("assets").select("id, title, file_name, r2_key, width, height, status, asset_type").in("id", ids.slice(i, i + 200));
    rows.push(...((data ?? []) as AssetLite[]));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: PrintLibraryItem[] = [];
  for (const id of ids) {
    const a = byId.get(id);
    if (!a || !a.r2_key || a.status === "trashed" || (a.asset_type && a.asset_type !== "image")) continue;
    const set = sets.find((s) => s.collectionId === setOf.get(id))!;
    // ไม่มีกว้าง/สูงในคลัง = 0 → เว็บวัดสัดส่วนจากรูปจริงก่อนวาง (เดิมเดาเป็นจัตุรัส ลายยืด/บีบ)
    const ar = a.width && a.height ? a.height / a.width : 0;
    out.push({
      id: a.id,
      name: (a.title || a.file_name || "ลาย").replace(/\.[a-z0-9]{2,4}$/i, "").slice(0, 60),
      url: `${origin}/api/r2-image?key=${encodeURIComponent(a.r2_key)}&w=800`,
      ar: Math.round(ar * 10000) / 10000,
      extra: set.extra,
      set: set.collectionId,
    });
  }
  return out;
}

/** ตัวค้นลายในคลังสำหรับตรวจแบบ — เฉพาะลายในชุดที่ร้านเปิดให้รุ่นนี้ */
async function libLookupFor(sb: Admin, cfg: PrintDesignConfig, assetIds: string[]): Promise<PrintLibLookup> {
  const ids = [...new Set(assetIds.filter((x) => UUID.test(x)))];
  const sets = cfg.library.filter((s) => UUID.test(s.collectionId));
  if (!ids.length || !sets.length) return () => null;
  const [{ data: maps }, { data: assets }] = await Promise.all([
    sb.from("asset_collection_map").select("asset_id, collection_id").in("asset_id", ids).in("collection_id", sets.map((s) => s.collectionId)),
    sb.from("assets").select("id, title, file_name, r2_key, width, height, status, asset_type").in("id", ids),
  ]);
  const extraOf = new Map<string, number>();
  for (const m of (maps ?? []) as { asset_id: string; collection_id: string }[]) {
    if (!extraOf.has(m.asset_id)) extraOf.set(m.asset_id, sets.find((s) => s.collectionId === m.collection_id)?.extra ?? 0);
  }
  const byId = new Map(((assets ?? []) as AssetLite[]).map((a) => [a.id, a]));
  return (id) => {
    const a = byId.get(id);
    if (!a || !extraOf.has(id) || a.status === "trashed" || !a.r2_key) return null;
    return { ar: a.width && a.height ? a.height / a.width : null, extra: extraOf.get(id)!, name: (a.title || a.file_name || "ลาย").replace(/\.[a-z0-9]{2,4}$/i, "").slice(0, 60) };
  };
}

type UploadUrl = { ok: true; path: string; url: string; token: string } | { ok: false; error: string; status: number };

/**
 * ลิงก์อัปโหลดชั่วคราว (2 ชม.) สำหรับรูปลูกค้า / รูปข้อความ (purpose "text" = PNG ที่หน้าเว็บวาดจากข้อความ)
 * ไฟล์อยู่ใต้โฟลเดอร์ร้าน <shop_id>/<yyyymm>/<uuid>.<ext>
 */
export async function createPrintUpload(sb: Admin, shopId: string, body: { product?: unknown; type?: unknown; size?: unknown; purpose?: unknown }): Promise<UploadUrl> {
  const cfg = await readListingPrint(sb, shopId, String(body.product ?? ""));
  if (!cfg) return { ok: false, error: "สินค้านี้ยังไม่เปิดให้ออกแบบลาย", status: 404 };
  if (body.purpose === "text") {
    if (!cfg.text.enabled) return { ok: false, error: "รุ่นนี้ไม่รับข้อความ", status: 400 };
    if (body.type !== "image/png") return { ok: false, error: "รูปข้อความต้องเป็น PNG", status: 400 };
  } else if (!cfg.allowUpload) return { ok: false, error: "รุ่นนี้ไม่รับรูปที่อัปเอง เลือกจากคลังลายของร้านได้", status: 400 };
  return signedUpload(sb, shopId, body.type, body.size);
}

async function signedUpload(sb: Admin, shopId: string, type0: unknown, size0: unknown): Promise<UploadUrl> {
  const type = String(type0 ?? "");
  if (!PRINT_UPLOAD_TYPES.includes(type)) return { ok: false, error: "รับเฉพาะรูป PNG, JPG หรือ WebP", status: 400 };
  const size = Number(size0) || 0;
  if (size <= 0 || size > PRINT_UPLOAD_MAX_BYTES) return { ok: false, error: "ไฟล์ต้องไม่เกิน 25 MB", status: 400 };
  const now = new Date();
  const path = `${shopId}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${EXT[type]}`;
  const { data, error } = await sb.storage.from(PRINT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "เตรียมที่อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง", status: 500 };
  return { ok: true, path: data.path, url: data.signedUrl, token: data.token };
}

/** ไฟล์ที่ลูกค้าอัปอยู่จริงในโฟลเดอร์ของร้านนี้ไหม (ตรวจทีละโฟลเดอร์เดือน) */
async function existingUploads(sb: Admin, shopId: string, paths: string[]): Promise<Set<string>> {
  const ok = new Set<string>();
  const byDir = new Map<string, string[]>();
  for (const p of new Set(paths)) {
    if (!p.startsWith(`${shopId}/`) || p.includes("..")) continue;
    const i = p.lastIndexOf("/");
    const arr = byDir.get(p.slice(0, i)) ?? [];
    arr.push(p.slice(i + 1));
    byDir.set(p.slice(0, i), arr);
  }
  for (const [dir, names] of byDir) {
    for (const name of names) {
      const { data } = await sb.storage.from(PRINT_BUCKET).list(dir, { search: name, limit: 2 });
      if ((data ?? []).some((f) => f.name === name)) ok.add(`${dir}/${name}`);
    }
  }
  return ok;
}

/**
 * บันทึกแบบที่ลูกค้าวาง (ตอนกดใส่ตะกร้า) — ตรวจทุกอย่างใหม่ + คิดราคาที่นี่
 * คืน id (ใส่ในรหัสบรรทัดตะกร้า) + รหัสแบบ + ราคาเพิ่มต่อใบ
 */
export async function savePrintDesign(
  sb: Admin,
  shopId: string,
  body: { product?: unknown; optionId?: unknown; placements?: unknown; views?: unknown },
): Promise<{ ok: true; design: { id: string; code: string; extra: number; count: number; label: string; hasUpload: boolean } } | { ok: false; error: string; status: number }> {
  const productId = String(body.product ?? "");
  const cfg = await readListingPrint(sb, shopId, productId);
  if (!cfg) return { ok: false, error: "สินค้านี้ยังไม่เปิดให้ออกแบบลาย", status: 404 };
  const raw = Array.isArray(body.placements) ? (body.placements as Record<string, unknown>[]).slice(0, 80) : [];
  const assetIds = raw.filter((p) => p?.kind === "lib").map((p) => String(p.assetId ?? ""));
  const uploadPaths = raw.filter((p) => p?.kind === "upload" || p?.kind === "text").map((p) => String((p.upload as Record<string, unknown> | undefined)?.path ?? ""));
  const [lib, uploads] = await Promise.all([libLookupFor(sb, cfg, assetIds), existingUploads(sb, shopId, uploadPaths)]);
  const norm = normalizePlacements(raw, cfg, { lib, uploadOk: (p) => uploads.has(p) });
  if (!norm.ok) return { ok: false, error: norm.error, status: 400 };
  const extra = printDesignExtra(cfg, norm.placements, lib);
  // รูปพื้นของส่วนพิมพ์ = รูปสีที่ลูกค้าเห็นตอนออกแบบ (หน้าเว็บส่ง URL รูปมา) → ภาพในตะกร้า/ออเดอร์เป็นสีที่สั่งจริง
  const views = (body.views && typeof body.views === "object" ? body.views : {}) as Record<string, unknown>;
  const usedZones = cfg.zones.filter((z) => norm.placements.some((p) => p.zone === z.id)).map((z) => ({ ...z, imageKey: viewKey(views[z.id]) ?? z.imageKey }));
  // has_upload = มีไฟล์ในที่เก็บส่วนตัว (รูปลูกค้า/รูปข้อความ — ลบตามวันเก็บ) · ต้องตรวจไหมดูจากชนิดลาย (printNeedsReview)
  const hasUpload = printPlacementFiles(norm.placements).length > 0;
  const optionId = String(body.optionId ?? "").trim().slice(0, 60) || null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newDesignCode();
    const { data, error } = await sb
      .from("store_print_designs")
      .insert({ shop_id: shopId, parent_sku_id: productId, option_id: optionId, code, method: cfg.method, placements: norm.placements, zones: usedZones, extra_price: extra, has_upload: hasUpload })
      .select("id")
      .single();
    if (!error && data) return { ok: true, design: { id: data.id as string, code, extra, count: norm.placements.length, label: printDesignLabel(cfg.method, norm.placements.length), hasUpload: printNeedsReview(norm.placements) } };
    if (error?.code !== "23505") return { ok: false, error: "บันทึกลายไม่สำเร็จ ลองใหม่อีกครั้ง", status: 500 };
  }
  return { ok: false, error: "บันทึกลายไม่สำเร็จ ลองใหม่อีกครั้ง", status: 500 };
}

/** key รูปจาก URL รูปสินค้าของเว็บร้าน (…/api/r2-image?key=…) · ใช้ไม่ได้ = null */
function viewKey(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 1500) return null;
  try {
    const key = new URL(v).searchParams.get("key") ?? "";
    return key && key.length <= 400 && !key.includes("..") && /^[\w\-./ %()]+$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

/** แบบที่ผูกกับรายการในออเดอร์ (โหลดครั้งเดียวต่อออเดอร์) */
export async function loadPrintDesigns(sb: Admin, shopId: string, ids: string[]): Promise<Map<string, PrintDesignRow>> {
  const list = [...new Set(ids.filter((x) => UUID.test(x)))];
  if (!list.length) return new Map();
  const { data } = await sb.from("store_print_designs").select(PRINT_DESIGN_SELECT).eq("shop_id", shopId).in("id", list);
  return new Map(((data ?? []) as PrintDesignRow[]).map((d) => [d.id, d]));
}

/**
 * ตรวจแบบตอนสร้างออเดอร์ (pure) — ต้องเป็นของรุ่น/สีที่สั่ง และยังไม่เคยสั่ง
 * คืนราคาเพิ่มต่อใบ + ป้ายต่อท้ายชื่อรายการ
 */
export function printDesignForLine(
  d: PrintDesignRow | null | undefined,
  productId: string,
  optionId: string | undefined,
): { ok: true; extra: number; label: string; labelEn: string } | { ok: false; error: string } {
  if (!d) return { ok: false, error: "ไม่พบลายที่ออกแบบไว้ ลองออกแบบใหม่อีกครั้ง" };
  if (d.parent_sku_id !== productId) return { ok: false, error: "ลายที่ออกแบบไม่ตรงกับสินค้า ลองออกแบบใหม่" };
  if (d.option_id && optionId && d.option_id !== optionId) return { ok: false, error: "ลายที่ออกแบบไว้เป็นของสีอื่น ลองออกแบบใหม่" };
  if (d.status !== "draft") return { ok: false, error: "ลายนี้ถูกสั่งไปแล้ว — ออกแบบใหม่แล้วใส่ตะกร้าอีกครั้ง" };
  const n = Array.isArray(d.placements) ? d.placements.length : 0;
  return { ok: true, extra: Math.max(0, Number(d.extra_price) || 0), label: `${printDesignLabel(d.method, n)} · ${d.code}`, labelEn: `${printDesignLabel(d.method, n, "en")} · ${d.code}` };
}

/** หลังสร้างออเดอร์: แบบ → สั่งแล้ว · มีรูปอัปเอง = รอตรวจลาย / ลายคลังล้วน = อนุมัติอัตโนมัติ */
export async function markPrintDesignsOrdered(sb: Admin, designs: PrintDesignRow[], orderNo: string): Promise<void> {
  const now = new Date().toISOString();
  for (const d of designs) {
    await sb
      .from("store_print_designs")
      .update({ status: "ordered", order_ref: orderNo, ordered_at: now, review_status: printNeedsReview(Array.isArray(d.placements) ? d.placements : []) ? "pending" : "approved", updated_at: now })
      .eq("id", d.id)
      .eq("status", "draft");
  }
}

/** ลิงก์ดูรูปลูกค้าชั่วคราว (หลังบ้าน) */
export async function signedPrintUrls(sb: Admin, paths: string[], ttlSec = 900): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter(Boolean))];
  const out = new Map<string, string>();
  if (!list.length) return out;
  const { data } = await sb.storage.from(PRINT_BUCKET).createSignedUrls(list, ttlSec);
  for (const r of data ?? []) if (r.path && r.signedUrl) out.set(r.path, r.signedUrl);
  return out;
}

/**
 * 🧹 ลบรูปลูกค้าที่ครบวันเก็บ (PDPA): ออเดอร์ส่งแล้ว/สำเร็จ/ยกเลิก เกิน PRINT_KEEP_DAYS · แบบที่ไม่ได้สั่งเกิน PRINT_DRAFT_KEEP_DAYS
 * ข้อมูลแบบ (ตำแหน่ง ซม.) ยังอยู่ — ลบเฉพาะไฟล์รูป แล้วตั้ง uploads_purged_at
 */
export async function purgePrintUploads(sb: Admin, now = new Date()): Promise<{ designs: number; files: number }> {
  const draftCut = new Date(now.getTime() - PRINT_DRAFT_KEEP_DAYS * 86400000).toISOString();
  const keepCut = new Date(now.getTime() - PRINT_KEEP_DAYS * 86400000).toISOString();
  const { data: drafts } = await sb.from("store_print_designs").select("id, placements").eq("has_upload", true).is("uploads_purged_at", null).eq("status", "draft").lt("created_at", draftCut).limit(300);
  const { data: ordered } = await sb.from("store_print_designs").select("id, placements").eq("has_upload", true).is("uploads_purged_at", null).eq("status", "ordered").lt("ordered_at", keepCut).limit(300);
  const done: { id: string; placements: PrintPlacement[] }[] = [...((drafts ?? []) as { id: string; placements: PrintPlacement[] }[])];
  const ord = (ordered ?? []) as { id: string; placements: PrintPlacement[] }[];
  if (ord.length) {
    // ออเดอร์ต้องจบแล้ว (ส่งแล้ว/สำเร็จ/ยกเลิก) และอัปเดตล่าสุดเกินวันเก็บ — ยังไม่จบ = เก็บไว้ก่อน
    const { data: items } = await sb.from("store_order_items").select("print_design_id, order_id").in("print_design_id", ord.map((d) => d.id));
    const orderOf = new Map(((items ?? []) as { print_design_id: string; order_id: string }[]).map((i) => [i.print_design_id, i.order_id]));
    const orderIds = [...new Set(orderOf.values())];
    const { data: orders } = orderIds.length ? await sb.from("store_orders").select("id, status, updated_at").in("id", orderIds) : { data: [] };
    const finished = new Set(((orders ?? []) as { id: string; status: string; updated_at: string }[]).filter((o) => ["shipped", "completed", "cancelled"].includes(o.status) && o.updated_at < keepCut).map((o) => o.id));
    for (const d of ord) if (!orderOf.has(d.id) || finished.has(orderOf.get(d.id)!)) done.push(d);
  }
  let files = 0;
  for (const d of done) {
    const paths = printPlacementFiles(Array.isArray(d.placements) ? d.placements : []);
    if (paths.length) {
      const { error } = await sb.storage.from(PRINT_BUCKET).remove(paths);
      if (error) continue;
      files += paths.length;
    }
    await sb.from("store_print_designs").update({ uploads_purged_at: now.toISOString() }).eq("id", d.id);
  }
  return { designs: done.length, files };
}

/* ── ภาพแบบสำหรับลูกค้า (ตะกร้า / หน้าตามออเดอร์ / บัญชีสมาชิก) ── */

/**
 * แบบหลายใบ → ข้อมูลวาดภาพจำลอง (ส่วนพิมพ์ + ลาย) · รูปลูกค้า/รูปข้อความ = ลิงก์ชั่วคราว 1 ชม.
 * รหัสแบบเป็น uuid สุ่ม (ลูกค้าได้จากตะกร้า/ออเดอร์ของตัวเองเท่านั้น) → ใช้เป็นกุญแจดูภาพของแบบนั้น
 */
export async function printDesignViews(sb: Admin, shopId: string, ids: string[], origin: string): Promise<PrintDesignView[]> {
  const list = [...new Set(ids.filter((x) => UUID.test(x)))].slice(0, 30);
  if (!list.length) return [];
  const { data } = await sb.from("store_print_designs").select(PRINT_DESIGN_SELECT).eq("shop_id", shopId).in("id", list);
  const rows = (data ?? []) as PrintDesignRow[];
  if (!rows.length) return [];
  const img = (key: string, w = 1000) => `${origin}/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
  const assetIds = [...new Set(rows.flatMap((d) => (Array.isArray(d.placements) ? d.placements : []).map((p) => p.assetId ?? "")).filter((x) => UUID.test(x)))];
  const parentIds = [...new Set(rows.map((d) => d.parent_sku_id))];
  const [{ data: assets }, { data: parents }, signed] = await Promise.all([
    assetIds.length ? sb.from("assets").select("id, r2_key").in("id", assetIds) : Promise.resolve({ data: [] }),
    sb.from("parent_skus_v2").select("id, cover_image_r2_key").in("id", parentIds),
    signedPrintUrls(sb, rows.filter((d) => !d.uploads_purged_at).flatMap((d) => printPlacementFiles(Array.isArray(d.placements) ? d.placements : [])), 3600),
  ]);
  const assetKey = new Map(((assets ?? []) as { id: string; r2_key: string | null }[]).map((a) => [a.id, a.r2_key]));
  const cover = new Map(((parents ?? []) as { id: string; cover_image_r2_key: string | null }[]).map((p) => [p.id, p.cover_image_r2_key]));
  return list
    .map((id) => rows.find((d) => d.id === id))
    .filter((d): d is PrintDesignRow => !!d)
    .map((d) => {
      const fallback = cover.get(d.parent_sku_id) ?? null;
      const placements = Array.isArray(d.placements) ? d.placements : [];
      return {
        id: d.id,
        code: d.code,
        method: d.method,
        extra: Number(d.extra_price) || 0,
        status: d.status,
        review: d.review_status,
        note: d.review_status === "reupload" || d.review_status === "rejected" ? d.review_note : null,
        orderRef: d.order_ref,
        zones: (Array.isArray(d.zones) ? d.zones : []).map((z) => ({ ...z, imageUrl: z.imageKey ? img(z.imageKey) : fallback ? img(fallback) : "" })),
        items: placements.map((p) => {
          const key = p.assetId ? assetKey.get(p.assetId) : null;
          return {
            zone: p.zone,
            kind: p.kind,
            name: p.name,
            url: p.upload ? signed.get(p.upload.path) ?? null : key ? img(key, 600) : null,
            x: p.x,
            y: p.y,
            w: p.w,
            h: p.h,
            rot: p.rot,
          };
        }),
      };
    });
}

/* ── ลูกค้าส่งรูปใหม่ (ร้าน "ขอรูปใหม่") — ยืนยันตัวด้วยเลขออเดอร์ + เบอร์โทรเหมือนหน้าตามออเดอร์ ── */

const digitsOf = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** แบบที่ร้านขอรูปใหม่ ของออเดอร์นี้ (เลขออเดอร์ + เบอร์ 9 หลักท้ายตรง) · ไม่ผ่าน = ข้อความภาษาคน */
async function reuploadTarget(
  sb: Admin,
  shopId: string,
  body: { design?: unknown; orderNo?: unknown; phone?: unknown },
): Promise<{ ok: true; design: PrintDesignRow; orderId: string } | { ok: false; error: string; status: number }> {
  const id = String(body.design ?? "");
  const no = String(body.orderNo ?? "").trim().toUpperCase().slice(0, 40);
  const ph = digitsOf(body.phone);
  if (!UUID.test(id) || !no || ph.length < 9) return { ok: false, error: "ข้อมูลไม่ครบ ลองเปิดหน้าออเดอร์ใหม่", status: 400 };
  const { data: o } = await sb.from("store_orders").select("id, customer_phone").eq("shop_id", shopId).eq("order_no", no).maybeSingle();
  if (!o || digitsOf(o.customer_phone).slice(-9) !== ph.slice(-9)) return { ok: false, error: "ไม่พบออเดอร์นี้", status: 404 };
  const { data: line } = await sb.from("store_order_items").select("id").eq("order_id", o.id).eq("print_design_id", id).limit(1).maybeSingle();
  if (!line) return { ok: false, error: "ไม่พบลายนี้ในออเดอร์", status: 404 };
  const { data: d } = await sb.from("store_print_designs").select(PRINT_DESIGN_SELECT).eq("shop_id", shopId).eq("id", id).maybeSingle();
  if (!d) return { ok: false, error: "ไม่พบลายนี้ในออเดอร์", status: 404 };
  if ((d as PrintDesignRow).review_status !== "reupload") return { ok: false, error: "ร้านไม่ได้ขอรูปใหม่สำหรับลายนี้แล้ว", status: 409 };
  return { ok: true, design: d as PrintDesignRow, orderId: o.id as string };
}

/** ลิงก์อัปรูปใหม่ (ตรวจออเดอร์ก่อน · ไม่ขึ้นกับว่ารุ่นยังเปิดลายรีดอยู่ไหม) */
export async function createReuploadUrl(sb: Admin, shopId: string, body: Record<string, unknown>): Promise<UploadUrl> {
  const t = await reuploadTarget(sb, shopId, body);
  if (!t.ok) return t;
  return signedUpload(sb, shopId, body.type, body.size);
}

/**
 * แทนรูปลูกค้าในลายที่ร้านขอใหม่ — คงตำแหน่ง/ความกว้างเดิม (สูงตามสัดส่วนรูปใหม่) · ราคาเดิม (จ่ายแล้ว)
 * → กลับเป็น "รอตรวจลาย" + ลบไฟล์เก่า (ร้านขอเปลี่ยนเพราะใช้ไม่ได้) + audit
 */
export async function replacePrintUpload(
  sb: Admin,
  shopId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; index: number } | { ok: false; error: string; status: number }> {
  const t = await reuploadTarget(sb, shopId, body);
  if (!t.ok) return t;
  const d = t.design;
  const placements = Array.isArray(d.placements) ? [...d.placements] : [];
  const index = Math.floor(Number(body.index));
  const cur = placements[index];
  if (!cur || cur.kind !== "upload" || !cur.upload) return { ok: false, error: "เลือกรูปที่จะเปลี่ยนไม่ถูกต้อง", status: 400 };
  const u = (body.upload && typeof body.upload === "object" ? body.upload : {}) as Record<string, unknown>;
  const path = String(u.path ?? "").slice(0, 300);
  const w = Math.round(Number(u.w) || 0);
  const h = Math.round(Number(u.h) || 0);
  if (!path || path === cur.upload.path || !(await existingUploads(sb, shopId, [path])).has(path)) return { ok: false, error: "ไม่พบรูปที่อัปโหลด ลองอัปใหม่อีกครั้ง", status: 400 };
  if (w < 1 || h < 1 || w > 30000 || h > 30000) return { ok: false, error: "ขนาดรูปไม่ถูกต้อง", status: 400 };
  const zone = (Array.isArray(d.zones) ? d.zones : []).find((z) => z.id === cur.zone);
  const geo = { x: cur.x, y: cur.y, w: cur.w, h: (cur.w * h) / w, rot: normRot(cur.rot) };
  placements[index] = { ...cur, upload: { path, w, h, alpha: u.alpha === true }, ...(zone ? fitPlacement(geo, zone) : geo) };
  const now = new Date().toISOString();
  const { error } = await sb
    .from("store_print_designs")
    .update({ placements, review_status: "pending", review_note: null, reviewed_at: null, reviewed_by: null, has_upload: true, uploads_purged_at: null, updated_at: now })
    .eq("id", d.id)
    .eq("review_status", "reupload");
  if (error) return { ok: false, error: "บันทึกรูปใหม่ไม่สำเร็จ ลองใหม่อีกครั้ง", status: 500 };
  await sb.storage.from(PRINT_BUCKET).remove([cur.upload.path]);
  await writeAudit(sb, {
    action: "print_customer_reupload",
    entityType: "store_print_designs",
    entityId: d.id,
    actorId: null,
    actorName: "ลูกค้า (เว็บร้าน)",
    metadata: { order_no: d.order_ref, index, old_path: cur.upload.path, new_path: path, w, h },
  });
  return { ok: true, index };
}
