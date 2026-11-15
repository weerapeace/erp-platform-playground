/**
 * แก้ชื่อ / รายละเอียด / รูปสินค้า บน Shopee — ลิ้นชักสินค้าบนร้าน · เฟส 4A (ชื่อ/รายละเอียด) + 4C (รูป) · แก้ร้านจริง · หน้าเว็บถามก่อนเสมอ
 *  POST { listing_id, before?: { name, description }, edit?: { name?, description? }, images?: { before_ids, refs } }   (products.platforms.publish)
 *   images.refs = ชุดรูปใหม่ทั้งชุด เรียงตามลำดับ ("spi:<image_id>" = รูปเดิมบนร้าน · "r2:<key>" = รูปใหม่จากคลังรูปในระบบ)
 *
 *   ก่อนส่ง: ดึงสดจาก Shopee → ถ้าชื่อ/รายละเอียด/รูปบนร้านไม่ตรงกับตอนเปิดลิ้นชัก (before / before_ids) = 409 (มีคนแก้ในร้านระหว่างนั้น → ไม่ทับ)
 *   → planShopeeEdit + planShopeeImages (ส่งเฉพาะที่เปลี่ยน · ช่วงความยาว/จำนวนรูปตามร้าน)
 *   → รูปใหม่: ฝากกับ Shopee ทีละรูป (media_space.upload_image · shopeeUploadRef) — ฝากไม่ผ่าน = หยุด ไม่แก้สินค้า
 *   → v2.product.update_item ครั้งเดียว (ชื่อ/รายละเอียด/รูปที่เปลี่ยน · ช่องที่ไม่ส่งคงเดิม · รูป = แทนทั้งชุด)
 *   หลังส่ง: ดึงกลับตรวจว่าเปลี่ยนจริง (~9 วิ · ไม่ทัน = แสดงตามที่ส่ง) → สำเนาย่อในระบบ → ประวัติ (audit shopee_listing_edit · ทั้งสำเร็จ/ไม่สำเร็จ)
 *  → ShopeeWriteResponse
 * ⚠️ ไม่แตะราคา (→ /listing-prices) / สต๊อก / ตัวเลือก (สต๊อกไม่แก้ตราบที่ BigSeller ยังซิงค์)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { shopeeErrorText, shopeeUpdateItem } from "@/lib/shopee";
import { planShopeeEdit, planShopeeImages, shopeeImageIdOfRef, shopeeListingView, shopeeR2KeyOfRef, type ShopeeWriteResponse } from "@/lib/shopee-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { publicImageUrl } from "@/lib/line-shopping-server";
import { loadShopeeListingLive, refetchShopeeLive, saveShopeeSlimCopy, shopeeUploadRef, shopeeWriteEcho } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: ShopeeWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const norm = (s: unknown) => String(s ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? v as string[] : null);
const GONE_MSG = "สินค้านี้ติดป้าย “ไม่อยู่บนร้านแล้ว” — กดดึงตัวนี้จาก Shopee ก่อน";
const CONFLICT = "บนร้าน Shopee เปลี่ยนไปหลังจากเปิดหน้านี้ (อาจมีคนแก้ใน Seller Centre) — ระบบโหลดของล่าสุดให้แล้ว ตรวจแล้วแก้ใหม่อีกครั้ง";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before?: { name?: string; description?: string }; edit?: { name?: string | null; description?: string | null }; images?: { before_ids?: unknown; refs?: unknown } };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  const wantText = !!body.edit && !!body.before;
  const images = body.images ? { beforeIds: strList(body.images.before_ids), refs: strList(body.images.refs) } : null;
  if (images && (!images.beforeIds || !images.refs)) return reply({ ok: false, view: null, error: "ข้อมูลรูปไม่ครบ (before_ids + refs)" }, 400);
  if (!listingId || (!wantText && !images)) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + ชื่อ/รายละเอียด หรือ รูป)" }, 400);

  const admin = supabaseAdmin();
  const r = await loadShopeeListingLive(admin, listingId, user?.id ?? null);
  if (!r.ok) return reply({ ok: false, view: null, error: r.error }, r.status);
  if (isGoneStatus(r.row.status)) return reply({ ok: false, view: null, error: GONE_MSG }, 400);
  const view = r.view;
  // มีคนแก้บนร้านระหว่างที่เปิดลิ้นชัก → ไม่ทับ (ให้ตรวจของล่าสุดแล้วแก้อีกครั้ง)
  const changedOnShop = wantText && ((body.edit!.name != null && norm(body.before!.name) !== norm(view.name))
    || (body.edit!.description != null && norm(body.before!.description) !== norm(view.description)));
  if (changedOnShop) return reply({ ok: false, view, error: `ชื่อหรือรายละเอียด${CONFLICT}` }, 409);
  if (images && images.beforeIds!.join("\n") !== view.imageIds.join("\n")) return reply({ ok: false, view, error: `รูปสินค้า${CONFLICT}` }, 409);

  const plan = planShopeeEdit(view, wantText ? { name: body.edit!.name ?? null, description: body.edit!.description ?? null } : {});
  const imgPlan = images ? planShopeeImages(view, images.refs!) : null;
  const imgChanged = !!imgPlan?.changed;
  const errors = [...plan.errors, ...(imgChanged ? imgPlan!.errors : [])];
  if (errors.length) return reply({ ok: false, view, error: errors.join(" · ") }, 400);
  if (!plan.changes.length && !imgChanged) return reply({ ok: true, view, summary: "ไม่มีอะไรเปลี่ยน", error: null });

  // ประวัติแบบกลาง "จากอะไรเป็นอะไร" (auditDiff) + ป้ายภาษาไทย (ลิ้นชักอ่าน label)
  const before: Record<string, unknown> = { ...(plan.body.item_name != null ? { item_name: view.name } : {}), ...(plan.body.description != null ? { description: view.description } : {}) };
  const changes: Record<string, unknown>[] = auditDiff(before, plan.body).map((c) => ({ ...c, label: c.field === "item_name" ? "ชื่อสินค้า" : "รายละเอียด" }));
  if (imgChanged) changes.push({ field: "image_id_list", label: "รูปสินค้า", old: view.imageIds, new: imgPlan!.refs, text: `${imgPlan!.changes[0]?.before ?? ""} → ${imgPlan!.changes[0]?.after ?? ""}` });
  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: r.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "shopee_listing_edit", item_id: r.itemId, shop_id: r.shopId, changes, ...meta },
  });

  // รูปใหม่ → ฝากกับ Shopee ก่อน (ทีละรูป · ไม่ผ่าน = หยุด ยังไม่แก้สินค้า · รูปที่ฝากไปแล้วค้างในคลัง Shopee เฉย ๆ ไม่โผล่บนร้าน)
  const ratio = view.imageRatio === "3:4" ? "3:4" as const : "1:1" as const;
  const uploaded = new Map<string, { imageId: string; url: string | null }>();
  if (imgChanged) {
    const toUpload = imgPlan!.refs.filter((ref) => shopeeR2KeyOfRef(ref));
    for (const ref of toUpload) {
      try { uploaded.set(ref, await shopeeUploadRef(ref, ratio)); }
      catch (e) {
        const error = `ฝากรูปกับ Shopee ไม่สำเร็จ (${uploaded.size + 1}/${toUpload.length}): ${(e as Error).message} — ยังไม่ได้แก้สินค้า`;
        await audit({ ok: false, error, raw_error: (e as Error).message, uploaded: uploaded.size });
        return reply({ ok: false, view, error }, 502);
      }
    }
  }
  const sentIds = imgChanged ? imgPlan!.refs.map((ref) => shopeeImageIdOfRef(ref) ?? uploaded.get(ref)!.imageId) : null;
  const patch = { ...plan.body, ...(sentIds ? { image: { image_id_list: sentIds, ...(ratio === "3:4" ? { image_ratio: "3:4" } : {}) } } : {}) };

  let echo: ReturnType<typeof shopeeWriteEcho>;
  try {
    echo = shopeeWriteEcho(await shopeeUpdateItem(r.accessToken, r.shopId, r.itemId, patch));
  } catch (e) {
    const error = shopeeErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message, uploaded: uploaded.size, sent_ids: sentIds });
    return reply({ ok: false, view, error: `แก้บน Shopee ไม่สำเร็จ: ${error}${uploaded.size ? " (รูปที่ฝากไว้ยังไม่ถูกใช้ — ร้านยังใช้รูปเดิม)" : ""}` }, 502);
  }

  // ดึงกลับตรวจว่าเปลี่ยนจริง (รอจนเห็นค่าที่ส่ง ~9 วิ — ข้อมูลฝั่ง Shopee อัปเดตช้ากว่าคำตอบ)
  const warnings: string[] = [];
  if (echo.show) warnings.push(`Shopee แจ้ง: ${echo.show}`);
  // รูป: รูปเดิมต้องอยู่ตำแหน่งเดิมตามที่ส่ง + จำนวนเท่ากัน (รูปใหม่ Shopee อาจตั้งรหัสใหม่ — ไม่บังคับรหัสตรง)
  // ✅ ลองจริง 2026-11-15 BCG01-03 สลับปก: ดึงกลับเห็นลำดับใหม่ทันที · แต่คำตอบ update_item (echo.response.images) ยังเป็นลำดับเดิม → ตัดสินจากผลดึงกลับเท่านั้น
  const kept = new Set(imgChanged ? imgPlan!.refs.map(shopeeImageIdOfRef).filter((x): x is string => !!x) : []);
  const imagesLanded = (ids: string[]) => !sentIds || (ids.length === sentIds.length && sentIds.every((id, i) => !kept.has(id) || ids[i] === id));
  const landed = (l: { base: Record<string, unknown> }) => {
    const v2 = shopeeListingView(l.base, null);
    return !!v2 && (plan.body.item_name == null || norm(v2.name) === norm(plan.body.item_name)) && (plan.body.description == null || norm(v2.description) === norm(plan.body.description))
      && imagesLanded(v2.imageIds);
  };
  const fresh = await refetchShopeeLive(r.accessToken, r.shopId, r.itemId, landed);
  // ✅ ลองจริง 2026-11-14 (BCG01-03): แก้ชื่อผ่าน แต่ข้อมูลที่ดึงกลับของ Shopee ช้ากว่าคำตอบ (ชื่อใหม่ขึ้นภายในไม่กี่นาที)
  //   → ยังไม่เห็นค่าใหม่ = แสดง/บันทึกตามที่ส่ง (optimistic) + บอกให้กดดึงตัวนี้ยืนยันภายหลัง
  const isLanded = !!fresh && landed(fresh);
  const urlOfId = new Map(view.imageIds.map((id, i) => [id, view.images[i]]));
  const sentUrls = imgChanged ? imgPlan!.refs.map((ref) => {
    const id = shopeeImageIdOfRef(ref); if (id) return urlOfId.get(id) ?? "";
    const u = uploaded.get(ref); return u?.url ?? `${publicImageUrl(shopeeR2KeyOfRef(ref)!)}&w=800`;
  }) : null;
  const shown = fresh ? (isLanded ? fresh : {
    ...fresh,
    base: {
      ...fresh.base,
      ...(plan.body.item_name != null ? { item_name: plan.body.item_name } : {}),
      ...(plan.body.description != null ? { description: plan.body.description } : {}),
      ...(sentIds && sentUrls ? { image: { ...((fresh.base.image as Record<string, unknown> | undefined) ?? {}), image_id_list: sentIds, image_url_list: sentUrls } } : {}),
    },
  }) : null;
  const freshView = shown ? shopeeListingView(shown.base, shown.models, view.limits) : null;
  if (!fresh) warnings.push("Shopee ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก Shopee” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
  else {
    if (!isLanded) warnings.push("Shopee รับคำสั่งแล้ว — ข้อมูลบนร้านมักอัปเดตช้า (ไม่กี่วินาที–ไม่กี่นาที) ระบบแสดงตามที่แก้ไว้ก่อน · กด “ดึงตัวนี้จาก Shopee” ภายหลังเพื่อยืนยัน");
    const st = String(fresh.base.item_status ?? "").toUpperCase();
    if (st && st !== view.status) warnings.push(`สถานะบนร้านเปลี่ยนเป็น “${st}” หลังแก้`);
  }
  if (shown) { const err = await saveShopeeSlimCopy(admin, r.row, shown); if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`); }
  const labels = [...plan.changes.map((c) => c.label), ...(imgChanged ? ["รูปสินค้า"] : [])];
  const summary = `แก้${labels.join(" + ")}บน Shopee แล้ว`;
  await audit({
    ok: true, summary, warnings, refreshed: !!fresh, optimistic: !!fresh && !isLanded, status_after: freshView?.status ?? null,
    ...(imgChanged ? { uploaded: [...uploaded.entries()].map(([ref, u]) => ({ ref, image_id: u.imageId })), sent_ids: sentIds, ids_after: fresh ? shopeeListingView(fresh.base, null)?.imageIds ?? null : null } : {}),
    shopee_warning: echo.warning, shopee_response: echo.response,
  });
  return reply({ ok: true, view: freshView ?? view, summary, warnings, error: null });
}
