/**
 * 🔍 คำค้นของลูกค้าเว็บร้าน (ERP ข้อมูลร้าน › กลุ่ม 🔍) : GET /api/website/search-terms?shopId=<id>&days=30&notFound=1
 * → { terms: [{ q, hits, lastResults, lastDay }] } · สิทธิ์ products.view · ไม่มีข้อมูลส่วนตัว (นับรายวันอย่างเดียว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardWebsite } from "@/lib/website-api-guard";
import { readSearchTerms } from "@/lib/website-search-terms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const p = request.nextUrl.searchParams;
  const shopId = (p.get("shopId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/.test(shopId)) return NextResponse.json({ error: "ต้องระบุร้าน" }, { status: 400 });
  const days = Math.max(1, Math.min(365, Number(p.get("days")) || 30));
  const terms = await readSearchTerms(supabaseAdmin(), shopId, days, p.get("notFound") === "1");
  return NextResponse.json({ terms }, { headers: { "Cache-Control": "no-store" } });
}
