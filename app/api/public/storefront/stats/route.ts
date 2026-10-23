/**
 * API สาธารณะ — 📈 ตัวนับสถิติเว็บร้าน : POST /api/public/storefront/stats { shop, ev: [{ m, d }] }
 * นับรายวันในตาราง store_web_stats (ตัวเลขรวม · ไม่เก็บว่าใครเข้า ไม่เก็บ IP) → ERP › เว็บไซต์ › 📈 สถิติ
 * เว็บร้านรวมหลายตัวนับส่งทีเดียว (src/lib/site-stats.ts · sendBeacon) · ≤20 ตัวต่อครั้ง · กันยิงรัวต่อ IP
 * ไม่มี guardApi โดยเจตนา + CORS (เหมือน search-log) · ตัวนับที่ไม่รู้จักทิ้ง — lib/website-web-stats cleanStatEvents
 */
import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { cleanStatEvents } from "@/lib/website-web-stats";
import { maybeRunWebshopReminders } from "@/lib/webshop-reminders-db";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";
import { activeShopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";

const CORS = storefrontCors("POST");

export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}

const json = corsJson(CORS);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = await overLimit(request, [{ name: "web-stats:ip", limit: 240, windowSec: 600 }]);
  if (limited) return json({ ok: false }, 429);
  let body: Record<string, unknown>;
  try {
    // sendBeacon ส่งเป็น text/plain → อ่านเป็นข้อความแล้วแปลงเอง
    body = JSON.parse(await request.text()) as Record<string, unknown>;
  } catch {
    return json({ ok: false }, 400);
  }
  const events = cleanStatEvents(body.ev);
  if (!events.length) return json({ ok: true, skipped: true });
  const sb = supabaseAdmin();
  const shop = await activeShopBySlug(sb, body.shop);
  if (!shop) return json({ ok: false }, 404);
  const { error } = await sb.rpc("store_web_stat_bump" as never, { p_shop: shop.id, p_events: events } as never);
  if (error) console.error("[web-stats]", error.message);
  // 🔔 รอบเตือนตะกร้าค้าง/ของถูกใจลดราคา — อาศัยจังหวะที่มีคนเข้าเว็บ (ห่างกัน ≥ 30 นาที/ร้าน · lib/webshop-reminders-db)
  after(() => maybeRunWebshopReminders(sb, shop.id));
  return json({ ok: !error });
}
