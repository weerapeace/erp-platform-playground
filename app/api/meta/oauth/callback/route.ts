/**
 * Facebook เรียกกลับหลังผู้ใช้กดอนุญาต — /api/meta/oauth/callback?code=&state=
 * แลก code → token ระยะยาว → ดึงรายชื่อเพจ → เก็บลง platform_credentials (แบรนด์ × facebook)
 *  - เพจเดียว   → เชื่อมต่อเสร็จเลย (stage=connected)
 *  - หลายเพจ    → เก็บ user token ไว้ก่อน (stage=pending) + ให้เลือกเพจที่หน้า platform-accounts
 * ความปลอดภัย: ยืนยันด้วย state ที่เราเข้ารหัสเอง (ปลอมไม่ได้) — brand_id มาจาก state เท่านั้น
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { metaExchangeCode, metaLongLivedToken, metaGetPages } from "@/lib/meta-graph";
import { baseUrl, metaRedirectUri, parseState, getPlatformId, saveConn, type FbConnMeta } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const done = (params: string) => NextResponse.redirect(`${baseUrl()}/admin/platform-accounts?${params}`);
  const err = (msg: string) => done(`meta_error=${encodeURIComponent(msg)}`);

  const oauthErr = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthErr) return err(`ยกเลิก/ผิดพลาดจาก Facebook: ${oauthErr}`);

  const code = (url.searchParams.get("code") ?? "").trim();
  const state = (url.searchParams.get("state") ?? "").trim();
  if (!code || !state) return err("ข้อมูลไม่ครบจาก Facebook");
  const brandId = await parseState(state);
  if (!brandId) return err("ลิงก์เชื่อมต่อหมดอายุหรือไม่ถูกต้อง ลองกดเชื่อมต่อใหม่");

  try {
    const shortTok = await metaExchangeCode(code, metaRedirectUri());
    const longTok = await metaLongLivedToken(shortTok);
    const pages = await metaGetPages(longTok);
    if (pages.length === 0) return err("ไม่พบเพจ Facebook ที่คุณเป็นแอดมิน — ต้องมีเพจร้าน + เป็นแอดมินเพจนั้น");

    const admin = supabaseAdmin();
    const fbId = await getPlatformId(admin, "facebook");
    if (!fbId) return err("ไม่พบแพลตฟอร์ม facebook ในระบบ");

    if (pages.length === 1) {
      const p = pages[0];
      const meta: FbConnMeta = { stage: "connected", page_id: p.id, page_name: p.name, ig_user_id: p.ig_user_id, has_ig: !!p.ig_user_id, connected_at: new Date().toISOString() };
      await saveConn(admin, brandId, fbId, p.access_token, meta, null);
      await writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: null, actorName: "meta_oauth", metadata: { brand_id: brandId, platform: "facebook", connected_page: p.name } });
      return done(`meta_connected=1&brand=${encodeURIComponent(brandId)}`);
    }

    // หลายเพจ → เก็บ user token ระยะยาวไว้ก่อน ให้ผู้ใช้เลือกเพจ
    const meta: FbConnMeta = { stage: "pending", pages: pages.map((p) => ({ id: p.id, name: p.name, ig: !!p.ig_user_id })) };
    await saveConn(admin, brandId, fbId, longTok, meta, null);
    return done(`meta_pick=1&brand=${encodeURIComponent(brandId)}`);
  } catch (e) {
    return err(`เชื่อมต่อไม่สำเร็จ: ${(e as Error).message}`);
  }
}
