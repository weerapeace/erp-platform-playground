/**
 * ⭐ รีวิวสินค้า — ส่วนที่อ่าน/เขียนฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎ: lib/website-reviews.ts
 * ใช้ที่: /api/public/storefront/reviews (+ /verify) · /api/public/storefront/products (ดาวเฉลี่ย) · /api/website/reviews (แท็บ ⭐ รีวิว)
 */
import { sniffImage } from "@/lib/website-payments";
import { r2DeleteObject, r2PutObject } from "@/lib/r2";
import { adjustPoints } from "@/lib/member-points-db";
import { writeAudit } from "@/lib/audit";
import type { SiteInfo } from "@/lib/website-site-info";
import {
  autoApprove,
  publicAuthor,
  reviewPoints,
  summarize,
  REVIEWABLE_ORDER_STATUSES,
  REVIEW_MAX_BYTES,
  REVIEW_MAX_IMAGES,
  type PublicReview,
  type RatingSummary,
  type ReviewEntryInput,
  type ReviewStatus,
} from "@/lib/website-reviews";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export interface ReviewRow {
  id: string;
  shop_id: string;
  parent_code: string;
  product_name: string | null;
  variant_label: string | null;
  order_id: string | null;
  customer_id: string | null;
  rating: number;
  body: string;
  author_name: string;
  images: string[];
  status: ReviewStatus;
  verified: boolean;
  lang: string;
  reply: string | null;
  replied_at: string | null;
  points_awarded: number;
  moderated_by_name: string | null;
  moderated_at: string | null;
  created_at: string;
}

interface OrderLite {
  id: string;
  shop_id: string;
  order_no: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_id: string | null;
}

/** หน้า "ตามออเดอร์" / ฟอร์มรีวิว: เลขออเดอร์ + เบอร์ → id ออเดอร์ที่รีวิวได้ */
export async function findReviewableOrder(sb: Admin, shopId: string, orderNo: string, phone: string): Promise<{ ok: true; orderId: string } | { ok: false; status: number; error: string; errorEn: string }> {
  const no = String(orderNo ?? "").trim().toUpperCase().slice(0, 40);
  const ph = digits(phone);
  if (!no || ph.length < 9) return { ok: false, status: 400, error: "กรอกเลขที่ออเดอร์และเบอร์โทร", errorEn: "Enter your order number and phone." };
  const { data } = await sb.from("store_orders").select("id, shop_id, order_no, status, customer_phone").eq("shop_id", shopId).eq("order_no", no).maybeSingle();
  const o = data as Pick<OrderLite, "id" | "status" | "customer_phone"> | null;
  if (!o || digits(o.customer_phone).slice(-9) !== ph.slice(-9)) return { ok: false, status: 404, error: "ไม่พบออเดอร์ — ตรวจเลขที่และเบอร์โทรอีกครั้ง", errorEn: "Order not found — please check the order number and phone." };
  if (!(REVIEWABLE_ORDER_STATUSES as readonly string[]).includes(o.status)) return { ok: false, status: 409, error: "รีวิวได้หลังร้านจัดส่งสินค้าแล้ว", errorEn: "You can review once your order has shipped." };
  return { ok: true, orderId: o.id };
}

export interface ReviewableItem {
  code: string;
  name: string;
  variant: string | null;
  reviewed: boolean;
}

