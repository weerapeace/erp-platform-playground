/**
 * เปิด / ปิดขาย สินค้าบน Shopee — ลิ้นชักสินค้าบนร้าน · เฟส 4A (แก้ร้านจริง · หน้าเว็บถามก่อนเสมอ)
 *  POST { listing_id, open: boolean }   (products.platforms.publish)
 *
 *   ปิด → v2.product.unlist_item unlist=true (UNLIST) · เปิด → unlist=false (กลับเป็น NORMAL)
 *   ก่อนทำ: ดึงสด → planShopeeDisplay (อยู่สถานะนั้นแล้ว = ไม่ส่ง · รอตรวจ/ถูกแบน/ลบ = บอกเหตุผล · อยู่ในโปรโมชัน = เตือน)
 *   หลังทำ: เช็ก failure_list (HTTP 200 แต่ไม่สำเร็จรายตัวได้ เช่น อยู่ในโปรโมชัน) → ดึงกลับตรวจ → สำเนาย่อ → ประวัติ (audit shopee_listing_display)
 *  → ShopeeWriteResponse
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { shopeeErrorText, shopeeUnlistItems } from "@/lib/shopee";
import { planShopeeDisplay, shopeeListingView, shopeeStatusBadge, shopeeUnlistErrors, type ShopeeWriteResponse } from "@/lib/shopee-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadShopeeListingLive, refetchShopeeLive, saveShopeeSlimCopy, shopeeWriteEcho } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: ShopeeWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; open?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId || typeof body.open !== "boolean") return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + open)" }, 400);
  const open = body.open;

  const admin = supabaseAdmin();
  const r = await loadShopeeListingLive(admin, listingId, user?.id ?? null);
  if (!r.ok) return reply({ ok: false, view: null, error: r.error }, r.status);
  if (isGoneStatus(r.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย “ไม่อยู่บนร้านแล้ว” — กดดึงตัวนี้จาก Shopee ก่อน" }, 400);
  const view = r.view;
  const plan = planShopeeDisplay(view, open);
  if (plan.errors.length) return reply({ ok: false, view, error: plan.errors.join(" · ") }, 400);
  if (plan.api === "none") return reply({ ok: true, view, summary: plan.summary, error: null });

  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: r.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      source: "shopee_listing_display", item_id: r.itemId, shop_id: r.shopId, name: view.name, open, in_promotion: view.inPromotion,
      changes: auditDiff({ item_status: view.status }, { item_status: open ? "NORMAL" : "UNLIST" }).map((c) => ({ ...c, label: "สถานะขาย" })),
      ...meta,
    },
  });
  let echo: ReturnType<typeof shopeeWriteEcho>;
  try {
    const resp = await shopeeUnlistItems(r.accessToken, r.shopId, [{ itemId: r.itemId, unlist: !open }]);
    echo = shopeeWriteEcho(resp);
    const errs = shopeeUnlistErrors(resp, r.itemId);
    if (errs.length) {
      await audit({ ok: false, error: errs.join(" · "), shopee_warning: echo.warning, shopee_response: echo.response });
      return reply({ ok: false, view, error: `${open ? "เปิด" : "ปิด"}ขายบน Shopee ไม่สำเร็จ: ${errs.join(" · ")}` }, 502);
    }
  } catch (e) {
    const error = shopeeErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message });
    return reply({ ok: false, view, error: `${open ? "เปิด" : "ปิด"}ขายบน Shopee ไม่สำเร็จ: ${error}` }, 502);
  }

  // ดึงกลับตรวจ (รอจนเห็นสถานะที่ส่ง ~9 วิ — ข้อมูลฝั่ง Shopee อัปเดตช้ากว่าคำตอบ)
  const warnings: string[] = [];
  if (echo.warning) warnings.push(`Shopee แจ้ง: ${echo.warning}`);
  const want = open ? "NORMAL" : "UNLIST";
  const fresh = await refetchShopeeLive(r.accessToken, r.shopId, r.itemId, (l) => String(l.base.item_status ?? "").toUpperCase() === want);
  // ✅ ลองจริง 2026-11-14 (BCG01-03): คำสั่งผ่านทุกครั้ง แต่ข้อมูลที่ดึงกลับของ Shopee ช้ากว่าคำตอบหลายวินาที–นาที
  //   → ถ้ายังไม่เห็นค่าใหม่ ให้แสดง/บันทึกตามที่สั่ง (optimistic) + บอกให้กดดึงตัวนี้ยืนยันภายหลัง (ล้อ Lazada lazRawAfterStatus)
  const landed = !!fresh && String(fresh.base.item_status ?? "").toUpperCase() === want;
  const shown = fresh ? (landed ? fresh : { ...fresh, base: { ...fresh.base, item_status: want } }) : null;
  const freshView = shown ? shopeeListingView(shown.base, shown.models, view.limits) : null;
  if (!fresh) warnings.push("Shopee ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก Shopee” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
  else if (!landed) warnings.push(`Shopee รับคำสั่งแล้ว — ข้อมูลบนร้านมักอัปเดตช้า (ไม่กี่วินาที–ไม่กี่นาที) ระบบแสดงเป็น “${shopeeStatusBadge(want).label}” ไว้ก่อน · กด “ดึงตัวนี้จาก Shopee” ภายหลังเพื่อยืนยัน`);
  if (shown) { const err = await saveShopeeSlimCopy(admin, r.row, shown); if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`); }
  await audit({ ok: true, summary: plan.summary, status_after: freshView?.status ?? null, optimistic: !!fresh && !landed, warnings, refreshed: !!fresh, shopee_warning: echo.warning, shopee_response: echo.response });
  return reply({ ok: true, view: freshView ?? view, summary: plan.summary, warnings, error: null });
}
