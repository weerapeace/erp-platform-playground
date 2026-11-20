/**
 * 🔗 API สาธารณะ — เว็บร้านถามปลายทางของลิงก์สั้น: GET /api/public/short-links/<code>?q=1
 *   เว็บร้าน (louismontini.co.th/go/<code>) เรียกจากฝั่ง server ส่ง User-Agent/Referer ของลูกค้าต่อมาทาง x-sl-ua / x-sl-ref
 *   → นับคลิก (แยกที่มา) แล้วคืน { url } · ไม่เจอ/ปิด/ลบ = { url: null } (เว็บร้านพาไปหน้าแรก)
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าทั่วไปกดลิงก์) — คืนแค่ลิงก์ปลายทาง ไม่มีข้อมูลภายใน · ห้าม cache (ต้องนับทุกคลิก)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SHORT_CODE_RE, cleanTargetUrl, shortLinkSourceOf } from "@/lib/short-links";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: raw } = await ctx.params;
  const code = decodeURIComponent(raw ?? "").trim().toLowerCase();
  if (!SHORT_CODE_RE.test(code)) return NextResponse.json({ url: null }, { headers: NO_STORE });
  const ua = request.headers.get("x-sl-ua") ?? request.headers.get("user-agent");
  const source = shortLinkSourceOf(ua, { qr: request.nextUrl.searchParams.get("q") === "1", referer: request.headers.get("x-sl-ref") });
  const { data, error } = await supabaseAdmin().rpc("short_link_hit", { p_code: code, p_source: source });
  if (error) return NextResponse.json({ url: null, error: "lookup_failed" }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ url: cleanTargetUrl(data) }, { headers: NO_STORE });
}
