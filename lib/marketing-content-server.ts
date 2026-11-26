/**
 * ดึงรีวิว + โพสต์ (ของกลาง · server เท่านั้น) — ใช้ที่ /api/cron/marketing-content + ปุ่ม "ดึงตอนนี้" ในแท็บรีวิว/คอนเทนต์
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-26 (แผนการตลาด รอบ 7 ข้อ 1 รีวิว Shopee · 2 ผลโพสต์ FB/IG · 6 ลองดึงวิดีโอ Shopee)
 * Shopee รีวิว: GET /api/v2/product/get_comment?cursor&page_size(≤100) (ไม่ใส่ item_id = ทั้งร้าน · ได้ล่าสุดสูงสุด 500)
 *   → item_comment_list[]: comment_id, comment, buyer_username, order_sn, item_id, rating_star, hidden, create_time,
 *      comment_reply{reply, create_time}, media{image_url_list}  (ชื่อช่องจากเอกสาร 2026-11-26)
 * Facebook: /{page_id}/posts (token เพจเดิม · สิทธิ์ pages_read_engagement) — reactions/comments summary + shares
 * Instagram: /{ig_user_id}/media — like_count / comments_count
 * วิดีโอ Shopee: /api/v2/video/get_video_performance_list — เอกสารบอกว่าเฉพาะแอปประเภท "Shopee Video Management" → ลองแล้วจดผล
 * สถานะดึงล่าสุด = ui_config `marketing_content_sync` (แสดงในแท็บ · ไม่มีข้อมูลลับ)
 * ⚠️ อ่านจากแพลตฟอร์มอย่างเดียว (ไม่ตอบรีวิว ไม่โพสต์)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { META_API } from "@/lib/meta-graph";
import { shopeeErrorText, shopeeFetch } from "@/lib/shopee";
import { bkkYmd, shiftYmd } from "@/lib/platform-dashboard-calc";
import { getPlatformId, shopeeTokenOrReason } from "@/app/api/shopee/shared";
import { shopeeConnectedBrandIds } from "@/app/api/shopee/orders-sync";
import { loadConn } from "@/app/api/meta/shared";

type Admin = ReturnType<typeof supabaseAdmin>;
type Obj = Record<string, unknown>;
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Obj[]) : []);
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const iso = (sec: unknown) => { const s = n(sec); return s > 0 ? new Date(s * 1000).toISOString() : null; };
export const CONTENT_SYNC_KEY = "marketing_content_sync";

/** คำตอบ get_comment → แถวรีวิว (pure) */
export function parseComments(j: Obj): { rows: Obj[]; more: boolean; next: string } {
  const r = obj(j.response);
  const rows = arr(r.item_comment_list).map((c) => {
    const reply = obj(c.comment_reply);
    return {
      comment_id: String(c.comment_id ?? ""), item_id: c.item_id != null ? String(c.item_id) : null, order_sn: (c.order_sn as string) ?? null,
      rating: n(c.rating_star) || null, comment: (c.comment as string) ?? null, buyer: (c.buyer_username as string) ?? null,
      images: Array.isArray(obj(c.media).image_url_list) && (obj(c.media).image_url_list as unknown[]).length ? obj(c.media).image_url_list : null,
      hidden: c.hidden === true, created_at_shop: iso(c.create_time),
      reply: (reply.reply as string) || null, replied_at: reply.reply ? iso(reply.create_time) : null,
    };
  }).filter((x) => x.comment_id);
  return { rows, more: r.more === true, next: String(r.next_cursor ?? "") };
}

