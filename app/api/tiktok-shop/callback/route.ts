/**
 * TikTok เรียกกลับหลังร้านกดอนุญาต — /api/tiktok-shop/callback?code=&state=
 * แลก code → access/refresh token → ดึงรายชื่อร้านที่อนุญาต (shop cipher) → เก็บลง platform_credentials (แบรนด์ × tiktok)
 * ยืนยันด้วย state ที่เราเข้ารหัสเอง (brand_id มาจาก state เท่านั้น) · ไม่ guard เพราะ TikTok เป็นคนเรียก
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { ttsExchangeToken, ttsGetAuthorizedShops, ttsErrorText, ttsBrandMismatch, type TtsShop } from "@/lib/tiktok-shop";
import { baseUrl, parseState, getPlatformId, saveTtsConn, ttsTokenTimes, brandNameOf, ttsShopConnectedElsewhere, type TtsConnMeta } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const done = (p: string) => NextResponse.redirect(`${baseUrl()}/admin/platform-accounts?${p}`);
  const err = (m: string) => done(`tts_error=${encodeURIComponent(m)}`);

  const code = (url.searchParams.get("code") ?? "").trim();
  const state = (url.searchParams.get("state") ?? "").trim();
  if (url.searchParams.get("error") || !code || code === "null") return err("ร้านไม่ได้กดอนุญาต หรือ TikTok ยกเลิกการเชื่อมต่อ");
  if (!state) return err("ไม่รู้ว่าเป็นแบรนด์ไหน — ให้กดปุ่ม เชื่อมต่อ TikTok Shop จากหน้านี้ (อย่าเปิดลิงก์อนุญาตจาก Partner Center ตรง ๆ)");
  const brandId = await parseState(state);
  if (!brandId) return err("ลิงก์เชื่อมต่อหมดอายุหรือไม่ถูกต้อง ลองกดเชื่อมต่อใหม่");

  try {
    const admin = supabaseAdmin();
    const ttId = await getPlatformId(admin, "tiktok");
    if (!ttId) return err("ไม่พบแพลตฟอร์ม tiktok ในระบบ");
    const tok = await ttsExchangeToken(code);
    const brandName = await brandNameOf(admin, brandId);

    // ด่าน 1 (บล็อก): ร้านนี้ต่ออยู่กับแบรนด์อื่นแล้ว — 1 ร้านต้องอยู่แบรนด์เดียว (เจอจริง 2026-11-12: ร้าน Louis Montini ไปติดแบรนด์ IG)
    const other = tok.open_id ? await ttsShopConnectedElsewhere(admin, ttId, brandId, tok.open_id) : null;
    if (other) {
      await writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: null, actorName: "tiktok_shop_oauth", metadata: { brand_id: brandId, platform: "tiktok", seller_name: tok.seller_name ?? null, blocked: "shop_connected_to_other_brand", other_brand: other } });
      return done(`tts_error=${encodeURIComponent(`ร้าน TikTok "${tok.seller_name ?? ""}" เชื่อมอยู่กับแบรนด์ ${other} แล้ว — ถ้าเลือกแบรนด์ผิด ให้เลือกแบรนด์ ${other} › TikTok › กด ตัดการเชื่อมต่อ ก่อน แล้วค่อยกลับมาเชื่อมที่แบรนด์ ${brandName ?? "นี้"}`)}&brand=${encodeURIComponent(brandId)}`);
    }

    let shops: TtsShop[] = [];
    let shopsError: string | null = null;
    try { shops = await ttsGetAuthorizedShops(tok.access_token); }
    catch (e) { shopsError = ttsErrorText(e); }   // ได้กุญแจแล้ว — ดึงรายชื่อร้านไม่ได้ไม่ทำให้การเชื่อมพัง (หน้าตั้งค่ากด "ตรวจการเชื่อมต่อ" ซ้ำได้)
    const meta: TtsConnMeta = {
      stage: "connected", open_id: tok.open_id, seller_name: tok.seller_name, seller_base_region: tok.seller_base_region,
      shops, granted_scopes: tok.granted_scopes ?? [], ...ttsTokenTimes(tok), connected_at: new Date().toISOString(),
    };
    await saveTtsConn(admin, brandId, ttId, tok.access_token, tok.refresh_token, meta, null);
    // ด่าน 2 (เตือน): ชื่อร้านไม่ตรงชื่อแบรนด์ — ชื่อร้านอาจต่างจากแบรนด์ได้จริง จึงไม่บล็อก แต่ขึ้นแดงในหน้าตั้งค่าจนกว่าจะแก้
    const mismatch = ttsBrandMismatch(tok.seller_name, brandName);
    await writeAudit(admin, {
      action: "update", entityType: "platform_credential", entityId: null, actorId: null, actorName: "tiktok_shop_oauth",
      metadata: { brand_id: brandId, platform: "tiktok", seller_name: tok.seller_name ?? null, region: tok.seller_base_region ?? null, shops: shops.map((s) => s.name), shops_error: shopsError, brand_mismatch: mismatch },
    });
    const warns = [
      mismatch ? `ร้านที่เชื่อมชื่อ "${tok.seller_name}" แต่แบรนด์ที่เลือกอยู่คือ "${brandName}" — ถ้าเลือกแบรนด์ผิด ให้กด ตัดการเชื่อมต่อ แล้วไปเชื่อมที่แบรนด์ที่ถูก` : null,
      shopsError ? `เชื่อมแล้ว แต่ดึงรายชื่อร้านไม่ได้: ${shopsError}` : null,
    ].filter(Boolean).join(" · ");
    return done(`tts_connected=1&brand=${encodeURIComponent(brandId)}${warns ? `&tts_warn=${encodeURIComponent(warns)}` : ""}`);
  } catch (e) {
    return err(`เชื่อมต่อไม่สำเร็จ: ${ttsErrorText(e)}`);
  }
}
