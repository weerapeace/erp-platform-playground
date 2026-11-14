/**
 * แก้ชื่อ / รายละเอียด สินค้าบน Shopee — ลิ้นชักสินค้าบนร้าน · เฟส 4A (แก้ร้านจริง · หน้าเว็บถามก่อนเสมอ)
 *  POST { listing_id, before: { name, description }, edit: { name?, description? } }   (products.platforms.publish)
 *
 *   ก่อนส่ง: ดึงสดจาก Shopee → ถ้าชื่อ/รายละเอียดบนร้านไม่ตรงกับตอนเปิดลิ้นชัก (before) = 409 (มีคนแก้ในร้านระหว่างนั้น → ไม่ทับ)
 *   → planShopeeEdit (ส่งเฉพาะช่องที่เปลี่ยน · ช่วงความยาวตามร้าน) → v2.product.update_item (ช่องที่ไม่ส่งคงเดิม)
 *   หลังส่ง: ดึงกลับตรวจว่าเปลี่ยนจริง → สำเนาย่อในระบบ → ประวัติ (audit shopee_listing_edit · ทั้งสำเร็จ/ไม่สำเร็จ)
 *  → ShopeeWriteResponse
 * ⚠️ ไม่แตะราคา/สต๊อก/รูป/ตัวเลือก (เฟสถัดไป · สต๊อกไม่แก้ตราบที่ BigSeller ยังซิงค์)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { shopeeErrorText, shopeeUpdateItem } from "@/lib/shopee";
import { planShopeeEdit, shopeeListingView, type ShopeeWriteResponse } from "@/lib/shopee-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadShopeeListingLive, refetchShopeeLive, saveShopeeSlimCopy, shopeeWriteEcho } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: ShopeeWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const norm = (s: unknown) => String(s ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
const GONE_MSG = "สินค้านี้ติดป้าย “ไม่อยู่บนร้านแล้ว” — กดดึงตัวนี้จาก Shopee ก่อน";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before?: { name?: string; description?: string }; edit?: { name?: string | null; description?: string | null } };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId || !body.edit || !body.before) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + before + edit)" }, 400);

  const admin = supabaseAdmin();
  const r = await loadShopeeListingLive(admin, listingId, user?.id ?? null);
  if (!r.ok) return reply({ ok: false, view: null, error: r.error }, r.status);
  if (isGoneStatus(r.row.status)) return reply({ ok: false, view: null, error: GONE_MSG }, 400);
  const view = r.view;
  // มีคนแก้บนร้านระหว่างที่เปิดลิ้นชัก → ไม่ทับ (ให้ตรวจของล่าสุดแล้วแก้อีกครั้ง)
  const changedOnShop = (body.edit.name != null && norm(body.before.name) !== norm(view.name))
    || (body.edit.description != null && norm(body.before.description) !== norm(view.description));
  if (changedOnShop) return reply({ ok: false, view, error: "ชื่อหรือรายละเอียดบนร้าน Shopee เปลี่ยนไปหลังจากเปิดหน้านี้ (อาจมีคนแก้ใน Seller Centre) — ระบบโหลดของล่าสุดให้แล้ว ตรวจแล้วแก้ใหม่อีกครั้ง" }, 409);

  const plan = planShopeeEdit(view, { name: body.edit.name ?? null, description: body.edit.description ?? null });
  if (plan.errors.length) return reply({ ok: false, view, error: plan.errors.join(" · ") }, 400);
  if (!plan.changes.length) return reply({ ok: true, view, summary: "ไม่มีอะไรเปลี่ยน", error: null });

  // ประวัติแบบกลาง "จากอะไรเป็นอะไร" (auditDiff) + ป้ายภาษาไทย (ลิ้นชักอ่าน label)
  const before: Record<string, unknown> = { item_name: view.name, ...(plan.body.description != null ? { description: view.description } : {}) };
  const changes = auditDiff(before, plan.body).map((c) => ({ ...c, label: c.field === "item_name" ? "ชื่อสินค้า" : "รายละเอียด" }));
  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: r.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "shopee_listing_edit", item_id: r.itemId, shop_id: r.shopId, changes, ...meta },
  });
  let echo: ReturnType<typeof shopeeWriteEcho>;
  try {
    echo = shopeeWriteEcho(await shopeeUpdateItem(r.accessToken, r.shopId, r.itemId, plan.body));
  } catch (e) {
    const error = shopeeErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message });
    return reply({ ok: false, view, error: `แก้บน Shopee ไม่สำเร็จ: ${error}` }, 502);
  }

  // ดึงกลับตรวจว่าเปลี่ยนจริง (รอจนเห็นค่าที่ส่ง ~9 วิ — ข้อมูลฝั่ง Shopee อัปเดตช้ากว่าคำตอบ)
  const warnings: string[] = [];
  if (echo.show) warnings.push(`Shopee แจ้ง: ${echo.show}`);
  const landed = (l: { base: Record<string, unknown> }) => {
    const v2 = shopeeListingView(l.base, null);
    return !!v2 && (plan.body.item_name == null || norm(v2.name) === norm(plan.body.item_name)) && (plan.body.description == null || norm(v2.description) === norm(plan.body.description));
  };
  const fresh = await refetchShopeeLive(r.accessToken, r.shopId, r.itemId, landed);
  // ✅ ลองจริง 2026-11-14 (BCG01-03): แก้ชื่อผ่าน แต่ข้อมูลที่ดึงกลับของ Shopee ช้ากว่าคำตอบ (ชื่อใหม่ขึ้นภายในไม่กี่นาที)
  //   → ยังไม่เห็นค่าใหม่ = แสดง/บันทึกตามที่ส่ง (optimistic) + บอกให้กดดึงตัวนี้ยืนยันภายหลัง
  const isLanded = !!fresh && landed(fresh);
  const shown = fresh ? (isLanded ? fresh : {
    ...fresh,
    base: { ...fresh.base, ...(plan.body.item_name != null ? { item_name: plan.body.item_name } : {}), ...(plan.body.description != null ? { description: plan.body.description } : {}) },
  }) : null;
  const freshView = shown ? shopeeListingView(shown.base, shown.models, view.limits) : null;
  if (!fresh) warnings.push("Shopee ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก Shopee” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
  else {
    if (!isLanded) warnings.push("Shopee รับคำสั่งแล้ว — ข้อมูลบนร้านมักอัปเดตช้า (ไม่กี่วินาที–ไม่กี่นาที) ระบบแสดงตามที่แก้ไว้ก่อน · กด “ดึงตัวนี้จาก Shopee” ภายหลังเพื่อยืนยัน");
    const st = String(fresh.base.item_status ?? "").toUpperCase();
    if (st && st !== view.status) warnings.push(`สถานะบนร้านเปลี่ยนเป็น “${st}” หลังแก้`);
  }
  if (shown) { const err = await saveShopeeSlimCopy(admin, r.row, shown); if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`); }
  const summary = `แก้${plan.changes.map((c) => c.label).join(" + ")}บน Shopee แล้ว`;
  await audit({ ok: true, summary, warnings, refreshed: !!fresh, optimistic: !!fresh && !isLanded, status_after: freshView?.status ?? null, shopee_warning: echo.warning, shopee_response: echo.response });
  return reply({ ok: true, view: freshView ?? view, summary, warnings, error: null });
}
