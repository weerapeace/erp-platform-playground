/**
 * Shopee พากลับหลังร้านกดอนุญาต — /api/shopee/callback?state=&code=&shop_id=
 * แลก code → access/refresh token → ดึงข้อมูลร้าน (ชื่อ + วันหมดสิทธิ์) → เก็บลง platform_credentials (แบรนด์ × shopee)
 * ยืนยันด้วย state ที่เราเข้ารหัสเอง (brand_id มาจาก state เท่านั้น) · ไม่ guard เพราะ Shopee เป็นคนเรียก
 * ด่านกันพลาด (ล้อ TikTok/Lazada): ร้านนี้ต่ออยู่กับแบรนด์อื่น = บล็อก · แบรนด์นี้ต่อกับอีกร้านอยู่ = บล็อก · ชื่อร้านไม่ตรงแบรนด์ = เตือน
 * ⚠️ อ่านอย่างเดียว — ไม่แก้อะไรบนร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { shopeeCallbackParams, shopeeEnv, shopeeErrorText, shopeeExchangeCode, shopeeGetShopInfo, shopeeTokenTimes, type ShopeeShopInfo } from "@/lib/shopee";
import { ttsBrandMismatch as shopNameMismatch } from "@/lib/tiktok-shop";
import { baseUrl, brandNameOf, getPlatformId, loadShopeeConn, parseState, saveShopeeConn, shopeeShopConnectedElsewhere, type ShopeeConnMeta } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHORT_AUTH_DAYS = 300;   // ร้านเลือกอายุสิทธิ์สั้นกว่านี้ → เตือนให้เชื่อมใหม่แล้วเลือก 365 วัน

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const done = (p: string) => NextResponse.redirect(`${baseUrl()}/admin/platform-accounts?${p}`);
  const err = (m: string, brandId?: string) => done(`shp_error=${encodeURIComponent(m)}${brandId ? `&brand=${encodeURIComponent(brandId)}` : ""}`);

  const p = shopeeCallbackParams(url.searchParams);
  if (url.searchParams.get("error") || !p.code) return err("ร้านไม่ได้กดอนุญาต หรือ Shopee ยกเลิกการเชื่อมต่อ");
  if (!p.state) return err("ไม่รู้ว่าเป็นแบรนด์ไหน — ให้กดปุ่ม เชื่อมต่อ Shopee จากหน้านี้ (อย่าเปิดลิงก์อนุญาตจาก Shopee Open Platform ตรง ๆ)");
  const brandId = await parseState(p.state);
  if (!brandId) return err("ลิงก์เชื่อมต่อหมดอายุหรือไม่ถูกต้อง ลองกดเชื่อมต่อใหม่");

  try {
    const admin = supabaseAdmin();
    const spId = await getPlatformId(admin, "shopee");
    if (!spId) return err("ไม่พบแพลตฟอร์ม shopee ในระบบ", brandId);
    const tok = await shopeeExchangeCode(p.code, { shopId: p.shopId, mainAccountId: p.mainAccountId });
    const shopId = p.shopId || (tok.shop_id_list.length === 1 ? String(tok.shop_id_list[0]) : "");
    if (!shopId) return err(tok.shop_id_list.length > 1
      ? `บัญชีที่กดอนุญาตเป็นบัญชีหลักที่มี ${tok.shop_id_list.length} ร้าน — ให้เชื่อมใหม่โดยเข้าสู่ระบบด้วยบัญชีของร้านที่ต้องการ (ร้านละ 1 แบรนด์)`
      : "Shopee ไม่ส่งรหัสร้านกลับมา — ลองกดเชื่อมต่อใหม่", brandId);
    const brandName = await brandNameOf(admin, brandId);

    // ด่าน 1 (บล็อก): ร้านนี้ต่ออยู่กับแบรนด์อื่นแล้ว — 1 ร้านต้องอยู่แบรนด์เดียว
    const other = await shopeeShopConnectedElsewhere(admin, spId, brandId, shopId);
    if (other) {
      await writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: null, actorName: "shopee_oauth", metadata: { brand_id: brandId, platform: "shopee", shop_id: shopId, blocked: "shop_connected_to_other_brand", other_brand: other } });
      return err(`ร้าน Shopee นี้ (รหัส ${shopId}) เชื่อมอยู่กับแบรนด์ ${other} แล้ว — ถ้าเลือกแบรนด์ผิด ให้เลือกแบรนด์ ${other} › Shopee › กด ตัดการเชื่อมต่อ ก่อน แล้วค่อยกลับมาเชื่อมที่แบรนด์ ${brandName ?? "นี้"}`, brandId);
    }
    // ด่าน 2 (บล็อก): แบรนด์นี้ต่อกับอีกร้านอยู่ (ล็อกอินผิดบัญชีตอนเชื่อมใหม่) — ต้องตัดการเชื่อมต่อร้านเดิมเองก่อน
    const cur = await loadShopeeConn(admin, brandId, spId);
    if (cur?.meta.stage === "connected" && cur.meta.shop_id && cur.meta.shop_id !== shopId) {
      await writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: null, actorName: "shopee_oauth", metadata: { brand_id: brandId, platform: "shopee", shop_id: shopId, blocked: "brand_has_other_shop", current_shop_id: cur.meta.shop_id } });
      return err(`แบรนด์ ${brandName ?? "นี้"} เชื่อมกับร้าน "${cur.meta.shop_name ?? cur.meta.shop_id}" อยู่ แต่รอบนี้เข้าสู่ระบบเป็นอีกร้าน (รหัส ${shopId}) — ถ้าตั้งใจเปลี่ยนร้าน ให้กด ตัดการเชื่อมต่อ ก่อน แล้วเชื่อมใหม่`, brandId);
    }

    // ข้อมูลร้าน (ชื่อ + วันหมดสิทธิ์) — ดึงไม่ได้ไม่ทำให้การเชื่อมพัง (กด "ตรวจการเชื่อมต่อ" ซ้ำได้)
    let info: ShopeeShopInfo | null = null, infoError: string | null = null;
    try { info = await shopeeGetShopInfo(tok.access_token, shopId); }
    catch (e) { infoError = shopeeErrorText(e); }

    const meta: ShopeeConnMeta = {
      stage: "connected", env: shopeeEnv(), shop_id: shopId,
      shop_name: info?.shop_name ?? null, region: info?.region ?? null, shop_status: info?.status ?? null,
      ...shopeeTokenTimes(tok), auth_expires_at: info?.auth_expires_at ?? null, connected_at: new Date().toISOString(),
    };
    await saveShopeeConn(admin, brandId, spId, tok.access_token, tok.refresh_token, meta, null);

    // เติมรหัสร้าน (ตัวเลข) ในบัญชีร้านของแบรนด์ ถ้ายังว่าง → ลิงก์หน้าสินค้า Shopee ในระบบใช้ได้ (ไม่ทับที่กรอกเอง)
    await admin.from("platform_accounts").update({ external_shop_id: shopId, updated_at: new Date().toISOString() })
      .eq("brand_id", brandId).eq("platform_id", spId).is("external_shop_id", null);

    // ด่าน 3 (เตือน): ชื่อร้านไม่ตรงชื่อแบรนด์ / ร้านเลือกอายุสิทธิ์สั้น
    const mismatch = shopNameMismatch(info?.shop_name, brandName);
    const authDays = info?.auth_expires_at ? Math.floor((info.auth_expires_at - Date.now()) / 86_400_000) : null;
    await writeAudit(admin, {
      action: "update", entityType: "platform_credential", entityId: null, actorId: null, actorName: "shopee_oauth",
      metadata: { brand_id: brandId, platform: "shopee", env: meta.env, shop_id: shopId, shop_name: meta.shop_name, region: meta.region, auth_days: authDays, info_error: infoError, brand_mismatch: mismatch },
    });
    const warns = [
      mismatch ? `ร้านที่เชื่อมชื่อ "${info?.shop_name}" แต่แบรนด์ที่เลือกอยู่คือ "${brandName}" — ถ้าเลือกแบรนด์ผิด ให้กด ตัดการเชื่อมต่อ แล้วไปเชื่อมที่แบรนด์ที่ถูก` : null,
      authDays != null && authDays < SHORT_AUTH_DAYS ? `ร้านให้สิทธิ์ไว้แค่ ${authDays} วัน — แนะนำกด เชื่อมใหม่ แล้วเลือกอายุสิทธิ์ 365 วัน` : null,
      infoError ? `เชื่อมแล้ว แต่ดึงข้อมูลร้านไม่ได้: ${infoError}` : null,
    ].filter(Boolean).join(" · ");
    return done(`shp_connected=1&brand=${encodeURIComponent(brandId)}${warns ? `&shp_warn=${encodeURIComponent(warns)}` : ""}`);
  } catch (e) {
    return err(`เชื่อมต่อไม่สำเร็จ: ${shopeeErrorText(e)}`, brandId);
  }
}