/** สินค้าในออเดอร์ที่รีวิวได้ (ไม่รวมเข็มขัดสั่งทำ/บรรทัดไม่มีรหัสรุ่น) */
export async function orderReviewItems(sb: Admin, shopId: string, orderId: string): Promise<{ order: OrderLite; items: ReviewableItem[] } | null> {
  const { data } = await sb.from("store_orders").select("id, shop_id, order_no, status, customer_name, customer_phone, customer_id").eq("id", orderId).eq("shop_id", shopId).maybeSingle();
  const order = data as OrderLite | null;
  if (!order || !(REVIEWABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) return null;
  const [{ data: lines }, { data: done }] = await Promise.all([
    sb.from("store_order_items").select("parent_code, name, variant_label").eq("order_id", orderId),
    sb.from("store_reviews").select("parent_code").eq("order_id", orderId),
  ]);
  const reviewed = new Set(((done ?? []) as { parent_code: string }[]).map((r) => r.parent_code));
  const seen = new Set<string>();
  const items: ReviewableItem[] = [];
  for (const l of (lines ?? []) as { parent_code: string | null; name: string; variant_label: string | null }[]) {
    const code = String(l.parent_code ?? "").trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    items.push({ code, name: l.name, variant: l.variant_label, reviewed: reviewed.has(code) });
  }
  return { order, items };
}

const extOf = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");

/** อัปรูปรีวิวขึ้น R2 (รูปจริงเท่านั้น · ไม่เกิน 6MB) → r2 key */
async function uploadReviewImages(shopId: string, files: File[]): Promise<{ keys: string[]; error?: string; errorEn?: string }> {
  const keys: string[] = [];
  for (const f of files.slice(0, REVIEW_MAX_IMAGES)) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (!bytes.length) continue;
    if (bytes.length > REVIEW_MAX_BYTES) return { keys, error: "รูปใหญ่เกิน 6MB ต่อรูป", errorEn: "Each photo must be under 6MB." };
    const mime = sniffImage(bytes);
    if (!mime) return { keys, error: "ไฟล์ต้องเป็นรูป JPG / PNG / WEBP", errorEn: "Photos must be JPG, PNG or WEBP." };
    const month = new Date().toISOString().slice(0, 7);
    const key = `storefront-reviews/${shopId}/${month}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extOf(mime)}`;
    await r2PutObject(key, bytes, mime);
    keys.push(key);
  }
  return { keys };
}

export interface SubmitEntry extends ReviewEntryInput {
  files: File[];
}

export type SubmitResult = { ok: true; saved: number; approved: number; points: number } | { ok: false; status: number; error: string; errorEn: string };

/**
 * บันทึกรีวิว — ซื้อจริง (orderId) หรือแขก (ร้านปิด "เฉพาะคนซื้อ") · ข้ามรุ่นที่รีวิวไปแล้ว/ไม่อยู่ในออเดอร์
 * อนุมัติอัตโนมัติตามกฎ → ให้แต้มทันที (ครั้งเดียว)
 */
