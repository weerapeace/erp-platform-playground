/**
 * ดึงออเดอร์จาก TikTok Shop เข้า "ศูนย์ออเดอร์ออนไลน์" (platform_orders) — /api/tiktok-shop/sync-orders (ปุ่มกดเอง)
 *  POST { brand_id?, days?, page_token? }  (platform_orders.manage)
 *   brand_id ไม่ส่ง = ใช้แบรนด์ที่เชื่อม TikTok ไว้ (ถ้ามีแบรนด์เดียว)
 *   → ค้นหาออเดอร์ที่สร้างใน `days` วันล่าสุด (ค่าเริ่ม 30 · สูงสุด 90) ทีละ 50 ใบ ใหม่สุดก่อน · ต่อด้วย page_token
 *   ← { api_total, fetched, created, updated, items_created, items_matched, next_page_token, done, stop_reason }
 * ตัวบันทึกอยู่ที่ ../orders-sync (ใช้ร่วมกับตัวดึงอัตโนมัติ /api/cron/tiktok-orders)
 * ออเดอร์ source = "tiktok_api" = สถานะตามร้าน · ⚠️ อ่านอย่างเดียว — ไม่แก้อะไรบนร้าน TikTok
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getPlatformId, ttsTokenOrReason, ttsConnectedBrandIds } from "../shared";
import { syncTiktokOrders, TTS_ORDER_SOURCE } from "../orders-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; days?: number; page_token?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const days = Math.min(90, Math.max(1, Math.floor(Number(body.days) || 30)));
  const startToken = (body.page_token ?? "").trim() || null;

  const admin = supabaseAdmin();
  const ttId = await getPlatformId(admin, "tiktok");
  if (!ttId) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม TikTok ในระบบ" }, { status: 400 });

  // แบรนด์: ส่งมา หรือแบรนด์เดียวที่เชื่อม TikTok ไว้
  let brandId = (body.brand_id ?? "").trim();
  if (!brandId) {
    const connected = await ttsConnectedBrandIds(admin, ttId);
    if (connected.length === 0) return NextResponse.json({ error: "ยังไม่มีแบรนด์ไหนเชื่อม TikTok Shop — ไปที่ บัญชีแพลตฟอร์ม › TikTok แล้วกด เชื่อมต่อ" }, { status: 400 });
    if (connected.length > 1) return NextResponse.json({ error: "เชื่อม TikTok ไว้หลายแบรนด์ — เลือกแบรนด์ในตัวกรองก่อนกดดึง" }, { status: 400 });
    brandId = connected[0];
  }
  const tok = await ttsTokenOrReason(admin, brandId, ttId, user?.id ?? null);
  if (!tok.ok) return NextResponse.json({ error: tok.reason }, { status: 400 });
  const shop = tok.meta.shops?.[0];
  if (!shop?.cipher) return NextResponse.json({ error: "ยังไม่รู้รหัสร้าน TikTok — ไปที่ บัญชีแพลตฟอร์ม › TikTok แล้วกด ตรวจการเชื่อมต่อ ก่อน" }, { status: 400 });

  const r = await syncTiktokOrders(admin, {
    platformId: ttId, brandId, accessToken: tok.accessToken, shop,
    window: { createTimeGe: Math.floor(Date.now() / 1000) - days * 86_400 }, pageToken: startToken, timeBudgetMs: 30_000, withSample: !startToken,
  });
  if (r.fetched === 0 && r.stop_reason) {
    return NextResponse.json({ error: `อ่านออเดอร์จาก TikTok ไม่สำเร็จ: ${r.stop_reason}`, next_page_token: startToken }, { status: 400 });
  }
  const { sample, ...result } = r;
  await writeAudit(admin, {
    action: "import", entityType: "platform_orders", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: TTS_ORDER_SOURCE, shop: shop.name, brand_id: brandId, days, ...result, ...(sample ? { sample } : {}) },
  });
  return NextResponse.json({ ok: true, brand_id: brandId, days, ...result, error: null });
}
