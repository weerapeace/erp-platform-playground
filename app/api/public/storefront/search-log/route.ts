/**
 * API สาธารณะ — 🔍 จดคำค้นของลูกค้า : POST /api/public/storefront/search-log { shop, q, results }
 * นับรายวันในตาราง store_search_terms (ไม่เก็บว่าใครค้น · ไม่มีข้อมูลส่วนตัว) → ERP โชว์ "คำที่ค้นแล้วไม่เจอ" ในกลุ่ม 🔍 ข้อมูลร้าน
 * เว็บร้านยิงตอนลูกค้าพิมพ์ค้างไว้ ~1.5 วิ (ไม่ใช่ทุกตัวอักษร) · กันยิงรัวต่อ IP · ไม่มี guardApi โดยเจตนา + CORS
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { cleanSearchTerm } from "@/lib/website-search-terms";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";
import { activeShopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";

const CORS = storefrontCors("POST");

export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}

const json = corsJson(CORS);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = await overLimit(request, [{ name: "search-log:ip", limit: 60, windowSec: 600 }]);
  if (limited) return json({ ok: false }, 429);
  let body: Record<string, unknown>;
  try {
    // sendBeacon ส่งเป็น text/plain → อ่านเป็นข้อความแล้วแปลงเอง
    body = JSON.parse(await request.text()) as Record<string, unknown>;
  } catch {
    return json({ ok: false }, 400);
  }
  const q = cleanSearchTerm(body.q);
  if (!q) return json({ ok: true, skipped: true });
  const sb = supabaseAdmin();
  const shop = await activeShopBySlug(sb, body.shop);
  if (!shop) return json({ ok: false }, 404);
  const results = Math.max(0, Math.min(100000, Math.round(Number(body.results) || 0)));
  const { error } = await sb.rpc("store_search_log" as never, { p_shop: shop.id, p_q: q, p_results: results } as never);
  if (error) console.error("[search-log]", error.message);
  return json({ ok: !error });
}
