/**
 * Lazada เรียกกลับหลังร้านกดอนุญาต — /api/lazada/callback?code=&state=
 * แลก code → access/refresh token → เก็บลง platform_credentials (แบรนด์ × lazada) + ข้อมูลร้าน (seller_id/gateway)
 * ยืนยันด้วย state ที่เราเข้ารหัสเอง (brand_id มาจาก state เท่านั้น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { lazExchangeToken, lazGateway } from "@/lib/lazada";
import { baseUrl, parseState, getPlatformId, saveLazConn, type LazConnMeta } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const done = (p: string) => NextResponse.redirect(`${baseUrl()}/admin/platform-accounts?${p}`);
  const err = (m: string) => done(`laz_error=${encodeURIComponent(m)}`);

  const code = (url.searchParams.get("code") ?? "").trim();
  const state = (url.searchParams.get("state") ?? "").trim();
  if (!code || !state) return err("ข้อมูลไม่ครบจาก Lazada");
  const brandId = await parseState(state);
  if (!brandId) return err("ลิงก์เชื่อมต่อหมดอายุหรือไม่ถูกต้อง ลองกดเชื่อมต่อใหม่");

  try {
    const tok = await lazExchangeToken(code);
    const info = tok.country_user_info?.[0];
    const meta: LazConnMeta = {
      stage: "connected", seller_id: info?.seller_id, short_code: info?.short_code, account: tok.account,
      country: info?.country, gateway: lazGateway(info?.country),
      expires_at: Date.now() + (Number(tok.expires_in) || 0) * 1000,
      refresh_expires_at: Date.now() + (Number(tok.refresh_expires_in) || 0) * 1000,
      connected_at: new Date().toISOString(),
    };
    const admin = supabaseAdmin();
    const lazId = await getPlatformId(admin, "lazada");
    if (!lazId) return err("ไม่พบแพลตฟอร์ม lazada ในระบบ");
    await saveLazConn(admin, brandId, lazId, tok.access_token, tok.refresh_token, meta, null);
    await writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: null, actorName: "lazada_oauth", metadata: { brand_id: brandId, platform: "lazada", seller_id: info?.seller_id ?? null } });
    return done(`laz_connected=1&brand=${encodeURIComponent(brandId)}`);
  } catch (e) {
    return err(`เชื่อมต่อไม่สำเร็จ: ${(e as Error).message}`);
  }
}
