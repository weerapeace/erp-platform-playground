/**
 * สถานะเชื่อมต่อ Lazada ของแบรนด์ — /api/lazada/status?brand_id=...
 * GET → { configured, connected, health, refresh_expires_at, days_left, seller_id, short_code, country, own_app, default_app_ready, app_locked }  (ไม่คืน token / App Secret)
 *   health: none | connected | expiring (เหลือ ≤ 7 วัน) | expired (ต้องกดเชื่อมใหม่)
 *   connected = true เฉพาะตอนยังใช้งานได้จริง (เดิมขึ้น "เชื่อมต่อแล้ว" ทั้งที่หมดอายุไปแล้ว)
 *   own_app = แอปของแบรนด์เอง { app_key, secret_ok } (null = ใช้แอปกลาง) · configured = มีแอปพร้อมใช้ (ของแบรนด์ หรือแอปกลาง)
 *   app_locked = เชื่อมร้านอยู่ → เปลี่ยนแอปไม่ได้จนกว่าจะตัดการเชื่อมต่อ (token ผูกกับแอป)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { lazConfigured, lazConnHealth, lazAppLocked, type LazHealthState } from "@/lib/lazada";
import { getPlatformId, loadLazConn } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  const out: {
    configured: boolean; connected: boolean; health: LazHealthState; refresh_expires_at: number | null; days_left: number | null;
    seller_id: string | null; short_code: string | null; country: string | null;
    own_app: { app_key: string; secret_ok: boolean } | null; default_app_ready: boolean; app_locked: boolean; error: null;
  } = {
    configured: lazConfigured(), connected: false, health: "none", refresh_expires_at: null, days_left: null,
    seller_id: null, short_code: null, country: null, own_app: null, default_app_ready: lazConfigured(), app_locked: false, error: null,
  };
  if (!brandId) return NextResponse.json(out);
  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (lazId) {
    const conn = await loadLazConn(admin, brandId, lazId);
    if (conn?.app) {
      out.own_app = { app_key: conn.app.key, secret_ok: !!conn.app.secret };
      out.configured = lazConfigured(conn.app);
    }
    out.app_locked = lazAppLocked(conn?.meta);
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
