/**
 * ดึงออเดอร์จาก Shopee เข้า "ศูนย์ออเดอร์ออนไลน์" (platform_orders) — /api/shopee/sync-orders (ปุ่มกดเอง)
 *  POST { brand_id?, days?, wi?, cursor?, anchor? }  (platform_orders.manage)
 *   brand_id ไม่ส่ง = แบรนด์เดียวที่เชื่อม Shopee ไว้
 *   → ออเดอร์ที่ "สร้าง" ใน `days` วันล่าสุด (ค่าเริ่ม 30 · สูงสุด 90) — Shopee ให้ถามครั้งละ ≤ 15 วัน → ไล่ช่วงจากใหม่ไปเก่า
 *     wi = ลำดับช่วง (0 = 15 วันล่าสุด) · cursor = หน้าถัดไปในช่วงนั้น · anchor = เวลาเริ่มรอบ (unix วินาที — ทุกครั้งในรอบเดียวกันใช้ค่าเดิม)
 *   ← { fetched, created, updated, from_email, items_created, items_matched, next: { wi, cursor, anchor } | null, done, stop_reason }
 * ตัวบันทึกอยู่ที่ ../orders-sync (ใช้ร่วมกับตัวดึงอัตโนมัติใน /api/cron/tiktok-orders)
 * ออเดอร์ source = "shopee_api" = สถานะตามร้าน (ใบที่เคยมาจากเมลถูกอัปเดตเป็นแหล่งนี้ — เจ้าของเลือก 2026-11-14) · ⚠️ อ่านอย่างเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { SHOPEE_ORDER_WINDOW_SEC } from "@/lib/shopee";
import { getPlatformId, shopeeTokenOrReason } from "../shared";
import { syncShopeeOrders, shopeeConnectedBrandIds, SHOPEE_ORDER_SOURCE } from "../orders-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const TIME_BUDGET_MS = 30_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; days?: number; wi?: number; cursor?: string | null; anchor?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const days = Math.min(90, Math.max(1, Math.floor(Number(body.days) || 30)));
  const nowSec = Math.floor(Date.now() / 1000);
  const anchorIn = Math.floor(Number(body.anchor) || 0);
  const anchor = anchorIn > nowSec - 3600 && anchorIn <= nowSec + 60 ? anchorIn : nowSec;   // เกิน 1 ชม. = เริ่มรอบใหม่
  const resumed = anchor === anchorIn;
  const windows = Math.ceil((days * 86_400) / SHOPEE_ORDER_WINDOW_SEC);
  let wi = resumed ? Math.min(windows, Math.max(0, Math.floor(Number(body.wi) || 0))) : 0;
  let cursor = resumed ? (body.cursor ?? "").trim() : "";
  const startAt = { wi, cursor };

  const admin = supabaseAdmin();
  const spId = await getPlatformId(admin, "shopee");
  if (!spId) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม Shopee ในระบบ" }, { status: 400 });
  let brandId = (body.brand_id ?? "").trim();
  if (!brandId) {
    const connected = await shopeeConnectedBrandIds(admin, spId);
    if (connected.length === 0) return NextResponse.json({ error: "ยังไม่มีแบรนด์ไหนเชื่อม Shopee — ไปที่ บัญชีแพลตฟอร์ม › Shopee แล้วกด เชื่อมต่อ" }, { status: 400 });
    if (connected.length > 1) return NextResponse.json({ error: "เชื่อม Shopee ไว้หลายแบรนด์ — เลือกแบรนด์ในตัวกรองก่อนกดดึง" }, { status: 400 });
    brandId = connected[0];
  }
  const tok = await shopeeTokenOrReason(admin, brandId, spId, user?.id ?? null);
  if (!tok.ok) return NextResponse.json({ error: tok.reason }, { status: 400 });

  const started = Date.now();
  const sum = { fetched: 0, created: 0, updated: 0, from_email: 0, items_created: 0, items_matched: 0 };
  let stopReason: string | null = null, sample: Record<string, unknown> | null = null;
  const earliest = anchor - days * 86_400;
  while (wi < windows) {
    const left = TIME_BUDGET_MS - (Date.now() - started);
    if (left < 5_000) break;
    const to = anchor - wi * SHOPEE_ORDER_WINDOW_SEC;
    const from = Math.max(earliest, to - SHOPEE_ORDER_WINDOW_SEC);
    const r = await syncShopeeOrders(admin, {
      platformId: spId, brandId, accessToken: tok.accessToken, shopId: tok.shopId,
      window: { field: "create_time", from, to }, cursor, timeBudgetMs: left, withSample: !sample && startAt.wi === 0 && !startAt.cursor,
    });
    sum.fetched += r.fetched; sum.created += r.created; sum.updated += r.updated; sum.from_email += r.from_email; sum.items_created += r.items_created; sum.items_matched += r.items_matched;
    if (r.sample) sample = r.sample;
    if (r.stop_reason) { stopReason = r.stop_reason; cursor = r.next_cursor ?? cursor; break; }
    if (r.done) { wi++; cursor = ""; } else { cursor = r.next_cursor ?? ""; break; }   // หมดเวลากลางช่วง → ครั้งหน้าต่อจาก cursor
  }
  const done = wi >= windows;
  if (sum.fetched === 0 && stopReason) {
    return NextResponse.json({ error: `อ่านออเดอร์จาก Shopee ไม่สำเร็จ: ${stopReason}`, next: { wi, cursor, anchor } }, { status: 400 });
  }
  const result = { days, windows, ...sum, next: done ? null : { wi, cursor, anchor }, done, stop_reason: stopReason };
  await writeAudit(admin, {
    action: "import", entityType: "platform_orders", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: SHOPEE_ORDER_SOURCE, shop_id: tok.shopId, brand_id: brandId, from_window: startAt, ...result, ...(sample ? { sample } : {}) },
  });
  return NextResponse.json({ ok: true, brand_id: brandId, ...result, error: null });
}
