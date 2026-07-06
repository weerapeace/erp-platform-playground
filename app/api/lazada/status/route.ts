/**
 * สถานะเชื่อมต่อ Lazada ของแบรนด์ — /api/lazada/status?brand_id=...
 * GET → { configured, connected, seller_id, short_code, country }  (ไม่คืน token)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { lazConfigured } from "@/lib/lazada";
import { getPlatformId, loadLazConn } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  const out: { configured: boolean; connected: boolean; seller_id: string | null; short_code: string | null; country: string | null; error: null } = {
    configured: lazConfigured(), connected: false, seller_id: null, short_code: null, country: null, error: null,
  };
  if (!brandId) return NextResponse.json(out);
  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (lazId) {
    const conn = await loadLazConn(admin, brandId, lazId);
    if (conn?.meta.stage === "connected" && conn.accessToken) {
      out.connected = true;
      out.seller_id = conn.meta.seller_id ?? null;
      out.short_code = conn.meta.short_code ?? null;
      out.country = conn.meta.country ?? null;
    }
  }
  return NextResponse.json(out);
}
