/**
 * 🖼 เปลี่ยนปกโปรทุกร้าน — ฝั่งเซิร์ฟเวอร์ (ยิงร้านจริง) · กติกา pure = lib/promo-cover.ts
 *
 * ทำงานเป็น "รอบ" (runPromoCovers) — เรียกจากตัวตั้งเวลา /api/cron/promo-covers ทุก 15 นาที และปุ่ม "ทำเดี๋ยวนี้" ในหน้า
 *   1) ชุดโปรที่ถึงเวลาส่ง → เป้าหมายรายร้านที่ยังรอส่ง → applyTarget (ส่งปกโปรเป็นรูปแรก · จดชุดรูปเดิม + สำเนาปกเดิมในคลังรูปเรา)
 *   2) ชุดโปรที่ถึงเวลาย้อน → เป้าหมายที่ปกโปรยังอยู่ → revertTarget (เอารูปแรกเดิมกลับ — ถ้ารูปแรกบนร้านไม่ใช่ปกโปรของเราแล้ว = conflict ไม่ทับ)
 *   3) สถานะชุดโปร (live/ended) + แจ้งเตือนรายการที่ล้มเหลว (กระดิ่ง · ข้อเสนอ 3 · กฎแจ้งเตือน promo_cover.failed)
 * ตัวยิงร้านใช้ของเดิมของลิ้นชักสินค้าบนร้าน (ดึงสด · ฝากรูป · แก้รูป) — ไม่เขียนการต่อร้านใหม่
 *   Shopee: update_item image_id_list · Lazada: /product/update Images · TikTok: Partial Edit main_images (ส่งตรวจ) · LINE: PATCH /products · เว็บ: store_listings.web_images
 * ทุกการส่ง/ย้อนลงประวัติ (audit) ของสินค้าบนร้านนั้น (source promo_cover) + ของชุดโปร
 */
import sharp from "sharp";
import { writeAudit } from "@/lib/audit";
import { r2GetObject, r2PutObject } from "@/lib/r2";
import { publicImageUrl } from "@/lib/line-shopping-server";
import { ruleRecipients } from "@/lib/notify-recipients";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import {
  ALERT_STATUS, ON_SHOP, PLATFORM_LABEL, PROMO_PLATFORMS, backupKeyOf, coverFromRaw, framedKeyOf, isApplyDue, isPromoPlatform, isRevertDue, listingOnSale,
  nextCampaignStatus, restoreCover, sameImageRef, swapCover, type CampaignStatus, type CampaignTiming, type PromoPlatform, type TargetStatus,
} from "@/lib/promo-cover";
// ร้านตลาด — ตัวช่วยเดียวกับลิ้นชักสินค้าบนร้าน
import { shopeeUpdateItem, shopeeErrorText } from "@/lib/shopee";
import { planShopeeImages, shopeeImageIdOfRef, shopeeImageRef } from "@/lib/shopee-listing-edit";
import { loadShopeeListingLive, shopeeUploadRef } from "@/app/api/shopee/shared";
import { lazErrorText, lazMigrateImage, lazUpdateProduct } from "@/lib/lazada";
import { lazadaEditStateFromView, lazadaListingView, lazMigrateImageXml, lazResolveRefs, lazUpdateProductXml, planLazadaEdit } from "@/lib/lazada-listing-edit";
import { loadLazListingLive } from "@/app/api/lazada/shared";
import { ttsErrorText, ttsPartialEdit } from "@/lib/tiktok-shop";
import { planTiktokMedia, tiktokImageRef, tiktokMediaBase, tiktokUriOfRef } from "@/lib/tiktok-listing-edit";
import { loadTtsListingLive, ttsUploadRef, ttsViewWithReview } from "@/app/api/tiktok-shop/shared";
import { lineGetProduct, lineUpdateProduct } from "@/lib/line-shopping";
import { lineApiKey } from "@/lib/line-shopping-server";
import { lineEditStateFromRaw, planLineEdit, systemImageKey } from "@/lib/line-listing-edit";
// เว็บเรา
import { listingPatchToRow } from "@/lib/website-listing-patch";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { syncStoreListingUsages } from "@/lib/store-listing-usage";
import { CHILD_SELECT, normalizeFieldMap, resolveProduct } from "@/lib/website-field-map";
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
type Actor = { id: string | null; name: string | null };
export const EVENT_FAILED = "promo_cover.failed";

export type CampaignRow = CampaignTiming & {
  id: string; name: string; platforms: string[]; frame_key: string | null; note: string | null;
  confirmed_by: string | null; created_by: string | null; created_at: string; updated_at: string;
};
export type ItemRow = { id: string; campaign_id: string; parent_sku_id: string; promo_key: string | null; source: "upload" | "library" | "frame"; sort_order: number };
export type TargetRow = {
  id: string; campaign_id: string; item_id: string; parent_sku_id: string; platform: PromoPlatform; target_key: string; brand_id: string | null; label: string | null;
  status: TargetStatus; before_refs: unknown; before_cover_url: string | null; backup_key: string | null; applied_ref: string | null; error: string | null;
  attempts: number; applied_at: string | null; reverted_at: string | null; notified_at: string | null; updated_at: string;
};
export const CAMPAIGN_COLS = "id, name, status, starts_at, ends_at, auto_revert, early_hours, platforms, frame_key, note, confirmed_at, confirmed_by, revert_requested_at, deleted_at, created_by, created_at, updated_at";
export const ITEM_COLS = "id, campaign_id, parent_sku_id, promo_key, source, sort_order";
export const TARGET_COLS = "id, campaign_id, item_id, parent_sku_id, platform, target_key, brand_id, label, status, before_refs, before_cover_url, backup_key, applied_ref, error, attempts, applied_at, reverted_at, notified_at, updated_at";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e ?? "ไม่ทราบสาเหตุ")).slice(0, 500);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function platformIds(admin: Admin): Promise<Map<PromoPlatform, string>> {
  const { data } = await admin.from("erp_platforms").select("id, code").in("code", PROMO_PLATFORMS as unknown as string[]);
  return new Map(((data ?? []) as { id: string; code: string }[]).filter((r) => isPromoPlatform(r.code)).map((r) => [r.code as PromoPlatform, r.id]));
}

