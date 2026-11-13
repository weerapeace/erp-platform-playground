/**
 * สถานะเชื่อมต่อ Shopee ของแบรนด์ — /api/shopee/status?brand_id=...[&check=1]
 * GET → { configured, env, connected, health, days_left, auth_days_left, shop_id, shop_name, region, shop_status, problem, brand_mismatch }  (ไม่คืนกุญแจ)
 *   check=1 → ลองเรียก Shopee จริง (ต่ออายุกุญแจถ้าจำเป็น + ดึงข้อมูลร้านใหม่) แล้วบอกผลใน problem · อ่านอย่างเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { shopeeConfigured, shopeeEnv, shopeeErrorText, shopeeGetShopInfo, type ShopeeEnv } from "@/lib/shopee";
import { ttsBrandMismatch as shopNameMismatch } from "@/lib/tiktok-shop";
import type { LazHealthState } from "@/lib/lazada";
import { brandNameOf, getPlatformId, loadShopeeConn, patchShopeeMeta, shopeeConnHealth, shopeeTokenOrReason, type ShopeeConnMeta } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Out = {
  configured: boolean; env: ShopeeEnv; connected: boolean; health: LazHealthState; refresh_expires_at: number | null; days_left: number | null;
  auth_days_left: number | null; shop_id: string | null; shop_name: string | null; region: string | null; shop_status: string | null;
  checked: boolean; problem: string | null; brand_mismatch: { shop_name: string; brand_name: string } | null; error: null;
};

const daysTo = (ms: number | null | undefined) => (ms ? Math.floor((ms - Date.now()) / 86_400_000) : null);

function fill(out: Out, meta: ShopeeConnMeta) {
  const h = shopeeConnHealth(meta);
  out.health = h.state; out.refresh_expires_at = h.refresh_expires_at; out.days_left = h.days_left;
  out.connected = h.state === "connected" || h.state === "expiring";
  out.auth_days_left = daysTo(meta.auth_expires_at);
  out.shop_id = meta.shop_id ?? null; out.shop_name = meta.shop_name ?? null; out.region = meta.region ?? null; out.shop_status = meta.shop_status ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const brandId = (sp.get("brand_id") ?? "").trim();
  const out: Out = {
    configured: shopeeConfigured(), env: shopeeEnv(), connected: false, health: "none", refresh_expires_at: null, days_left: null,
    auth_days_left: null, shop_id: null, shop_name: null, region: null, shop_status: null, checked: false, problem: null, brand_mismatch: null, error: null,
  };
  if (!brandId) return NextResponse.json(out);
  const admin = supabaseAdmin();
  const spId = await getPlatformId(admin, "shopee");
  if (!spId) return NextResponse.json(out);
  const conn = await loadShopeeConn(admin, brandId, spId);
  if (!(conn?.meta.stage === "connected" && conn.accessToken)) {
    if (conn?.meta.stage === "connected") out.health = "expired";
    return NextResponse.json(out);
  }
  fill(out, conn.meta);
  const brandName = await brandNameOf(admin, brandId);
  if (shopNameMismatch(out.shop_name, brandName)) out.brand_mismatch = { shop_name: out.shop_name ?? "", brand_name: brandName ?? "" };
  if (conn.meta.env && conn.meta.env !== out.env) out.problem = `เชื่อมร้านไว้ด้วยกุญแจชุด ${conn.meta.env} แต่ตอนนี้ Vercel ตั้งเป็น ${out.env} — กดเชื่อมใหม่`;

  if (sp.get("check") === "1" && out.connected && !out.problem) {
    out.checked = true;
    const tok = await shopeeTokenOrReason(admin, brandId, spId, null);
    if (!tok.ok) { out.problem = tok.reason; return NextResponse.json(out); }
    try {
      const info = await shopeeGetShopInfo(tok.accessToken, tok.shopId);
      const patch: Partial<ShopeeConnMeta> = { shop_name: info.shop_name ?? tok.meta.shop_name ?? null, region: info.region ?? tok.meta.region ?? null, shop_status: info.status, auth_expires_at: info.auth_expires_at ?? tok.meta.auth_expires_at ?? null };
      await patchShopeeMeta(admin, brandId, spId, patch);
      fill(out, { ...tok.meta, ...patch });
      if (info.status && !/normal/i.test(info.status)) out.problem = `Shopee แจ้งสถานะร้านเป็น "${info.status}" — ตรวจใน Shopee Seller Centre`;
      out.brand_mismatch = shopNameMismatch(out.shop_name, brandName) ? { shop_name: out.shop_name ?? "", brand_name: brandName ?? "" } : null;
    } catch (e) {
      out.problem = shopeeErrorText(e);
    }
  }
  return NextResponse.json(out);
}