export async function submitReviews(
  sb: Admin,
  args: { shopId: string; info: SiteInfo; orderId: string | null; author: string; lang: "th" | "en"; entries: SubmitEntry[] },
): Promise<SubmitResult> {
  const { shopId, info } = args;
  if (!info.reviews_enabled) return { ok: false, status: 403, error: "ร้านนี้ยังไม่เปิดรีวิว", errorEn: "Reviews are not enabled for this shop." };
  if (!args.entries.length) return { ok: false, status: 400, error: "ให้ดาวอย่างน้อย 1 สินค้า", errorEn: "Rate at least one product." };

  let order: OrderLite | null = null;
  let allowed: Map<string, ReviewableItem> | null = null;
  if (args.orderId) {
    const r = await orderReviewItems(sb, shopId, args.orderId);
    if (!r) return { ok: false, status: 404, error: "ลิงก์รีวิวใช้ไม่ได้ หรือออเดอร์ยังไม่จัดส่ง", errorEn: "This review link is invalid or the order hasn't shipped yet." };
    order = r.order;
    allowed = new Map(r.items.filter((i) => !i.reviewed).map((i) => [i.code, i]));
  } else if (info.reviews_buyers_only) {
    return { ok: false, status: 403, error: "รีวิวได้เฉพาะลูกค้าที่ซื้อแล้ว — ยืนยันด้วยเลขออเดอร์และเบอร์โทร", errorEn: "Only customers who bought this can review — verify with your order number and phone." };
  } else if (args.entries.length > 1) {
    return { ok: false, status: 400, error: "รีวิวได้ทีละสินค้า", errorEn: "One product at a time." };
  }

  const author = args.author || order?.customer_name || "";
  if (!order && !author) return { ok: false, status: 400, error: "กรอกชื่อที่จะโชว์ในรีวิว", errorEn: "Enter the name to show on your review." };

  let saved = 0;
  let approved = 0;
  let points = 0;
  for (const e of args.entries.slice(0, 20)) {
    const item = allowed ? allowed.get(e.code) : null;
    if (allowed && !item) continue;
    // แขก: ต้องเป็นรุ่นที่เผยแพร่บนเว็บร้านนี้จริง
    let guestName: string | null = null;
    if (!allowed) {
      const { data: p } = await sb.from("parent_skus_v2").select("id, name").eq("code", e.code).maybeSingle();
      const parent = p as { id: string; name: string | null } | null;
      const { data: l } = parent ? await sb.from("store_listings").select("is_published, web_name").eq("shop_id", shopId).eq("parent_sku_id", parent.id).maybeSingle() : { data: null };
      const listing = l as { is_published: boolean; web_name: string | null } | null;
      if (!parent || !listing?.is_published) return { ok: false, status: 404, error: "ไม่พบสินค้านี้", errorEn: "Product not found." };
      guestName = listing.web_name || parent.name;
    }
    const up = await uploadReviewImages(shopId, e.files);
    if (up.error) {
      await Promise.all(up.keys.map((k) => r2DeleteObject(k).catch(() => undefined)));
      return { ok: false, status: 415, error: up.error, errorEn: up.errorEn ?? up.error };
    }
    const verified = !!order;
    const isApproved = autoApprove(info, verified, e.rating);
    const pts = isApproved ? reviewPoints(info, { customerId: order?.customer_id ?? null, verified, images: up.keys.length }) : 0;
    const { data: ins, error } = await sb
      .from("store_reviews")
      .insert({
        shop_id: shopId,
        parent_code: e.code,
        product_name: item?.name ?? guestName,
        variant_label: item?.variant ?? null,
        order_id: order?.id ?? null,
        customer_id: order?.customer_id ?? null,
        rating: e.rating,
        body: e.body,
        author_name: author.slice(0, 60),
        images: up.keys,
        status: isApproved ? "approved" : "pending",
        verified,
        lang: args.lang,
        ...(isApproved ? { moderated_by_name: "auto", moderated_at: new Date().toISOString() } : {}),
      })
      .select("id")
      .single();
    if (error || !ins) {
      await Promise.all(up.keys.map((k) => r2DeleteObject(k).catch(() => undefined)));
      // ส่งซ้ำ (กดปุ่มสองที) = รุ่นนี้รีวิวไปแล้ว → ข้าม
      if (error?.code === "23505") continue;
      console.error("[reviews] insert", error?.message);
      return { ok: false, status: 500, error: "บันทึกรีวิวไม่สำเร็จ กรุณาลองใหม่", errorEn: "Couldn't save your review. Please try again." };
    }
    saved += 1;
    if (isApproved) approved += 1;
    if (pts > 0 && order?.customer_id) {
      const bal = await adjustPoints(sb, order.customer_id, pts, `⭐ รีวิวสินค้า ${e.code}`, "system");
      if (bal !== null) {
        await sb.from("store_reviews").update({ points_awarded: pts }).eq("id", (ins as { id: string }).id);
        points += pts;
      }
    }
  }
  if (!saved) return { ok: false, status: 409, error: "สินค้านี้รีวิวไปแล้ว", errorEn: "You've already reviewed this." };
  return { ok: true, saved, approved, points };
}

const PUBLIC_COLS = "id, rating, body, author_name, images, verified, variant_label, reply, created_at";

/** รีวิวที่ขึ้นเว็บของรุ่นนี้ + สรุปดาว (หน้าสินค้า) */
export async function publicReviews(sb: Admin, shopId: string, code: string, offset = 0, limit = 10, lang: "th" | "en" = "th"): Promise<{ summary: RatingSummary; reviews: PublicReview[]; more: boolean }> {
  const c = String(code ?? "").trim().toUpperCase();
  const [{ data: all }, { data: rows }] = await Promise.all([
    sb.from("store_reviews").select("rating").eq("shop_id", shopId).eq("parent_code", c).eq("status", "approved").limit(5000),
    sb
      .from("store_reviews")
      .select(PUBLIC_COLS)
      .eq("shop_id", shopId)
      .eq("parent_code", c)
      .eq("status", "approved")
      // มีรูปก่อน (น่าเชื่อกว่า) แล้วใหม่สุด — Supabase เรียงตาม array ไม่ได้ จึงเรียงใหม่สุดก่อน แล้วจัดรูปขึ้นก่อนในหน้าเดียวกัน
      .order("created_at", { ascending: false })
      .range(Math.max(0, offset), Math.max(0, offset) + Math.min(30, limit)),
  ]);
  const summary = summarize(((all ?? []) as { rating: number }[]).map((r) => r.rating));
  const list = ((rows ?? []) as { id: string; rating: number; body: string; author_name: string; images: string[] | null; verified: boolean; variant_label: string | null; reply: string | null; created_at: string }[]).map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    author: publicAuthor(r.author_name, lang),
    images: (r.images ?? []).slice(0, REVIEW_MAX_IMAGES),
    verified: r.verified,
    variant: r.variant_label,
    reply: r.reply,
    createdAt: r.created_at,
  }));
  const more = list.length > Math.min(30, limit);
  return { summary, reviews: list.slice(0, Math.min(30, limit)), more };
}

