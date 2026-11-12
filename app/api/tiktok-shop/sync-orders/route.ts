/**
 * ดึงออเดอร์จาก TikTok Shop เข้า "ศูนย์ออเดอร์ออนไลน์" (platform_orders) — /api/tiktok-shop/sync-orders
 *  POST { brand_id?, days?, page_token? }  (platform_orders.manage)
 *   brand_id ไม่ส่ง = ใช้แบรนด์ที่เชื่อม TikTok ไว้ (ถ้ามีแบรนด์เดียว)
 *   → ค้นหาออเดอร์ที่สร้างใน `days` วันล่าสุด (ค่าเริ่ม 30 · สูงสุด 90) ทีละ 50 ใบ ใหม่สุดก่อน · ต่อด้วย page_token
 *   → ใบใหม่ = เพิ่มหัว + รายการ (จับคู่รหัส SKU กับระบบ) · ใบเดิม = อัปเดตสถานะ/ยอด/เลขพัสดุตามร้าน (ไม่แตะรายการ)
 *   ← { api_total, fetched, created, updated, items_created, items_matched, next_page_token, done, stop_reason }
 *
 * ออเดอร์ที่ได้ source = "tiktok_api" = สถานะตามร้าน (lib/platform-order-status isShopManaged)
 *   → นับในการ์ด "ต้องจัดส่ง" แต่เปลี่ยนสถานะ/ตัดสต๊อก/จองขนส่งในระบบไม่ได้ (ยังจัดส่งผ่าน TikTok Seller Center / BigSeller)
 * ไม่เก็บที่อยู่/เบอร์ผู้รับ (ระบบยังไม่ได้ใช้) · ⚠️ อ่านอย่างเดียว — ไม่แก้อะไรบนร้าน TikTok
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { tiktokToInternal } from "@/lib/platform-order-status";
import { ttsSearchOrders, ttsOrderToPlatformOrder, ttsErrorText, ttsIsRateLimit, type TtsOrderMapped, type TtsOrderPage } from "@/lib/tiktok-shop";
import { getPlatformId, ttsTokenOrReason, type TtsConnMeta } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PAGE = 50;
const TIME_BUDGET_MS = 30_000;
const SOURCE = "tiktok_api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= 2 || !ttsIsRateLimit(e)) throw e; await sleep(1200 * (i + 1)); }
  }
}

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
    const { data } = await admin.from("platform_credentials").select("brand_id, meta").eq("platform_id", ttId);
    const connected = ((data ?? []) as { brand_id: string; meta: TtsConnMeta | null }[]).filter((r) => r.meta?.stage === "connected");
    if (connected.length === 0) return NextResponse.json({ error: "ยังไม่มีแบรนด์ไหนเชื่อม TikTok Shop — ไปที่ บัญชีแพลตฟอร์ม › TikTok แล้วกด เชื่อมต่อ" }, { status: 400 });
    if (connected.length > 1) return NextResponse.json({ error: "เชื่อม TikTok ไว้หลายแบรนด์ — เลือกแบรนด์ในตัวกรองก่อนกดดึง" }, { status: 400 });
    brandId = connected[0].brand_id;
  }
  const tok = await ttsTokenOrReason(admin, brandId, ttId, user?.id ?? null);
  if (!tok.ok) return NextResponse.json({ error: tok.reason }, { status: 400 });
  const shop = tok.meta.shops?.[0];
  if (!shop?.cipher) return NextResponse.json({ error: "ยังไม่รู้รหัสร้าน TikTok — ไปที่ บัญชีแพลตฟอร์ม › TikTok แล้วกด ตรวจการเชื่อมต่อ ก่อน" }, { status: 400 });

  const createTimeGe = Math.floor(Date.now() / 1000) - days * 86_400;
  const started = Date.now();
  let token: string | null = startToken, apiTotal = 0, done = false, stopReason: string | null = null;
  let fetched = 0, created = 0, updated = 0, itemsCreated = 0, itemsMatched = 0;
  let sample: Record<string, unknown> | null = null;

  while (Date.now() - started < TIME_BUDGET_MS) {
    let page: TtsOrderPage;
    try { page = await withRetry(() => ttsSearchOrders(tok.accessToken, shop.cipher, { createTimeGe, pageToken: token, pageSize: PAGE })); }
    catch (e) { stopReason = ttsErrorText(e); break; }
    if (page.total > 0) apiTotal = page.total;
    if (!sample && !startToken && page.orders[0]) {
      // ตัวอย่างรูปข้อมูลจริง (ไม่เก็บที่อยู่ผู้รับ) — ไว้ยืนยันกับเอกสาร
      const o = page.orders[0];
      const li = Array.isArray(o.line_items) ? (o.line_items as Record<string, unknown>[])[0] : null;
      sample = { order_keys: Object.keys(o), status: o.status, payment: o.payment, line_item0: li ? { ...li, sku_image: undefined } : null, line_items_n: Array.isArray(o.line_items) ? (o.line_items as unknown[]).length : 0 };
    }

    const mapped = page.orders.map((o) => ttsOrderToPlatformOrder(o, tiktokToInternal)).filter((m): m is TtsOrderMapped => !!m);
    fetched += mapped.length;
    if (mapped.length) {
      const ids = mapped.map((m) => m.external_order_id);
      const { data: exist, error: exErr } = await admin.from("platform_orders").select("external_order_id").eq("platform_id", ttId).in("external_order_id", ids);
      if (exErr) { stopReason = `อ่านออเดอร์เดิมไม่สำเร็จ: ${exErr.message}`; break; }
      const had = new Set(((exist ?? []) as { external_order_id: string }[]).map((r) => r.external_order_id));
      const now = new Date().toISOString();
      // หัวออเดอร์: ใบใหม่ + ใบเดิม ในคำสั่งเดียว (ใบเดิม = อัปเดตตามร้าน)
      const rows = mapped.map((m) => ({ platform_id: ttId, brand_id: brandId, source: SOURCE, external_order_id: m.external_order_id, ...m.head, updated_at: now }));
      const { data: up, error: upErr } = await admin.from("platform_orders").upsert(rows, { onConflict: "platform_id,external_order_id" }).select("id, external_order_id");
      if (upErr) { stopReason = `บันทึกออเดอร์ไม่สำเร็จ: ${upErr.message}`; break; }
      const idOf = new Map(((up ?? []) as { id: string; external_order_id: string }[]).map((r) => [r.external_order_id, r.id]));
      const fresh = mapped.filter((m) => !had.has(m.external_order_id));
      created += fresh.length; updated += mapped.length - fresh.length;

      // รายการสินค้าเฉพาะใบใหม่ · จับคู่รหัสร้าน = รหัส SKU ลูกในระบบ
      const codes = [...new Set(fresh.flatMap((m) => m.items.map((i) => i.sku_code)).filter((c): c is string => !!c))];
      const skuBy = new Map<string, { id: string; parent_sku_id: string | null }>();
      for (let i = 0; i < codes.length; i += 200) {
        const { data: sk } = await admin.from("skus_v2").select("id, code, parent_sku_id").in("code", codes.slice(i, i + 200));
        for (const s of (sk ?? []) as { id: string; code: string; parent_sku_id: string | null }[]) skuBy.set(s.code, { id: s.id, parent_sku_id: s.parent_sku_id });
      }
      const itemRows = fresh.flatMap((m) => {
        const orderId = idOf.get(m.external_order_id);
        if (!orderId) return [];
        return m.items.map((it) => {
          const s = it.sku_code ? skuBy.get(it.sku_code) : undefined;
          if (s) itemsMatched++;
          return { order_id: orderId, sku_code: it.sku_code, matched_sku_id: s?.id ?? null, matched_parent_sku_id: s?.parent_sku_id ?? null, name: it.name, qty: it.qty, price: it.price, raw: { source: SOURCE, sku_id: it.sku_id, variant: it.variant } };
        });
      });
      for (let i = 0; i < itemRows.length; i += 200) {
        const { error: itErr } = await admin.from("platform_order_items").insert(itemRows.slice(i, i + 200));
        if (itErr) { stopReason = `บันทึกรายการสินค้าไม่สำเร็จ: ${itErr.message}`; break; }
        itemsCreated += Math.min(200, itemRows.length - i);
      }
      if (stopReason) break;
    }

    token = page.nextPageToken;
    if (!token || page.orders.length === 0) { done = true; break; }
  }

  if (fetched === 0 && stopReason) {
    return NextResponse.json({ error: `อ่านออเดอร์จาก TikTok ไม่สำเร็จ: ${stopReason}`, next_page_token: startToken }, { status: 400 });
  }
  const result = { brand_id: brandId, days, api_total: apiTotal, fetched, created, updated, items_created: itemsCreated, items_matched: itemsMatched, next_page_token: done ? null : token, done, stop_reason: stopReason };
  await writeAudit(admin, {
    action: "import", entityType: "platform_orders", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: SOURCE, shop: shop.name, ...result, ...(sample ? { sample } : {}) },
  });
  return NextResponse.json({ ok: true, ...result, error: null });
}
