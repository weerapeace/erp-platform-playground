/**
 * สถานะเชื่อมต่อ Lazada ของแบรนด์ — /api/lazada/status?brand_id=...
 * GET → { configured, connected, health, refresh_expires_at, days_left, seller_id, short_code, country }  (ไม่คืน token)
 *   health: none | connected | expiring (เหลือ ≤ 7 วัน) | expired (ต้องกดเชื่อมใหม่)
 *   connected = true เฉพาะตอนยังใช้งานได้จริง (เดิมขึ้น "เชื่อมต่อแล้ว" ทั้งที่หมดอายุไปแล้ว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { lazConfigured, lazConnHealth, type LazHealthState } from "@/lib/lazada";
import { getPlatformId, loadLazConn } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  const out: {
    configured: boolean; connected: boolean; health: LazHealthState; refresh_expires_at: number | null; days_left: number | null;
    seller_id: string | null; short_code: string | null; country: string | null; error: null;
  } = {
    configured: lazConfigured(), connected: false, health: "none", refresh_expires_at: null, days_left: null,
    seller_id: null, short_code: null, country: null, error: null,
  };
  if (!brandId) return NextResponse.json(out);
  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (lazId) {
    const conn = await loadLazConn(admin, brandId, lazId);
    if (conn?.meta.stage === "connected" && conn.accessToken) {
      const h = lazConnHealth(conn.meta);
      out.health = h.state;
      out.refresh_expires_at = h.refresh_expires_at;
      out.days_left = h.days_left;
      out.connected = h.state === "connected" || h.state === "expiring";
      out.seller_id = conn.meta.seller_id ?? null;
      out.short_code = conn.meta.short_code ?? null;
      out.country = conn.meta.country ?? null;
    }
  }
  return NextResponse.json(out);
}
