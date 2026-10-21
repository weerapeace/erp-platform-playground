/**
 * API สาธารณะ — ยืนยันว่าซื้อจริงก่อนรีวิว : POST /api/public/storefront/reviews/verify { shop, no, phone }
 * → { ok:true, token } (เอาไปเปิด /review?t=<token> บนเว็บร้าน) · ไม่มี guardApi โดยเจตนา + CORS + กันไล่เดาเลขออเดอร์
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { readSiteInfo } from "@/lib/website-site-info";
import { issueReviewToken } from "@/lib/review-token";
import { findReviewableOrder } from "@/lib/website-reviews-server";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = await overLimit(request, [{ name: "review-verify:ip", limit: 10, windowSec: 600 }]);
  if (limited) return json({ ok: false, error: limited, errorEn: "Too many attempts. Please wait a moment and try again." }, 429);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง", errorEn: "Invalid request." }, 400);
  }
  const sb = supabaseAdmin();
  const { data } = await sb.from("shops").select("id, status").eq("slug", String(body.shop ?? "").trim()).maybeSingle();
  const shop = data as { id: string; status: string } | null;
  if (!shop || shop.status !== "active") return json({ ok: false, error: "ไม่พบร้าน", errorEn: "Shop not found." }, 404);
  const info = await readSiteInfo(sb, shop.id);
  if (!info.reviews_enabled) return json({ ok: false, error: "ร้านนี้ยังไม่เปิดรีวิว", errorEn: "Reviews are not enabled for this shop." }, 403);
  const r = await findReviewableOrder(sb, shop.id, String(body.no ?? ""), String(body.phone ?? ""));
  if (!r.ok) return json({ ok: false, error: r.error, errorEn: r.errorEn }, r.status);
  const token = issueReviewToken(r.orderId);
  if (!token) return json({ ok: false, error: "ระบบรีวิวยังไม่พร้อม กรุณาติดต่อร้าน", errorEn: "Reviews aren't available right now. Please contact the shop." }, 503);
  return json({ ok: true, token });
}
