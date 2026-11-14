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
import { loadShopeeListingLive, refetchShopeeLive, saveShopeeSlimCopy } from "../shared";

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
  try {
    const resp = await shopeeUnlistItems(r.accessToken, r.shopId, [{ itemId: r.itemId, unlist: !open }]);
    const errs = shopeeUnlistErrors(resp, r.itemId);
    if (errs.length) {
      await audit({ ok: false, error: errs.join(" · ") });
      return reply({ ok: false, view, error: `${open ? "เปิด" : "ปิด"}ขายบน Shopee ไม่สำเร็จ: ${errs.join(" · ")}` }, 502);
    }
  } catch (e) {
    const error = shopeeErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message });
    return reply({ ok: false, view, error: `${open ? "เปิด" : "ปิด"}ขายบน Shopee ไม่สำเร็จ: ${error}` }, 502);
  }

  const warnings: string[] = [];
  const fresh = await refetchShopeeLive(r.accessToken, r.shopId, r.itemId);
  const freshView = fresh ? shopeeListingView(fresh.base, fresh.models, view.limits) : null;
  if (!freshView) warnings.push("Shopee ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก Shopee” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
  else if ((freshView.status === "NORMAL") !== open) warnings.push(`Shopee ตอบรับแล้ว แต่ยังเห็นสถานะ “${shopeeStatusBadge(freshView.status).label}” (อาจใช้เวลาสักครู่) — กดดึงตัวนี้อีกครั้งภายหลัง`);
  if (fresh) { const err = await saveShopeeSlimCopy(admin, r.row, fresh); if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`); }
  await audit({ ok: true, summary: plan.summary, status_after: freshView?.status ?? null, warnings, refreshed: !!freshView });
  return reply({ ok: true, view: freshView ?? view, summary: plan.summary, warnings, error: null });
}
