/**
 * Lazada เรียกกลับหลังร้านกดอนุญาต — /api/lazada/callback?code=&state=
 * แลก code → access/refresh token → เก็บลง platform_credentials (แบรนด์ × lazada) + ข้อมูลร้าน (seller_id/gateway)
 * ยืนยันด้วย state ที่เราเข้ารหัสเอง (brand_id มาจาก state เท่านั้น)
 * ด่านกันร้านผิดแบรนด์ (lazShopConflict) — 1 ร้าน = 1 แบรนด์ · ชน = ไม่บันทึกอะไรเลย + บอกเหตุผล + จด audit
 * เชื่อมไม่สำเร็จก็จด audit (เดิมไม่จด → ดูย้อนหลังไม่ได้ว่าเคยลองแล้วติดอะไร)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { lazExchangeToken, lazGateway, lazShopConflict } from "@/lib/lazada";
import { baseUrl, parseState, getPlatformId, saveLazConn, listLazCredRows, lazBrandName, loadLazApp, LAZ_APP_BROKEN, type LazConnMeta } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const done = (p: string) => NextResponse.redirect(`${baseUrl()}/admin/platform-accounts?${p}`);
  const err = (m: string, brandId?: string) => done(`laz_error=${encodeURIComponent(m)}${brandId ? `&brand=${encodeURIComponent(brandId)}` : ""}`);

  const code = (url.searchParams.get("code") ?? "").trim();
  const state = (url.searchParams.get("state") ?? "").trim();
  if (!code || !state) return err("ข้อมูลไม่ครบจาก Lazada");
  const brandId = await parseState(state);
  if (!brandId) return err("ลิงก์เชื่อมต่อหมดอายุหรือไม่ถูกต้อง ลองกดเชื่อมต่อใหม่");

  const admin = supabaseAdmin();
  const audit = (metadata: Record<string, unknown>) => writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: null, actorName: "lazada_oauth", metadata: { brand_id: brandId, platform: "lazada", ...metadata } });

  try {
    const lazId = await getPlatformId(admin, "lazada");
    if (!lazId) return err("ไม่พบแพลตฟอร์ม lazada ในระบบ", brandId);
    // แอปเดียวกับที่ใช้เปิดหน้าอนุญาต (oauth/start) — แบรนด์มีแอปของตัวเอง = ใช้แอปนั้น · ไม่มี = แอปกลาง
    const app = await loadLazApp(admin, brandId, lazId);
    if (app && !app.secret) return err(LAZ_APP_BROKEN, brandId);
    const tok = await lazExchangeToken(code, app);
    const info = tok.country_user_info?.[0];
    const shop = { seller_id: info?.seller_id ?? null, short_code: info?.short_code ?? null };

    // ด่าน (บล็อก): 1 ร้าน = 1 แบรนด์ — ชนแล้วไม่บันทึก token ใด ๆ (ร้าน/แบรนด์เดิมไม่ถูกแตะ)
    const conflict = lazShopConflict(await listLazCredRows(admin, lazId), brandId, shop);
    if (conflict) {
      const brandName = (await lazBrandName(admin, brandId)) ?? "นี้";
      const shopLabel = shop.short_code || shop.seller_id || "";
      if (conflict.kind === "other_brand") {
        const other = (await lazBrandName(admin, conflict.brand_id)) ?? "อื่น";
        await audit({ ...shop, blocked: "shop_connected_to_other_brand", other_brand: other });
        return err(`ไม่ได้บันทึก — บัญชีที่ล็อกอินเป็นร้าน Lazada ${shopLabel} ซึ่งเชื่อมอยู่กับแบรนด์ ${other} แล้ว · ถ้าจะเชื่อมแบรนด์ ${brandName} ให้กดเชื่อมต่อใหม่แล้วล็อกอินด้วยบัญชีผู้ขาย Lazada ของ ${brandName} (ถ้าตั้งใจย้ายร้านนี้มา ให้ไปที่แบรนด์ ${other} › Lazada › กด ตัดการเชื่อมต่อ ก่อน)`, brandId);
      }
      await audit({ ...shop, blocked: "brand_has_other_shop", current_short_code: conflict.current_short_code });
      const cur = conflict.current_short_code || "เดิม";
      return err(`ไม่ได้บันทึก — แบรนด์ ${brandName} เชื่อมกับร้าน Lazada ${cur} อยู่ แต่บัญชีที่ล็อกอินเป็นร้าน ${shopLabel} · ถ้าจะต่ออายุ ให้กดเชื่อมต่อใหม่แล้วล็อกอินร้าน ${cur} · ถ้าตั้งใจเปลี่ยนร้าน ให้กด ตัดการเชื่อมต่อ ก่อน`, brandId);
    }

    const meta: LazConnMeta = {
      stage: "connected", seller_id: info?.seller_id, short_code: info?.short_code, account: tok.account,
      country: info?.country, gateway: lazGateway(info?.country),
      expires_at: Date.now() + (Number(tok.expires_in) || 0) * 1000,
      refresh_expires_at: Date.now() + (Number(tok.refresh_expires_in) || 0) * 1000,
      connected_at: new Date().toISOString(),
    };
    await saveLazConn(admin, brandId, lazId, tok.access_token, tok.refresh_token, meta, null);
    await audit({ seller_id: info?.seller_id ?? null, short_code: info?.short_code ?? null, own_app_key: app?.key ?? null });
    return done(`laz_connected=1&brand=${encodeURIComponent(brandId)}`);
  } catch (e) {
    const msg = (e as Error).message;
    await audit({ failed: msg.slice(0, 300) });
    return err(`เชื่อมต่อไม่สำเร็จ: ${msg}`, brandId);
  }
}