/** โพสต์ Facebook → แถว (pure) */
export function parseFbPosts(list: readonly Obj[]): Obj[] {
  return list.map((p) => ({
    post_id: String(p.id ?? ""), message: (p.message as string) ?? null, permalink: (p.permalink_url as string) ?? null, media_type: "post",
    image_url: (p.full_picture as string) ?? null, posted_at: (p.created_time as string) ?? null,
    likes: n(obj(obj(p.reactions).summary).total_count), comments: n(obj(obj(p.comments).summary).total_count), shares: n(obj(p.shares).count), views: null,
  })).filter((x) => x.post_id);
}
/** โพสต์ Instagram → แถว (pure) */
export function parseIgMedia(list: readonly Obj[]): Obj[] {
  return list.map((m) => ({
    post_id: String(m.id ?? ""), message: (m.caption as string) ?? null, permalink: (m.permalink as string) ?? null, media_type: String(m.media_type ?? "").toLowerCase() || null,
    image_url: (m.thumbnail_url as string) ?? (m.media_url as string) ?? null, posted_at: (m.timestamp as string) ?? null,
    likes: n(m.like_count), comments: n(m.comments_count), shares: 0, views: null,
  })).filter((x) => x.post_id);
}

async function graphAll(url: string, maxPages = 3): Promise<Obj[]> {
  const out: Obj[] = [];
  let next: string | null = url;
  for (let i = 0; next && i < maxPages; i++) {
    const r = await fetch(next, { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as Obj;
    if (!r.ok || j.error) throw new Error(String(obj(j.error).message ?? `Meta HTTP ${r.status}`));
    out.push(...arr(j.data));
    const nx = obj(j.paging).next;
    next = typeof nx === "string" && nx.startsWith("https://graph.facebook.com/") ? nx : null;
  }
  return out;
}

async function upsert(admin: Admin, table: string, rows: Obj[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(error.message);
  }
}

type Part = { ok: boolean; count: number; error?: string | null; at: string };
export type ContentSyncStatus = { at: string; reviews: Part; facebook: Part; instagram: Part; shopee_video: Part };

export async function syncMarketingContent(admin: Admin, opts: { deadline: number }): Promise<ContentSyncStatus> {
  const at = new Date().toISOString();
  const status: ContentSyncStatus = { at, reviews: { ok: true, count: 0, at }, facebook: { ok: true, count: 0, at }, instagram: { ok: true, count: 0, at }, shopee_video: { ok: false, count: 0, at, error: "ยังไม่ได้ลอง" } };
  const errs = { reviews: [] as string[], facebook: [] as string[], instagram: [] as string[] };

  // ── รีวิว Shopee ──
  const spId = await getPlatformId(admin, "shopee");
  const spBrands = spId ? await shopeeConnectedBrandIds(admin, spId) : [];
  let videoTok: { accessToken: string; shopId: string } | null = null;
  for (const brandId of spBrands) {
    if (Date.now() > opts.deadline) { errs.reviews.push("หมดเวลารอบนี้"); break; }
    const tok = await shopeeTokenOrReason(admin, brandId, spId as string, null);
    if (!tok.ok) { errs.reviews.push(tok.reason); continue; }
    videoTok ??= { accessToken: tok.accessToken, shopId: tok.shopId };
    try {
      const rows: Obj[] = [];
      let cursor = "";
      for (let i = 0; i < 5; i++) {
        const r = parseComments(await shopeeFetch("/api/v2/product/get_comment", { accessToken: tok.accessToken, shopId: tok.shopId, query: { cursor, page_size: 100 } }));
        rows.push(...r.rows);
        if (!r.more || !r.next) break;
        cursor = r.next;
      }
      const now = new Date().toISOString();
      await upsert(admin, "marketing_reviews", rows.map((r) => ({ ...r, platform: "shopee", brand_id: brandId, updated_at: now })), "platform,comment_id");
      status.reviews.count += rows.length;
    } catch (e) { errs.reviews.push(shopeeErrorText(e)); }
  }

  // ── Facebook / Instagram (การเชื่อมเพจเดิม) ──
  const fbId = await getPlatformId(admin, "facebook");
  if (fbId) {
    const { data } = await admin.from("platform_credentials").select("brand_id, meta").eq("platform_id", fbId);
    const since = Math.floor(Date.parse(`${shiftYmd(bkkYmd(Date.now()) as string, -90)}T00:00:00+07:00`) / 1000);
    for (const c of (data ?? []) as { brand_id: string; meta: { stage?: string } | null }[]) {
      if (c.meta?.stage !== "connected" || Date.now() > opts.deadline) continue;
      const conn = await loadConn(admin, c.brand_id, fbId);
      if (!conn?.token || !conn.meta.page_id) continue;
      const now = new Date().toISOString();
      try {
        const q = new URLSearchParams({ fields: "id,message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)", since: String(since), limit: "100", access_token: conn.token });
        const rows = parseFbPosts(await graphAll(`${META_API}/${conn.meta.page_id}/posts?${q}`));
        await upsert(admin, "marketing_social_posts", rows.map((r) => ({ ...r, platform: "facebook", brand_id: c.brand_id, updated_at: now })), "platform,post_id");
        status.facebook.count += rows.length;
      } catch (e) { errs.facebook.push(`Facebook: ${e instanceof Error ? e.message : String(e)}`); }
      if (conn.meta.ig_user_id) {
        try {
          const q = new URLSearchParams({ fields: "id,caption,timestamp,permalink,media_type,thumbnail_url,media_url,like_count,comments_count", limit: "100", access_token: conn.token });
          const rows = parseIgMedia(await graphAll(`${META_API}/${conn.meta.ig_user_id}/media?${q}`)).filter((r) => !r.posted_at || Date.parse(String(r.posted_at)) / 1000 >= since);
          await upsert(admin, "marketing_social_posts", rows.map((r) => ({ ...r, platform: "instagram", brand_id: c.brand_id, updated_at: now })), "platform,post_id");
          status.instagram.count += rows.length;
        } catch (e) { errs.instagram.push(`Instagram: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
  }

  // ── ลองวิดีโอ Shopee (เอกสารบอกว่าเฉพาะแอปประเภท Shopee Video Management) ──
  if (videoTok && Date.now() < opts.deadline) {
    try {
      const j = await shopeeFetch("/api/v2/video/get_video_performance_list", { ...videoTok, query: { page_no: 1, page_size: 20, period_type: "Last30d", end_date: shiftYmd(bkkYmd(Date.now()) as string, -1), order_by: "Views", sort: "desc" } });
      const list = arr(obj(j.response).list);
      const now = new Date().toISOString();
      const rows = list.map((v) => ({
        platform: "shopee_video", brand_id: null, post_id: String(v.post_id || v.video_upload_id || ""), message: (v.caption as string) ?? null, permalink: (v.video_url as string) ?? null,
        media_type: "video", image_url: (v.cover_image_url as string) ?? null, posted_at: n(v.post_time) ? new Date(n(v.post_time)).toISOString() : null,
        likes: n(v.likes ?? v.like_count), comments: n(v.comments ?? v.comment_count), shares: n(v.shares ?? v.share_count), views: n(v.views ?? v.view_count) || null, updated_at: now,
      })).filter((x) => x.post_id);
      await upsert(admin, "marketing_social_posts", rows, "platform,post_id");
      status.shopee_video = { ok: true, count: rows.length, at };
    } catch (e) {
      status.shopee_video = { ok: false, count: 0, at, error: `Shopee ไม่ให้ดึงวิดีโอ: ${shopeeErrorText(e)} — API นี้เปิดให้เฉพาะแอปประเภท "Shopee Video Management"` };
    }
  }

  for (const k of ["reviews", "facebook", "instagram"] as const) if (errs[k].length) status[k] = { ...status[k], ok: status[k].count > 0, error: errs[k][0] };
  await admin.from("ui_config").upsert({ key: CONTENT_SYNC_KEY, value: status, updated_at: at }, { onConflict: "key" });
  return status;
}
