/**
 * API สาธารณะ — ⭐ รีวิวสินค้า : /api/public/storefront/reviews (lib/website-reviews-server)
 *
 * GET  ?shop=<slug>&code=<รหัสรุ่น>[&offset=0&lang=en] → { summary, reviews, more } (เฉพาะที่ขึ้นเว็บ · ไม่มีข้อมูลส่วนตัว)
 * GET  ?shop=<slug>&t=<รหัสลิงก์รีวิว>                 → { order:{no,name}, items:[{code,name,variant,reviewed}] } (ฟอร์มรีวิวหลังซื้อ)
 * POST multipart: shop, t? (ลิงก์รีวิว), author?, lang?, entries = JSON [{code,rating,body}], ไฟล์รูป img-<ลำดับบรรทัด> (สูงสุด 4/บรรทัด)
 *      ไม่มี t = รีวิวแบบแขก (ได้เฉพาะร้านที่ปิด "เฉพาะคนซื้อ" · ทีละสินค้า · ต้องรอตรวจเสมอ)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS · กันยิงรัวด้วย rate-limit · รูปตรวจหัวไฟล์จริง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { readSiteInfo } from "@/lib/website-site-info";
import { verifyReviewToken } from "@/lib/review-token";
import { orderReviewItems, publicReviews, submitReviews, type SubmitEntry } from "@/lib/website-reviews-server";
import { cleanAuthor, cleanEntry, REVIEW_MAX_IMAGES } from "@/lib/website-reviews";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const json = (body: unknown, status = 200, cache = "no-store") => NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": cache } });

async function loadShop(slug: string) {
  const sb = supabaseAdmin();
  const { data } = await sb.from("shops").select("id, status").eq("slug", slug).maybeSingle();
  const s = data as { id: string; status: string } | null;
  if (!s || s.status !== "active") return null;
  return { sb, shopId: s.id };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("shop") ?? "").trim();
  if (!slug) return json({ error: "ต้องระบุ shop" }, 400);
  const ctx = await loadShop(slug);
  if (!ctx) return json({ error: "ไม่พบร้าน" }, 404);
  const info = await readSiteInfo(ctx.sb, ctx.shopId);
  if (!info.reviews_enabled) return json({ enabled: false, summary: { avg: 0, count: 0, dist: [0, 0, 0, 0, 0] }, reviews: [], more: false }, 200, "public, s-maxage=60");

  const token = url.searchParams.get("t");
  if (token) {
    const limited = await overLimit(request, [{ name: "review-form:ip", limit: 40, windowSec: 600 }]);
    if (limited) return json({ error: limited }, 429);
    const orderId = verifyReviewToken(token);
    const r = orderId ? await orderReviewItems(ctx.sb, ctx.shopId, orderId) : null;
    if (!r) return json({ error: "ลิงก์รีวิวใช้ไม่ได้ หรือออเดอร์ยังไม่จัดส่ง", errorEn: "This review link is invalid or the order hasn't shipped yet." }, 404);
    const first = String(r.order.customer_name ?? "").trim().split(/\s+/)[0] ?? "";
    return json({ enabled: true, order: { no: r.order.order_no, name: first }, items: r.items });
  }

  const code = (url.searchParams.get("code") ?? "").trim();
  if (!code) return json({ error: "ต้องระบุ code" }, 400);
  const offset = Math.max(0, Math.min(2000, Number(url.searchParams.get("offset")) || 0));
  const lang = url.searchParams.get("lang") === "en" ? "en" : "th";
  const r = await publicReviews(ctx.sb, ctx.shopId, code, offset, 10, lang);
  return json({ enabled: true, ...r }, 200, "public, s-maxage=60, stale-while-revalidate=300");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = await overLimit(request, [{ name: "review-submit:ip", limit: 8, windowSec: 600 }]);
  if (limited) return json({ ok: false, error: limited, errorEn: "Too many requests. Please wait a moment and try again." }, 429);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง", errorEn: "Invalid request." }, 400);
  }
  const slug = String(form.get("shop") ?? "").trim();
  const ctx = slug ? await loadShop(slug) : null;
  if (!ctx) return json({ ok: false, error: "ไม่พบร้าน", errorEn: "Shop not found." }, 404);
  const info = await readSiteInfo(ctx.sb, ctx.shopId);

  const token = String(form.get("t") ?? "").trim();
  const orderId = token ? verifyReviewToken(token) : null;
  if (token && !orderId) return json({ ok: false, error: "ลิงก์รีวิวหมดอายุหรือไม่ถูกต้อง", errorEn: "This review link has expired or is invalid." }, 403);

  let rawEntries: unknown;
  try {
    rawEntries = JSON.parse(String(form.get("entries") ?? "[]"));
  } catch {
    rawEntries = [];
  }
  const entries: SubmitEntry[] = [];
  (Array.isArray(rawEntries) ? rawEntries : []).slice(0, 20).forEach((raw, i) => {
    const e = cleanEntry(raw);
    if (!e) return;
    const files = form.getAll(`img-${i}`).filter((f): f is File => f instanceof File && f.size > 0).slice(0, REVIEW_MAX_IMAGES);
    entries.push({ ...e, files });
  });

  const r = await submitReviews(ctx.sb, {
    shopId: ctx.shopId,
    info,
    orderId,
    author: cleanAuthor(form.get("author")),
    lang: form.get("lang") === "en" ? "en" : "th",
    entries,
  });
  if (!r.ok) return json({ ok: false, error: r.error, errorEn: r.errorEn }, r.status);
  return json(r, 201);
}