// ───────── เป้าหมายรายร้าน (ดูก่อนยืนยัน + สร้างตอนยืนยัน) ─────────
export type PlannedTarget = {
  item_id: string; parent_sku_id: string; platform: PromoPlatform; target_key: string; brand_id: string | null; label: string;
  before_cover_url: string | null; ready: boolean; reason: string | null;
};
export type PlatformSummary = { platform: PromoPlatform; targets: number; ready: number; closed: number; unmatched: number; blocked: string[] };

/**
 * หาสินค้าบนร้านของทุกรุ่นในชุด × ทุกร้านที่เลือก (อ่านอย่างเดียว ไม่แตะร้าน)
 *   ร้านตลาด = รายการที่จับคู่กับรุ่นไว้แล้ว + เปิดขายอยู่ · เว็บ = store_listings ที่ขึ้นเว็บอยู่
 *   ร้านที่ยังไม่เชื่อม (ไม่มีกุญแจ) = ready false + เหตุผล
 */
export async function planTargets(admin: Admin, platforms: PromoPlatform[], items: Pick<ItemRow, "id" | "parent_sku_id">[]): Promise<{ targets: PlannedTarget[]; summary: PlatformSummary[] }> {
  const parentIds = [...new Set(items.map((i) => i.parent_sku_id))];
  const itemOf = new Map(items.map((i) => [i.parent_sku_id, i.id]));
  const out: PlannedTarget[] = [];
  const summary: PlatformSummary[] = [];
  if (!parentIds.length || !platforms.length) return { targets: out, summary };
  const pids = await platformIds(admin);
  const { data: brandRows } = await admin.from("brands").select("id, name");
  const brandName = new Map(((brandRows ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const { data: creds } = await admin.from("platform_credentials").select("brand_id, platform_id, api_key");
  const keyed = new Set(((creds ?? []) as { brand_id: string; platform_id: string; api_key: string | null }[]).filter((c) => !!c.api_key).map((c) => `${c.brand_id}|${c.platform_id}`));

  for (const platform of platforms) {
    const s: PlatformSummary = { platform, targets: 0, ready: 0, closed: 0, unmatched: 0, blocked: [] };
    if (platform === "website") {
      const { data } = await admin.from("store_listings").select("shop_id, parent_sku_id, is_published, web_images").in("parent_sku_id", parentIds);
      const rows = (data ?? []) as { shop_id: string; parent_sku_id: string; is_published: boolean; web_images: unknown }[];
      const shopIds = [...new Set(rows.map((r) => r.shop_id))];
      const { data: shops } = shopIds.length ? await admin.from("shops").select("id, name, status").in("id", shopIds) : { data: [] };
      const shopOf = new Map(((shops ?? []) as { id: string; name: string; status: string }[]).map((x) => [x.id, x]));
      for (const r of rows) {
        if (!r.is_published) { s.closed++; continue; }
        const shop = shopOf.get(r.shop_id);
        const first = strList(r.web_images)[0] ?? null;
        out.push({ item_id: itemOf.get(r.parent_sku_id)!, parent_sku_id: r.parent_sku_id, platform, target_key: r.shop_id, brand_id: null, label: `เว็บ ${shop?.name ?? ""}`.trim(),
          before_cover_url: first ? `/api/r2-image?key=${encodeURIComponent(first)}&w=300` : null, ready: true, reason: null });
      }
      s.unmatched = parentIds.filter((p) => !rows.some((r) => r.parent_sku_id === p && r.is_published)).length;
    } else {
      const pid = pids.get(platform);
      if (!pid) { s.blocked.push("ไม่พบร้านนี้ในระบบ"); summary.push(s); continue; }
      const { data } = await admin.from("platform_catalog_listings").select("id, brand_id, title, status, matched_parent_sku_id, raw, external_product_id")
        .eq("platform_id", pid).in("matched_parent_sku_id", parentIds).or(LIVE_LISTING_OR);
      const rows = (data ?? []) as { id: string; brand_id: string | null; title: string | null; status: string | null; matched_parent_sku_id: string; raw: unknown; external_product_id: string | null }[];
      const blockedBrands = new Set<string>();
      for (const r of rows) {
        if (!listingOnSale(platform, r.status)) { s.closed++; continue; }
        const ok = !!r.brand_id && keyed.has(`${r.brand_id}|${pid}`) && !!r.external_product_id;
        const bn = r.brand_id ? brandName.get(r.brand_id) ?? "" : "";
        if (!ok) blockedBrands.add(bn || "ไม่รู้แบรนด์");
        out.push({ item_id: itemOf.get(r.matched_parent_sku_id)!, parent_sku_id: r.matched_parent_sku_id, platform, target_key: r.id, brand_id: r.brand_id,
          label: `${PLATFORM_LABEL[platform]}${bn ? ` · ${bn}` : ""}`, before_cover_url: coverFromRaw(platform, r.raw),
          ready: ok, reason: ok ? null : `ร้าน ${PLATFORM_LABEL[platform]}${bn ? ` ${bn}` : ""} ยังไม่เชื่อม — ไปที่ ร้าน/บัญชีแพลตฟอร์ม แล้วเชื่อมต่อก่อน` });
      }
      s.unmatched = parentIds.filter((p) => !rows.some((r) => r.matched_parent_sku_id === p && listingOnSale(platform, r.status))).length;
      s.blocked = [...blockedBrands].map((b) => `${PLATFORM_LABEL[platform]} ${b} ยังไม่เชื่อม`);
    }
    s.targets = out.filter((t) => t.platform === platform).length;
    s.ready = out.filter((t) => t.platform === platform && t.ready).length;
    summary.push(s);
  }
  return { targets: out, summary };
}

/**
 * ตอนยืนยัน: สร้าง/อัปเดตเป้าหมายรายร้านตามแผนล่าสุด
 *   ยังรอส่ง/ข้าม/ส่งไม่ผ่าน = เขียนใหม่ได้ · ที่ปกโปรขึ้นแล้ว/ย้อนแล้ว = ไม่แตะ · รายการที่หลุดจากแผน (เอารุ่น/ร้านออก) ลบเฉพาะที่ยังไม่ได้ส่ง
 */
export async function syncTargets(admin: Admin, campaign: CampaignRow, items: ItemRow[]): Promise<{ created: number; skipped: number; removed: number }> {
  const platforms = campaign.platforms.filter(isPromoPlatform);
  const { targets } = await planTargets(admin, platforms, items);
  const { data: existing } = await admin.from("promo_cover_targets").select(TARGET_COLS).eq("campaign_id", campaign.id);
  const cur = (existing ?? []) as TargetRow[];
  const k = (t: { item_id: string; platform: string; target_key: string }) => `${t.item_id}|${t.platform}|${t.target_key}`;
  const curOf = new Map(cur.map((t) => [k(t), t]));
  const want = new Set(targets.map(k));
  const promoOf = new Map(items.map((i) => [i.id, i.promo_key]));
  const rows = targets.filter((t) => { const c = curOf.get(k(t)); return !c || c.status === "pending" || c.status === "skipped" || c.status === "failed"; }).map((t) => {
    const noImg = !promoOf.get(t.item_id);
    const status: TargetStatus = !t.ready || noImg ? "skipped" : "pending";
    return {
      campaign_id: campaign.id, item_id: t.item_id, parent_sku_id: t.parent_sku_id, platform: t.platform, target_key: t.target_key, brand_id: t.brand_id, label: t.label,
      before_cover_url: t.before_cover_url, status, error: noImg ? "รุ่นนี้ยังไม่มีปกโปร" : t.reason, attempts: 0, updated_at: new Date().toISOString(),
    };
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("promo_cover_targets").upsert(rows.slice(i, i + 200), { onConflict: "item_id,platform,target_key" });
    if (error) throw new Error(`บันทึกรายการร้านไม่สำเร็จ: ${error.message}`);
  }
  const drop = cur.filter((t) => !want.has(k(t)) && (t.status === "pending" || t.status === "skipped" || t.status === "failed")).map((t) => t.id);
  for (let i = 0; i < drop.length; i += 200) await admin.from("promo_cover_targets").delete().in("id", drop.slice(i, i + 200));
  return { created: rows.filter((r) => r.status === "pending").length, skipped: rows.filter((r) => r.status === "skipped").length, removed: drop.length };
}

// ───────── รูป: กรอบโปร + สำเนาปกเดิม ─────────
async function fetchBytes(url: string, label: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`โหลด${label}ไม่ได้ (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.byteLength) throw new Error(`${label}ว่างเปล่า`);
  return buf;
}

/** อ่านไฟล์ทั้งไฟล์ตรงจากคลังรูป (อ่านจนจบ — ไม่ยกเลิกกลางทาง) */
async function readR2(key: string): Promise<Buffer> {
  const obj = await r2GetObject(key);
  if (!obj) throw new Error("ไม่พบไฟล์ในคลังรูป");
  const buf = Buffer.from(await new Response(obj.body).arrayBuffer());
  if (!buf.byteLength) throw new Error("ไฟล์ว่างเปล่า");
  return buf;
}

/** แปะกรอบโปร (PNG พื้นใส) ทับปกของรุ่น → JPG จัตุรัส 1500px ในคลังรูปเรา · คืน r2 key */
export async function composeFramedCover(baseKey: string, frameKey: string, outKey: string): Promise<string> {
  const SIZE = 1500;
  const [base, frame] = await Promise.all([
    fetchBytes(`${publicImageUrl(baseKey)}&w=${SIZE}&sq=1`, "ปกของรุ่น"),
    readR2(frameKey).catch(() => fetchBytes(publicImageUrl(frameKey), "รูปกรอบโปร")),   // อ่านไฟล์ตรงจากคลัง = พื้นใสครบ (ไม่ผ่านตัวย่อรูป)
  ]);
  const baseSq = await sharp(base).rotate().resize(SIZE, SIZE, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).toBuffer();
  const frameSq = await sharp(frame).resize(SIZE, SIZE, { fit: "fill" }).png().toBuffer();
  const out = await sharp(baseSq).composite([{ input: frameSq, top: 0, left: 0 }]).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  await r2PutObject(outKey, out, "image/jpeg");
  return outKey;
}

/** สร้างปกโปรจากกรอบให้รุ่นที่เลือกวิธี "กรอบ" (หรือยังไม่มีปก) — ทีละไม่เกิน limit รุ่น (เรียกซ้ำจนครบ) */
export async function applyFrameToItems(admin: Admin, campaign: CampaignRow, items: ItemRow[], opts: { limit?: number; only?: string[] } = {}): Promise<{ done: number; failed: { parent_sku_id: string; error: string }[]; left: number }> {
  if (!campaign.frame_key) throw new Error("ยังไม่ได้อัปรูปกรอบโปร");
  const todo = items.filter((i) => (opts.only ? opts.only.includes(i.id) : i.source === "frame" && !i.promo_key));
  const batch = todo.slice(0, opts.limit ?? 8);
  const { data: parents } = batch.length ? await admin.from("parent_skus_v2").select("id, code, cover_image_r2_key").in("id", batch.map((b) => b.parent_sku_id)) : { data: [] };
  const coverOf = new Map(((parents ?? []) as { id: string; code: string; cover_image_r2_key: string | null }[]).map((p) => [p.id, p]));
  const failed: { parent_sku_id: string; error: string }[] = [];
  let done = 0;
  for (const it of batch) {
    const p = coverOf.get(it.parent_sku_id);
    if (!p?.cover_image_r2_key) { failed.push({ parent_sku_id: it.parent_sku_id, error: `${p?.code ?? "รุ่นนี้"} ยังไม่มีรูปปกในระบบ — อัปปกโปรเองแทน` }); continue; }
    try {
      const key = await composeFramedCover(p.cover_image_r2_key, campaign.frame_key, framedKeyOf(campaign.id, it.parent_sku_id, Date.now()));
      await admin.from("promo_cover_items").update({ promo_key: key, source: "frame", updated_at: new Date().toISOString() }).eq("id", it.id);
      done++;
    } catch (e) { failed.push({ parent_sku_id: it.parent_sku_id, error: `${p.code}: ${errText(e)}` }); }
  }
  return { done, failed, left: Math.max(0, todo.length - batch.length) };
}

/** เก็บสำเนาปกเดิมของร้านไว้ในคลังรูปเรา (best-effort — พลาดไม่หยุดการส่ง) */
async function backupCover(url: string | null, key: string): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const buf = await fetchBytes(url, "ปกเดิม");
    const jpg = await sharp(buf).rotate().jpeg({ quality: 92 }).toBuffer();
    await r2PutObject(key, jpg, "image/jpeg");
    return key;
  } catch (e) { console.warn(`[promo-cover] เก็บสำเนาปกเดิมไม่ได้: ${errText(e)}`); return null; }
}

// ───────── ตัวส่ง/ย้อนรายร้าน ─────────
type Outcome = { status: TargetStatus; error?: string | null; before_refs?: unknown; before_cover_url?: string | null; backup_key?: string | null; applied_ref?: string | null; note?: string };

async function auditListing(admin: Admin, t: TargetRow, actor: Actor, kind: "apply" | "revert", meta: Record<string, unknown>) {
  await writeAudit(admin, {
    action: "update", entityType: t.platform === "website" ? "store_listing" : "platform_catalog", entityId: t.platform === "website" ? t.target_key : t.target_key,
    actorId: actor.id, actorName: actor.name ?? "ตัวตั้งเวลาเปลี่ยนปกโปร",
    metadata: { source: "promo_cover", kind, campaign_id: t.campaign_id, target_id: t.id, parent_sku_id: t.parent_sku_id, platform: t.platform,
      changes: [{ field: "cover", label: "รูปปก", old: meta.old ?? null, new: meta.new ?? null }], ...meta },
  });
}

// Shopee — รูป = image_id · ปกโปรฝากเป็นรูปใหม่ · ย้อน = ใส่ image_id เดิมกลับ (สำรอง: ฝากสำเนาปกเดิมใหม่)
async function shopeeApply(admin: Admin, t: TargetRow, promoKey: string): Promise<Outcome> {
  const r = await loadShopeeListingLive(admin, t.target_key, null);
  if (!r.ok) return { status: "failed", error: r.error };
  const ids = r.view.imageIds.filter(Boolean);
  const refs = swapCover(ids.map(shopeeImageRef), `r2:${promoKey}`);
  const plan = planShopeeImages(r.view, refs);
  if (plan.errors.length) return { status: "failed", error: plan.errors.join(" · ") };
  const ratio = r.view.imageRatio === "3:4" ? "3:4" as const : "1:1" as const;
  const up = await shopeeUploadRef(`r2:${promoKey}`, ratio);
  const sent = [up.imageId, ...ids.slice(1)];
  try { await shopeeUpdateItem(r.accessToken, r.shopId, r.itemId, { image: { image_id_list: sent, ...(ratio === "3:4" ? { image_ratio: "3:4" } : {}) } }); }
  catch (e) { return { status: "failed", error: `แก้รูปบน Shopee ไม่สำเร็จ: ${shopeeErrorText(e)}` }; }
  const backup = await backupCover(r.view.images[0] ?? null, backupKeyOf(t.campaign_id, t.id));
  return { status: "applied", before_refs: { ids, urls: r.view.images, ratio }, before_cover_url: r.view.images[0] ?? null, backup_key: backup, applied_ref: up.imageId };
}
async function shopeeRevert(admin: Admin, t: TargetRow, force: boolean): Promise<Outcome> {
  const r = await loadShopeeListingLive(admin, t.target_key, null);
  if (!r.ok) return { status: "revert_failed", error: r.error };
  const before = (t.before_refs ?? {}) as { ids?: string[]; ratio?: string };
  const orig = strList(before.ids)[0] ?? null;
  const cur = r.view.imageIds.filter(Boolean);
  const plan = restoreCover(cur, t.applied_ref, orig, { force, same: (a, b) => a === b });
  if (!plan.ok) return { status: force ? "revert_failed" : "conflict", error: plan.reason };
  if (plan.already) return { status: "reverted", note: "ปกบนร้านเป็นปกเดิมอยู่แล้ว" };
  const ratio = r.view.imageRatio === "3:4" ? "3:4" as const : "1:1" as const;
  const send = async (list: string[]) => shopeeUpdateItem(r.accessToken, r.shopId, r.itemId, { image: { image_id_list: list, ...(ratio === "3:4" ? { image_ratio: "3:4" } : {}) } });
  try { await send(plan.list); }
  catch (e) {
    if (!t.backup_key) return { status: "revert_failed", error: `ย้อนปกบน Shopee ไม่สำเร็จ: ${shopeeErrorText(e)}` };
    try { const up = await shopeeUploadRef(`r2:${t.backup_key}`, ratio); await send([up.imageId, ...plan.list.slice(1)]); }
    catch (e2) { return { status: "revert_failed", error: `ย้อนปกบน Shopee ไม่สำเร็จ: ${shopeeErrorText(e2)}` }; }
  }
  return { status: "reverted" };
}

// Lazada — รูป = ลิงก์ของ Lazada · ปกโปรฝากผ่าน /image/migrate · ย้อน = ใส่ลิงก์เดิมกลับ
const lazSource = (key: string) => `${publicImageUrl(key)}&w=1500&sq=1`;
async function lazadaApply(admin: Admin, t: TargetRow, promoKey: string): Promise<Outcome> {
  const live = await loadLazListingLive(admin, t.target_key, null);
  if (!live.ok) return { status: "failed", error: live.error };
  const view = lazadaListingView(live.item);
  if (!view) return { status: "failed", error: "Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" };
  const state = lazadaEditStateFromView(view);
  const ref = `r2:${promoKey}`;
  const plan = planLazadaEdit(state, { ...state, images: swapCover(state.images, ref) });
  if (plan.errors.length) return { status: "failed", error: plan.errors.join(" · ") };
  let url: string;
  try { url = await lazMigrateImage(live.gateway, live.accessToken, lazMigrateImageXml(lazSource(promoKey))); }
  catch (e) { return { status: "failed", error: `ฝากปกโปรกับ Lazada ไม่สำเร็จ: ${lazErrorText(e)}` }; }
  const fields = { images: lazResolveRefs(plan.fields.images ?? [], new Map([[ref, url]])) };
  try { await lazUpdateProduct(live.gateway, live.accessToken, lazUpdateProductXml(live.itemId, view.skus.map((s) => ({ skuId: s.skuId, sellerSku: s.sellerSku, status: s.status })), fields)); }
  catch (e) { return { status: "failed", error: `แก้รูปบน Lazada ไม่สำเร็จ: ${lazErrorText(e)}` }; }
  const backup = await backupCover(state.images[0] ?? null, backupKeyOf(t.campaign_id, t.id));
  return { status: "review", before_refs: { images: state.images }, before_cover_url: state.images[0] ?? null, backup_key: backup, applied_ref: url, note: "Lazada ตรวจรูปใหม่ (ไม่เกิน 24 ชม.)" };
}
async function lazadaRevert(admin: Admin, t: TargetRow, force: boolean): Promise<Outcome> {
  const live = await loadLazListingLive(admin, t.target_key, null);
  if (!live.ok) return { status: "revert_failed", error: live.error };
  const view = lazadaListingView(live.item);
  if (!view) return { status: "revert_failed", error: "Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" };
  const orig = strList((t.before_refs as { images?: unknown } | null)?.images)[0] ?? null;
  const plan = restoreCover(view.images, t.applied_ref, orig, { force });
  if (!plan.ok) return { status: force ? "revert_failed" : "conflict", error: plan.reason };
  if (plan.already) return { status: "reverted", note: "ปกบนร้านเป็นปกเดิมอยู่แล้ว" };
  try { await lazUpdateProduct(live.gateway, live.accessToken, lazUpdateProductXml(live.itemId, view.skus.map((s) => ({ skuId: s.skuId, sellerSku: s.sellerSku, status: s.status })), { images: plan.list })); }
  catch (e) { return { status: "revert_failed", error: `ย้อนปกบน Lazada ไม่สำเร็จ: ${lazErrorText(e)}` }; }
  return { status: "reverted", note: "Lazada อาจตรวจรูปอีกรอบ" };
}

// TikTok — รูป = uri · ปกโปรฝาก (MAIN_IMAGE) · Partial Edit → TikTok ตรวจ (ระหว่างตรวจร้านยังใช้ของเดิม)
async function tiktokApply(admin: Admin, t: TargetRow, promoKey: string): Promise<Outcome> {
  const live = await loadTtsListingLive(admin, t.target_key, null);
  if (!live.ok) return { status: "failed", error: live.error };
  const view = await ttsViewWithReview(live.accessToken, live.cipher, live.detail);
  if (!view) return { status: "failed", error: "TikTok ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" };
  if (view.productStatus === "FREEZE" || view.productStatus === "DELETED") return { status: "skipped", error: "สินค้าถูกระงับ/ลบแล้ว" };
  const base = tiktokMediaBase(view);
  const uris = base.images.map((x) => x.uri).filter(Boolean);
  const plan = planTiktokMedia(uris, base.pkg, swapCover(uris.map(tiktokImageRef), `r2:${promoKey}`), base.pkg);
  if (plan.errors.length) return { status: "failed", error: plan.errors.join(" · ") };
  let uri: string;
  try { uri = await ttsUploadRef(live.accessToken, `r2:${promoKey}`); }
  catch (e) { return { status: "failed", error: `ฝากปกโปรกับ TikTok ไม่สำเร็จ: ${errText(e)}` }; }
  const isDraft = (view.status ?? view.productStatus) === "DRAFT";
  try { await ttsPartialEdit(live.accessToken, live.cipher, live.productId, { main_images: [uri, ...uris.slice(1)].map((u) => ({ uri: u })) }, isDraft ? { saveMode: "AS_DRAFT" } : {}); }
  catch (e) { return { status: "failed", error: `แก้รูปบน TikTok ไม่สำเร็จ: ${ttsErrorText(e)}` }; }
  const backup = await backupCover(base.images[0]?.url ?? null, backupKeyOf(t.campaign_id, t.id));
  return { status: "review", before_refs: { uris, urls: base.images.map((x) => x.url) }, before_cover_url: base.images[0]?.url ?? null, backup_key: backup, applied_ref: uri, note: "TikTok ตรวจก่อนขึ้นร้าน" };
}
async function tiktokRevert(admin: Admin, t: TargetRow, force: boolean): Promise<Outcome> {
  const live = await loadTtsListingLive(admin, t.target_key, null);
  if (!live.ok) return { status: "revert_failed", error: live.error };
  const view = await ttsViewWithReview(live.accessToken, live.cipher, live.detail);
  if (!view) return { status: "revert_failed", error: "TikTok ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" };
  const cur = tiktokMediaBase(view).images.map((x) => x.uri).filter(Boolean);
  const orig = strList((t.before_refs as { uris?: unknown } | null)?.uris)[0] ?? null;
  const plan = restoreCover(cur, t.applied_ref, orig, { force, same: (a, b) => a === b });
  if (!plan.ok) return { status: force ? "revert_failed" : "conflict", error: plan.reason };
  if (plan.already) return { status: "reverted", note: "ปกบนร้านเป็นปกเดิมอยู่แล้ว" };
  const isDraft = (view.status ?? view.productStatus) === "DRAFT";
  const send = (list: string[]) => ttsPartialEdit(live.accessToken, live.cipher, live.productId, { main_images: list.map((u) => ({ uri: tiktokUriOfRef(u) ?? u })) }, isDraft ? { saveMode: "AS_DRAFT" } : {});
  try { await send(plan.list); }
  catch (e) {
    if (!t.backup_key) return { status: "revert_failed", error: `ย้อนปกบน TikTok ไม่สำเร็จ: ${ttsErrorText(e)}` };
    try { const u = await ttsUploadRef(live.accessToken, `r2:${t.backup_key}`); await send([u, ...plan.list.slice(1)]); }
    catch (e2) { return { status: "revert_failed", error: `ย้อนปกบน TikTok ไม่สำเร็จ: ${ttsErrorText(e2)}` }; }
  }
  return { status: "reverted", note: "TikTok ตรวจก่อนปกเดิมขึ้น (ระหว่างตรวจยังเห็นปกโปร)" };
}

// LINE — รูป = ลิงก์ (ของ LINE หรือลิงก์สาธารณะของเรา) · ดึงสดก่อนแก้ทุกครั้ง
async function lineLoad(admin: Admin, t: TargetRow) {
  const { data: l } = await admin.from("platform_catalog_listings").select("id, platform_id, brand_id, external_product_id, raw").eq("id", t.target_key).maybeSingle();
  const row = l as { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; raw: Record<string, unknown> | null } | null;
  if (!row) return { ok: false as const, error: "ไม่พบสินค้านี้ (อาจถูกลบไปแล้ว)" };
  const productId = String(row.external_product_id ?? "").trim();
  if (!productId) return { ok: false as const, error: "รายการนี้ไม่มีรหัสสินค้าบน LINE" };
  const key = await lineApiKey(admin, row.brand_id, row.platform_id);
  if (!key.apiKey) return { ok: false as const, error: key.error ?? "ยังไม่ได้ใส่ API Key ของ LINE" };
  const fresh = await lineGetProduct(key.apiKey, productId);
  const lineRaw = fresh.ok && fresh.row ? fresh.row : row.raw?.line;
  const state = lineEditStateFromRaw(lineRaw);
  if (!state) return { ok: false as const, error: fresh.error ?? "ดึงสินค้าจาก LINE ไม่ได้" };
  return { ok: true as const, row, productId, apiKey: key.apiKey, state };
}
async function lineSaveCopy(admin: Admin, ld: { row: { id: string; raw: Record<string, unknown> | null }; apiKey: string; productId: string }): Promise<string[] | null> {
  const fresh = await lineGetProduct(ld.apiKey, ld.productId);
  if (!fresh.ok || !fresh.row) return null;
  await admin.from("platform_catalog_listings").update({ raw: { ...(ld.row.raw ?? {}), line: fresh.row }, updated_at: new Date().toISOString() }).eq("id", ld.row.id);
  return lineEditStateFromRaw(fresh.row)?.images ?? null;
}
async function lineApply(admin: Admin, t: TargetRow, promoKey: string): Promise<Outcome> {
  const ld = await lineLoad(admin, t);
  if (!ld.ok) return { status: "failed", error: ld.error };
  const before = ld.state.images;
  const plan = planLineEdit(ld.state, { ...ld.state, images: swapCover(before, `r2:${promoKey}`) });
  if (plan.errors.length) return { status: "failed", error: plan.errors.join(" · ") };
  const promoUrl = `${publicImageUrl(promoKey)}&w=1500&sq=1`;
  const urls = (plan.fields.imageUrls ?? swapCover(before, `r2:${promoKey}`)).map((u) => (systemImageKey(u) ? promoUrl : u));
  const r = await lineUpdateProduct(ld.apiKey, ld.productId, { imageUrls: urls });
  if (!r.ok) return { status: "failed", error: `แก้รูปบน LINE ไม่สำเร็จ: ${r.error ?? `HTTP ${r.status}`}` };
  const after = await lineSaveCopy(admin, ld);
  const backup = await backupCover(before[0] ?? null, backupKeyOf(t.campaign_id, t.id));
  return { status: "applied", before_refs: { images: before }, before_cover_url: before[0] ?? null, backup_key: backup, applied_ref: after?.[0] ?? promoUrl };
}
async function lineRevert(admin: Admin, t: TargetRow, force: boolean): Promise<Outcome> {
  const ld = await lineLoad(admin, t);
  if (!ld.ok) return { status: "revert_failed", error: ld.error };
  const orig = strList((t.before_refs as { images?: unknown } | null)?.images)[0] ?? null;
  const plan = restoreCover(ld.state.images, t.applied_ref, orig, { force });
  if (!plan.ok) return { status: force ? "revert_failed" : "conflict", error: plan.reason };
  if (plan.already) return { status: "reverted", note: "ปกบนร้านเป็นปกเดิมอยู่แล้ว" };
  let r = await lineUpdateProduct(ld.apiKey, ld.productId, { imageUrls: plan.list });
  if (!r.ok && t.backup_key) r = await lineUpdateProduct(ld.apiKey, ld.productId, { imageUrls: [`${publicImageUrl(t.backup_key)}`, ...plan.list.slice(1)] });
  if (!r.ok) return { status: "revert_failed", error: `ย้อนปกบน LINE ไม่สำเร็จ: ${r.error ?? `HTTP ${r.status}`}` };
  await lineSaveCopy(admin, ld);
  return { status: "reverted" };
}

// เว็บเรา — store_listings.web_images (ว่าง = ใช้รูปอัตโนมัติ → คิดรูปอัตโนมัติก่อน แล้วแทนรูปแรก) · ย้อน = คืนค่าเดิมทั้งช่อง
async function websiteAutoImages(admin: Admin, shopId: string, parentId: string, listing: Record<string, unknown>): Promise<string[]> {
  const [{ data: shop }, { data: parent }, { data: kids }] = await Promise.all([
    admin.from("shops").select("field_map").eq("id", shopId).maybeSingle(),
    admin.from("parent_skus_v2").select("*").eq("id", parentId).maybeSingle(),
    admin.from("skus_v2").select(CHILD_SELECT).eq("parent_sku_id", parentId).eq("is_active", true).order("code"),
  ]);
  if (!parent) return [];
  const r = resolveProduct(normalizeFieldMap((shop as { field_map?: unknown } | null)?.field_map), parent as never, (kids ?? []) as never, { ...listing, web_images: null } as never, null);
  return r.images;
}
async function websiteApply(admin: Admin, t: TargetRow, promoKey: string): Promise<Outcome> {
  const { data } = await admin.from("store_listings").select("web_images, web_sku_images, is_published").eq("shop_id", t.target_key).eq("parent_sku_id", t.parent_sku_id).maybeSingle();
  if (!data) return { status: "failed", error: "ไม่พบสินค้านี้บนเว็บ (อาจถูกเอาออกแล้ว)" };
  const row = data as { web_images: unknown; web_sku_images: unknown };
  const own = strList(row.web_images);
  const base = own.length ? own : await websiteAutoImages(admin, t.target_key, t.parent_sku_id, row as Record<string, unknown>);
  const patch = listingPatchToRow({ webImages: swapCover(base, promoKey) });
  const { error } = await admin.from("store_listings").update({ ...patch, updated_at: new Date().toISOString() }).eq("shop_id", t.target_key).eq("parent_sku_id", t.parent_sku_id);
  if (error) return { status: "failed", error: `บันทึกรูปบนเว็บไม่สำเร็จ: ${error.message}` };
  await purgeStorefrontCache(admin, t.target_key);
  await syncStoreListingUsages(admin, [{ shopId: t.target_key, parentId: t.parent_sku_id }]);
  const first = base[0] ?? null;
  return { status: "applied", before_refs: { web_images: row.web_images ?? null, base }, before_cover_url: first ? `/api/r2-image?key=${encodeURIComponent(first)}&w=300` : null, backup_key: first, applied_ref: promoKey };
}
async function websiteRevert(admin: Admin, t: TargetRow, force: boolean): Promise<Outcome> {
  const { data } = await admin.from("store_listings").select("web_images").eq("shop_id", t.target_key).eq("parent_sku_id", t.parent_sku_id).maybeSingle();
  if (!data) return { status: "reverted", note: "สินค้านี้ไม่อยู่บนเว็บแล้ว" };
  const cur = strList((data as { web_images: unknown }).web_images);
  const before = (t.before_refs ?? {}) as { web_images?: unknown; base?: unknown };
  if (!force && cur[0] !== t.applied_ref) return { status: "conflict", error: "รูปแรกบนเว็บไม่ใช่ปกโปรของเราแล้ว (มีคนเปลี่ยนเองระหว่างโปร) — ไม่ย้อนทับ · ถ้าจะเอาปกเดิมกลับจริง กด \"ย้อนทับเลย\"" };
  // ไม่มีใครแตะรูปอื่น = คืนค่าเดิมทั้งช่อง (รวม "ใช้รูปอัตโนมัติ" = ว่าง) · มีคนแก้รูปอื่นระหว่างโปร = เปลี่ยนเฉพาะรูปแรกกลับ
  const origList = strList(before.web_images);
  const base = strList(before.base);
  const untouched = cur.slice(1).join("\n") === base.slice(1).join("\n");
  let next: string[] | null;
  if (untouched) next = origList.length ? origList : null;
  else next = base[0] ? [base[0], ...cur.slice(1).filter((k) => k !== base[0])] : cur.slice(1);
  const value = next == null ? null : (listingPatchToRow({ webImages: next }).web_images ?? next);
  const { error } = await admin.from("store_listings").update({ web_images: value, updated_at: new Date().toISOString() }).eq("shop_id", t.target_key).eq("parent_sku_id", t.parent_sku_id);
  if (error) return { status: "revert_failed", error: `ย้อนรูปบนเว็บไม่สำเร็จ: ${error.message}` };
  await purgeStorefrontCache(admin, t.target_key);
  await syncStoreListingUsages(admin, [{ shopId: t.target_key, parentId: t.parent_sku_id }]);
  return { status: "reverted" };
}

const APPLY: Record<PromoPlatform, (a: Admin, t: TargetRow, key: string) => Promise<Outcome>> = {
  shopee: shopeeApply, lazada: lazadaApply, tiktok: tiktokApply, line_shopping: lineApply, website: websiteApply,
};
const REVERT: Record<PromoPlatform, (a: Admin, t: TargetRow, force: boolean) => Promise<Outcome>> = {
  shopee: shopeeRevert, lazada: lazadaRevert, tiktok: tiktokRevert, line_shopping: lineRevert, website: websiteRevert,
};

async function saveOutcome(admin: Admin, t: TargetRow, o: Outcome, kind: "apply" | "revert"): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: o.status, error: o.error ?? (o.note ?? null), attempts: t.attempts + 1, updated_at: now };
  if (kind === "apply" && (o.status === "applied" || o.status === "review")) {
    patch.applied_at = now; patch.before_refs = o.before_refs ?? null; patch.before_cover_url = o.before_cover_url ?? t.before_cover_url;
    patch.backup_key = o.backup_key ?? null; patch.applied_ref = o.applied_ref ?? null; patch.notified_at = null;
  }
  if (o.status === "reverted") patch.reverted_at = now;
  if (ALERT_STATUS.has(o.status)) patch.notified_at = null;
  await admin.from("promo_cover_targets").update(patch).eq("id", t.id);
}

/** ส่งปกโปร 1 รายการ (ยิงร้านจริง) */
export async function applyTarget(admin: Admin, t: TargetRow, promoKey: string | null, actor: Actor): Promise<Outcome> {
  let o: Outcome;
  if (!promoKey) o = { status: "skipped", error: "รุ่นนี้ยังไม่มีปกโปร" };
  else {
    try { o = await APPLY[t.platform](admin, t, promoKey); }
    catch (e) { o = { status: "failed", error: errText(e) }; }
  }
  await saveOutcome(admin, t, o, "apply");
  if (o.status !== "skipped") await auditListing(admin, t, actor, "apply", { ok: o.status === "applied" || o.status === "review", status: o.status, error: o.error ?? null, old: o.before_cover_url ?? null, new: promoKey });
  return o;
}

/** ย้อนปกเดิม 1 รายการ (ยิงร้านจริง) · force = ทับแม้รูปแรกไม่ใช่ปกโปรของเรา */
export async function revertTarget(admin: Admin, t: TargetRow, actor: Actor, force = false): Promise<Outcome> {
  let o: Outcome;
  try { o = await REVERT[t.platform](admin, t, force); }
  catch (e) { o = { status: "revert_failed", error: errText(e) }; }
  await saveOutcome(admin, t, o, "revert");
  await auditListing(admin, t, actor, "revert", { ok: o.status === "reverted", status: o.status, error: o.error ?? null, force, old: t.applied_ref, new: t.before_cover_url });
  return o;
}

// ───────── รอบทำงาน ─────────
export type RunResult = { applied: number; reverted: number; failed: number; conflict: number; remaining: number; campaigns: number; timedOut: boolean };

/**
 * ทำงานที่ถึงเวลาแล้ว (ส่ง/ย้อน) จนหมดหรือหมดเวลา budgetMs — เรียกซ้ำได้ ไม่ทำซ้ำของที่ทำไปแล้ว
 *   campaignId = เฉพาะชุดนี้ (ปุ่มในหน้า) · ไม่ส่ง = ทุกชุด (ตัวตั้งเวลา)
 */
export async function runPromoCovers(admin: Admin, opts: { campaignId?: string; budgetMs: number; actor: Actor; now?: number }): Promise<RunResult> {
  const started = Date.now();
  const now = opts.now ?? Date.now();
  const res: RunResult = { applied: 0, reverted: 0, failed: 0, conflict: 0, remaining: 0, campaigns: 0, timedOut: false };
  let q = admin.from("promo_cover_campaigns").select(CAMPAIGN_COLS).in("status", ["scheduled", "live"]).is("deleted_at", null);
  if (opts.campaignId) q = q.eq("id", opts.campaignId);
  const { data: camps } = await q;
  for (const c of (camps ?? []) as CampaignRow[]) {
    res.campaigns++;
    const revert = isRevertDue(c, now);
    const { data: tg } = await admin.from("promo_cover_targets").select(TARGET_COLS).eq("campaign_id", c.id);
    const targets = (tg ?? []) as TargetRow[];
    const { data: it } = await admin.from("promo_cover_items").select(ITEM_COLS).eq("campaign_id", c.id);
    const promoOf = new Map(((it ?? []) as ItemRow[]).map((i) => [i.id, i.promo_key]));
    const work = revert
      ? targets.filter((t) => t.status === "applied" || t.status === "review" || t.status === "pending")
      : targets.filter((t) => t.status === "pending" && isApplyDue(c, t.platform, now));
    for (const t of work) {
      if (Date.now() - started > opts.budgetMs) { res.timedOut = true; break; }
      if (revert && t.status === "pending") {   // หมดเวลาโปรก่อนได้ส่ง
        await admin.from("promo_cover_targets").update({ status: "skipped", error: "หมดเวลาโปรก่อนได้ส่ง", updated_at: new Date().toISOString() }).eq("id", t.id);
        t.status = "skipped"; continue;
      }
      const o = revert ? await revertTarget(admin, t, opts.actor) : await applyTarget(admin, t, promoOf.get(t.item_id) ?? null, opts.actor);
      t.status = o.status;
      if (o.status === "applied" || o.status === "review") res.applied++;
      else if (o.status === "reverted") res.reverted++;
      else if (o.status === "conflict") res.conflict++;
      else if (o.status === "failed" || o.status === "revert_failed") res.failed++;
    }
    const left = revert ? targets.filter((t) => t.status === "applied" || t.status === "review" || t.status === "pending").length
      : targets.filter((t) => t.status === "pending" && isApplyDue(c, t.platform, now)).length;
    res.remaining += left;
    const next = nextCampaignStatus(c, targets, now);
    if (next !== c.status) await setCampaignStatus(admin, c, next, opts.actor);
    await notifyFailures(admin, c, targets);
    if (res.timedOut) break;
  }
  return res;
}

async function setCampaignStatus(admin: Admin, c: CampaignRow, next: CampaignStatus, actor: Actor) {
  await admin.from("promo_cover_campaigns").update({ status: next, updated_at: new Date().toISOString() }).eq("id", c.id);
  await writeAudit(admin, { action: "update", entityType: "promo_cover_campaign", entityId: c.id, actorId: actor.id, actorName: actor.name ?? "ตัวตั้งเวลาเปลี่ยนปกโปร",
    metadata: { name: c.name, changes: [{ field: "status", label: "สถานะ", old: c.status, new: next }] } });
}

/** แจ้งเตือนรายการที่ส่ง/ย้อนไม่ผ่าน หรือมีคนเปลี่ยนปกเอง (ข้อเสนอ 3) — คนสร้างชุด + กฎแจ้งเตือน promo_cover.failed · แจ้งครั้งเดียวต่อรายการ */
async function notifyFailures(admin: Admin, c: CampaignRow, targets: TargetRow[]) {
  const { data } = await admin.from("promo_cover_targets").select("id, platform, label, status, error").eq("campaign_id", c.id).is("notified_at", null).in("status", [...ALERT_STATUS]);
  const bad = (data ?? []) as { id: string; platform: PromoPlatform; label: string | null; status: TargetStatus; error: string | null }[];
  if (!bad.length) return;
  void targets;
  try {
    const { ids } = await ruleRecipients(admin, EVENT_FAILED);
    const to = [...new Set([...(c.created_by ? [c.created_by] : []), ...(c.confirmed_by ? [c.confirmed_by] : []), ...ids])];
    if (to.length) {
      const fail = bad.filter((b) => b.status !== "conflict").length;
      const conf = bad.length - fail;
      const byPf = [...new Set(bad.map((b) => PLATFORM_LABEL[b.platform]))].join(", ");
      const body = [fail ? `ส่ง/ย้อนไม่ผ่าน ${fail} รายการ` : "", conf ? `มีคนเปลี่ยนปกเองระหว่างโปร ${conf} รายการ (ไม่ย้อนทับ)` : "", `ร้าน: ${byPf}`, bad[0]?.error ? `เช่น ${bad[0].error.slice(0, 120)}` : ""].filter(Boolean).join(" · ");
      const { error } = await admin.rpc("erp_notify", {
        p_user_ids: to, p_event_type: EVENT_FAILED, p_title: `เปลี่ยนปกโปร "${c.name}": มีรายการต้องดู`, p_body: body,
        p_link_url: `/master/promo-covers?id=${c.id}`, p_entity_type: "promo_cover_campaign", p_entity_id: c.id, p_priority: "high",
      });
      if (error) console.error("[promo-cover] erp_notify:", error.message);
    }
  } catch (e) { console.error("[promo-cover] แจ้งเตือนไม่สำเร็จ:", errText(e)); }
  await admin.from("promo_cover_targets").update({ notified_at: new Date().toISOString() }).in("id", bad.map((b) => b.id));
}

/** ชุดโปร + รุ่น (รหัส/ชื่อ/ปกในระบบ) + เป้าหมายรายร้าน */
export async function loadCampaignFull(admin: Admin, id: string) {
  const { data: c } = await admin.from("promo_cover_campaigns").select(CAMPAIGN_COLS).eq("id", id).maybeSingle();
  if (!c) return null;
  const [{ data: items }, { data: targets }] = await Promise.all([
    admin.from("promo_cover_items").select(ITEM_COLS).eq("campaign_id", id).order("sort_order").order("created_at"),
    admin.from("promo_cover_targets").select(TARGET_COLS).eq("campaign_id", id).order("platform").order("created_at"),
  ]);
  const its = (items ?? []) as ItemRow[];
  const { data: parents } = its.length ? await admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key, brand_id").in("id", its.map((i) => i.parent_sku_id)) : { data: [] };
  const pOf = new Map(((parents ?? []) as { id: string; code: string; name_th: string | null; cover_image_r2_key: string | null; brand_id: string | null }[]).map((p) => [p.id, p]));
  return {
    campaign: c as CampaignRow,
    items: its.map((i) => { const p = pOf.get(i.parent_sku_id); return { ...i, code: p?.code ?? "", name: p?.name_th ?? "", cover_key: p?.cover_image_r2_key ?? null, brand_id: p?.brand_id ?? null }; }),
    targets: (targets ?? []) as TargetRow[],
  };
}

/** ยังมีปกโปรค้างบนร้านไหม (ต้องย้อนก่อนลบชุด) */
export const hasOnShop = (targets: readonly { status: TargetStatus }[]) => targets.some((t) => ON_SHOP.has(t.status));
export { sameImageRef };