/** ดาวเฉลี่ยทุกรุ่นของร้าน (การ์ดสินค้า / ผลค้นหา Google) */
export async function ratingSummaries(sb: Admin, shopId: string): Promise<Map<string, { avg: number; count: number }>> {
  const { data } = await sb.from("store_reviews").select("parent_code, rating").eq("shop_id", shopId).eq("status", "approved").limit(20000);
  const by = new Map<string, number[]>();
  for (const r of (data ?? []) as { parent_code: string; rating: number }[]) {
    const k = r.parent_code.toUpperCase();
    const arr = by.get(k);
    if (arr) arr.push(r.rating);
    else by.set(k, [r.rating]);
  }
  const out = new Map<string, { avg: number; count: number }>();
  for (const [k, v] of by) {
    const s = summarize(v);
    if (s.count) out.set(k, { avg: s.avg, count: s.count });
  }
  return out;
}

export type ModerateAction = { kind: "approve" } | { kind: "hide" } | { kind: "pending" } | { kind: "reply"; text: string } | { kind: "delete" };

/** ตรวจรีวิว (แท็บ ⭐ รีวิว) — อนุมัติครั้งแรก = ให้แต้ม (ครั้งเดียว) · ลบ = ลบรูปด้วย · ทุกอย่างลง audit */
export async function moderateReview(
  sb: Admin,
  args: { id: string; shopId: string; action: ModerateAction; info: SiteInfo; actorId: string | null; actorName: string | null },
): Promise<{ ok: true; review: ReviewRow | null; points: number } | { ok: false; status: number; error: string }> {
  const { data } = await sb.from("store_reviews").select("*").eq("id", args.id).eq("shop_id", args.shopId).maybeSingle();
  const before = data as ReviewRow | null;
  if (!before) return { ok: false, status: 404, error: "ไม่พบรีวิว" };
  const now = new Date().toISOString();
  const by = { moderated_by: args.actorId, moderated_by_name: args.actorName, moderated_at: now };
  let points = 0;

  if (args.action.kind === "delete") {
    const { error } = await sb.from("store_reviews").delete().eq("id", before.id);
    if (error) return { ok: false, status: 500, error: error.message };
    await Promise.all((before.images ?? []).map((k) => r2DeleteObject(k).catch(() => undefined)));
  } else {
    let patch: Record<string, unknown>;
    if (args.action.kind === "reply") {
      const text = args.action.text.replace(/<[^>]*>/g, "").trim().slice(0, 1000);
      patch = { reply: text || null, replied_at: text ? now : null };
    } else {
      const status: ReviewStatus = args.action.kind === "approve" ? "approved" : args.action.kind === "hide" ? "hidden" : "pending";
      patch = { status, ...by };
    }
    const { error } = await sb.from("store_reviews").update(patch).eq("id", before.id);
    if (error) return { ok: false, status: 500, error: error.message };
    if (args.action.kind === "approve" && before.points_awarded === 0) {
      const pts = reviewPoints(args.info, { customerId: before.customer_id, verified: before.verified, images: (before.images ?? []).length });
      if (pts > 0 && before.customer_id) {
        const bal = await adjustPoints(sb, before.customer_id, pts, `⭐ รีวิวสินค้า ${before.parent_code}`, args.actorName ?? "staff");
        if (bal !== null) {
          await sb.from("store_reviews").update({ points_awarded: pts }).eq("id", before.id);
          points = pts;
        }
      }
    }
  }

  await writeAudit(sb, {
    action: `review_${args.action.kind}`,
    entityType: "store_reviews",
    entityId: before.id,
    actorId: args.actorId,
    actorName: args.actorName,
    metadata: { shopId: args.shopId, code: before.parent_code, rating: before.rating, from: before.status, ...(args.action.kind === "reply" ? { reply: args.action.text.slice(0, 200) } : {}), ...(points ? { points } : {}) },
  });
  if (args.action.kind === "delete") return { ok: true, review: null, points };
  const { data: after } = await sb.from("store_reviews").select("*").eq("id", before.id).maybeSingle();
  return { ok: true, review: after as ReviewRow | null, points };
}
