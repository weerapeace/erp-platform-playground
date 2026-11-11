/**
 * สถานะเชื่อมต่อ TikTok Shop ของแบรนด์ — /api/tiktok-shop/status?brand_id=...[&check=1]
 * GET → { configured, connected, health, days_left, refresh_expires_at, seller_name, region, shops[{name,region,code}], problem }  (ไม่คืนกุญแจ/cipher)
 *   check=1 → ลองเรียก TikTok จริง (ต่ออายุกุญแจถ้าจำเป็น + ดึงรายชื่อร้านใหม่) แล้วบอกผลใน problem
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { ttsConfigured, ttsGetAuthorizedShops, ttsErrorText, type TtsShop } from "@/lib/tiktok-shop";
import type { LazHealthState } from "@/lib/lazada";
import { getPlatformId, loadTtsConn, saveTtsConn, ttsConnHealth, ttsTokenOrReason } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ShopOut = { name: string; region: string | null; code: string | null };
const shopOut = (s: TtsShop[] | undefined): ShopOut[] => (s ?? []).map((x) => ({ name: x.name, region: x.region, code: x.code }));

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const brandId = (sp.get("brand_id") ?? "").trim();
  const out: {
    configured: boolean; connected: boolean; health: LazHealthState; refresh_expires_at: number | null; days_left: number | null;
    seller_name: string | null; region: string | null; shops: ShopOut[]; checked: boolean; problem: string | null; error: null;
  } = {
    configured: ttsConfigured(), connected: false, health: "none", refresh_expires_at: null, days_left: null,
    seller_name: null, region: null, shops: [], checked: false, problem: null, error: null,
  };
  if (!brandId) return NextResponse.json(out);
  const admin = supabaseAdmin();
  const ttId = await getPlatformId(admin, "tiktok");
  if (!ttId) return NextResponse.json(out);
  const conn = await loadTtsConn(admin, brandId, ttId);
  if (!(conn?.meta.stage === "connected" && conn.accessToken)) return NextResponse.json(out);

  const h = ttsConnHealth(conn.meta);
  out.health = h.state; out.refresh_expires_at = h.refresh_expires_at; out.days_left = h.days_left;
  out.connected = h.state === "connected" || h.state === "expiring";
  out.seller_name = conn.meta.seller_name ?? null; out.region = conn.meta.seller_base_region ?? null;
  out.shops = shopOut(conn.meta.shops);

  if (sp.get("check") === "1" && out.connected) {
    out.checked = true;
    const tok = await ttsTokenOrReason(admin, brandId, ttId, null);
    if (!tok.ok) { out.problem = tok.reason; return NextResponse.json(out); }
    try {
      const shops = await ttsGetAuthorizedShops(tok.accessToken);
      out.shops = shopOut(shops);
      if (!shops.length) out.problem = "เชื่อมแล้ว แต่ TikTok ไม่ส่งรายชื่อร้านกลับมา — ลองกดเชื่อมต่อใหม่";
      // เก็บรายชื่อร้านล่าสุด (กุญแจเดิม — ttsTokenOrReason ต่ออายุแล้วถ้าจำเป็น)
      const fresh = await loadTtsConn(admin, brandId, ttId);
      if (fresh?.accessToken) await saveTtsConn(admin, brandId, ttId, fresh.accessToken, fresh.refreshToken, { ...fresh.meta, shops }, null);
    } catch (e) {
      out.problem = ttsErrorText(e);
    }
  }
  return NextResponse.json(out);
}
