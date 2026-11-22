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
import { shopeeErrorText, shopeeUpdateItem, shopeeUpdateTierVariation } from "@/lib/shopee";
import { planShopeeOptionImages, shopeeOptionResolve, shopeeOptionUploadRefs, shopeeEditDescUploadRefs, shopeeEditResolveDesc, planShopeeEdit, planShopeeImages, shopeeImageIdOfRef, shopeeListingView, shopeeR2KeyOfRef, type ShopeeWriteResponse } from "@/lib/shopee-listing-edit";
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
  let body: { listing_id?: string; before?: { name?: string; description?: string }; edit?: { name?: string | null; description?: string | null }; images?: { before_ids?: unknown; refs?: unknown };
    /** รูปในรายละเอียด (extended · 2026-11-21): before_ids = รหัสรูปเดิมตอนเปิด (กันทับ) · refs = ชุดใหม่ "spi:<id>" / "r2:<key>" */
    desc_images?: { before_ids?: unknown; refs?: unknown };
    /** รูปของแต่ละตัวเลือก (2026-11-22): before = { ชื่อตัวเลือก: image_id เดิม } (กันทับ) · refs = { ชื่อตัวเลือก: "spi:<id>" | "r2:<key>" } · ส่งแยกจากอย่างอื่น */
    option_images?: { before?: unknown; refs?: unknown } };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  const wantText = !!body.edit && !!body.before;
  const images = body.images ? { beforeIds: strList(body.images.before_ids), refs: strList(body.images.refs) } : null;
  if (images && (!images.beforeIds || !images.refs)) return reply({ ok: false, view: null, error: "ข้อมูลรูปไม่ครบ (before_ids + refs)" }, 400);
  const descImgs = body.desc_images ? { beforeIds: strList(body.desc_images.before_ids), refs: strList(body.desc_images.refs) } : null;
  if (descImgs && (!descImgs.beforeIds || !descImgs.refs)) return reply({ ok: false, view: null, error: "ข้อมูลรูปในรายละเอียดไม่ครบ (before_ids + refs)" }, 400);
  const strMap = (v: unknown): Record<string, string> | null => (v && typeof v === "object" && !Array.isArray(v) && Object.values(v as object).every((x) => typeof x === "string") ? v as Record<string, string> : null);
  const optImgs = body.option_images ? { before: strMap(body.option_images.before), refs: strMap(body.option_images.refs) } : null;
  if (optImgs && (!optImgs.before || !optImgs.refs)) return reply({ ok: false, view: null, error: "ข้อมูลรูปตัวเลือกไม่ครบ (before + refs)" }, 400);
  if (optImgs && (wantText || images || descImgs)) return reply({ ok: false, view: null, error: "รูปตัวเลือกต้องส่งแยกจากชื่อ/รายละเอียด/รูปสินค้า (กดทีละอย่าง)" }, 400);
  if (!listingId || (!wantText && !images && !descImgs && !optImgs)) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + ชื่อ/รายละเอียด หรือ รูป)" }, 400);

  const admin = supabaseAdmin();
  const r = await loadShopeeListingLive(admin, listingId, user?.id ?? null);
  if (!r.ok) return reply({ ok: false, view: null, error: r.error }, r.status);
  if (isGoneStatus(r.row.status)) return reply({ ok: false, view: null, error: GONE_MSG }, 400);
  const view = r.view;

  // ───── รูปของแต่ละตัวเลือก (สี) → update_tier_variation (คำสั่งแยกของ Shopee · เจ้าของสั่ง 2026-11-22) ─────
  if (optImgs) {
    const t0 = view.optionTiers[0]?.options ?? [];
    const curMap = Object.fromEntries(t0.map((o) => [o.name, o.imageId ?? ""]));
    if (Object.entries(optImgs.before!).some(([k, id]) => k in curMap && curMap[k] !== id)) return reply({ ok: false, view, error: `รูปตัวเลือก${CONFLICT}` }, 409);
    const op = planShopeeOptionImages(view, optImgs.refs!);
    if (op.errors.length) return reply({ ok: false, view, error: op.errors.join(" · ") }, 400);
    if (!op.changed) return reply({ ok: true, view, summary: "ไม่มีอะไรเปลี่ยน", error: null });
    const optChanges = [{ field: "tier_variation.images", label: "รูปตัวเลือก", old: curMap, new: optImgs.refs, text: `${op.changes[0]?.before ?? ""} → ${op.changes[0]?.after ?? ""}` }];
    const auditOpt = (meta: Record<string, unknown>) => writeAudit(admin, {
      action: "update", entityType: "platform_catalog", entityId: r.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { source: "shopee_listing_edit", item_id: r.itemId, shop_id: r.shopId, changes: optChanges, ...meta },
    });
    // ฝากรูปใหม่ (จัตุรัสพื้นขาว แบบรูปสินค้า) · ไม่ผ่าน = หยุด ยังไม่แก้สินค้า
    const ratioO = view.imageRatio === "3:4" ? "3:4" as const : "1:1" as const;
    const upO = new Map<string, string>();
    for (const ref of shopeeOptionUploadRefs(op.tierVariation)) {
      try { upO.set(ref, (await shopeeUploadRef(ref, ratioO)).imageId); }
      catch (e) {
        const error = `ฝากรูปตัวเลือกกับ Shopee ไม่สำเร็จ (${upO.size + 1}): ${(e as Error).message} — ยังไม่ได้แก้สินค้า`;
        await auditOpt({ ok: false, error, raw_error: (e as Error).message });
        return reply({ ok: false, view, error }, 502);
      }
    }
    const tv = shopeeOptionResolve(op.tierVariation, upO);
    if (!tv) { const error = "เตรียมรูปตัวเลือกไม่ครบ — ยังไม่ได้แก้สินค้า"; await auditOpt({ ok: false, error }); return reply({ ok: false, view, error }, 502); }
    const beforeIds = view.models.map((m) => m.modelId).sort().join(",");
    const beforePrice = Object.fromEntries(view.models.map((m) => [m.modelId, m.originalPrice ?? m.price]));
    let echoO: ReturnType<typeof shopeeWriteEcho>;
    try { echoO = shopeeWriteEcho(await shopeeUpdateTierVariation(r.accessToken, r.shopId, r.itemId, tv)); }
    catch (e) {
      const error = shopeeErrorText(e);
      await auditOpt({ ok: false, error, raw_error: (e as Error).message, sent: tv });
      return reply({ ok: false, view, error: `เปลี่ยนรูปตัวเลือกบน Shopee ไม่สำเร็จ: ${error}` }, 502);
    }
    // ดึงกลับเช็ก: รูปที่เปลี่ยนต้องเปลี่ยนจริง · ตัวเลือก (model) ชุดเดิม · ราคาเดิม
    const oldIdx = new Map(t0.map((o, i) => [i, o.imageId ?? ""]));
    const changedIdx = t0.map((o, i) => ((optImgs.refs![o.name] ?? "") && (optImgs.refs![o.name] !== (o.imageId ? `spi:${o.imageId}` : "")) ? i : -1)).filter((i) => i >= 0);
    const landedO = (l: { base: Record<string, unknown>; models: Parameters<typeof shopeeListingView>[1] }) => {
      const v2 = shopeeListingView(l.base, l.models);
      const o2 = v2?.optionTiers[0]?.options ?? [];
      return !!v2 && changedIdx.every((i) => !!o2[i]?.imageId && o2[i].imageId !== oldIdx.get(i));
    };
    const freshO = await refetchShopeeLive(r.accessToken, r.shopId, r.itemId, landedO);
    const fv = freshO ? shopeeListingView(freshO.base, freshO.models, view.limits) : null;
    const warningsO: string[] = [...op.warnings.filter((w) => !w.startsWith("เปลี่ยนเฉพาะรูป"))];
    if (echoO.show) warningsO.push(`Shopee แจ้ง: ${echoO.show}`);
    let structureChanged = false;
    if (!fv) warningsO.push("Shopee ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก Shopee” แล้วเช็กตัวเลือก/สต๊อกใน Seller Centre");
    else {
      const afterIds = fv.models.map((m) => m.modelId).sort().join(",");
      if (afterIds !== beforeIds) { structureChanged = true; warningsO.push("⚠️ ตัวเลือกบน Shopee ถูกสร้างใหม่ (รหัสตัวเลือกเปลี่ยน) — เช็กสต๊อกและการผูกใน BigSeller ด่วน"); }
      const priceMoved = fv.models.filter((m) => beforePrice[m.modelId] != null && (m.originalPrice ?? m.price) !== beforePrice[m.modelId]).length;
      if (priceMoved) warningsO.push(`⚠️ ราคาตั้งเปลี่ยน ${priceMoved} ตัวเลือกหลังส่ง — เช็กใน Seller Centre`);
      if (!landedO(freshO!)) warningsO.push("Shopee รับคำสั่งแล้ว — รูปบนร้านอาจอัปเดตช้า กด “ดึงตัวนี้จาก Shopee” ภายหลังเพื่อยืนยัน");
    }
    if (freshO) { const err = await saveShopeeSlimCopy(admin, r.row, freshO); if (err) warningsO.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`); }
    const summaryO = "เปลี่ยนรูปตัวเลือกบน Shopee แล้ว";
    await auditOpt({ ok: true, summary: summaryO, warnings: warningsO, refreshed: !!freshO, structure_changed: structureChanged, model_ids_before: beforeIds, model_ids_after: fv?.models.map((m) => m.modelId).sort().join(",") ?? null });
    return reply({ ok: true, view: fv ?? view, summary: summaryO, warnings: warningsO, error: null });
  }
  // มีคนแก้บนร้านระหว่างที่เปิดลิ้นชัก → ไม่ทับ (ให้ตรวจของล่าสุดแล้วแก้อีกครั้ง)
  const changedOnShop = wantText && ((body.edit!.name != null && norm(body.before!.name) !== norm(view.name))
    || (body.edit!.description != null && norm(body.before!.description) !== norm(view.description)));
  if (changedOnShop) return reply({ ok: false, view, error: `ชื่อหรือรายละเอียด${CONFLICT}` }, 409);
  if (images && images.beforeIds!.join("\n") !== view.imageIds.join("\n")) return reply({ ok: false, view, error: `รูปสินค้า${CONFLICT}` }, 409);
  if (descImgs && descImgs.beforeIds!.join("\n") !== view.descriptionImages.map((x) => x.id).join("\n")) return reply({ ok: false, view, error: `รูปในรายละเอียด${CONFLICT}` }, 409);

  const plan = planShopeeEdit(view, { ...(wantText ? { name: body.edit!.name ?? null, description: body.edit!.description ?? null } : {}), ...(descImgs ? { descImages: descImgs.refs! } : {}) });
  const imgPlan = images ? planShopeeImages(view, images.refs!) : null;
  const imgChanged = !!imgPlan?.changed;
  const errors = [...plan.errors, ...(imgChanged ? imgPlan!.errors : [])];
  if (errors.length) return reply({ ok: false, view, error: errors.join(" · ") }, 400);
  if (!plan.changes.length && !imgChanged) return reply({ ok: true, view, summary: "ไม่มีอะไรเปลี่ยน", error: null });

  // ประวัติแบบกลาง "จากอะไรเป็นอะไร" (auditDiff) + ป้ายภาษาไทย (ลิ้นชักอ่าน label)
  const before: Record<string, unknown> = { ...(plan.body.item_name != null ? { item_name: view.name } : {}), ...(plan.body.description != null ? { description: view.description } : {}) };
  const changes: Record<string, unknown>[] = auditDiff(before, { ...(plan.body.item_name != null ? { item_name: plan.body.item_name } : {}), ...(plan.body.description != null ? { description: plan.body.description } : {}) })
    .map((c) => ({ ...c, label: c.field === "item_name" ? "ชื่อสินค้า" : "รายละเอียด" }));
  for (const c of plan.changes.filter((x) => x.label === "รูปในรายละเอียด" || (x.label === "รายละเอียด" && plan.body.description_info))) {
    changes.push({ field: c.label === "รายละเอียด" ? "description_info.text" : "description_info.images", label: c.label, old: c.label === "รายละเอียด" ? view.description : view.descriptionImages.map((x) => x.id), new: c.label === "รายละเอียด" ? (plan.body.description_info?.extended_description.field_list.find((f) => f.field_type === "text")?.text ?? null) : descImgs?.refs ?? null, text: `${c.before} → ${c.after}` });
  }
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
  // รูปในรายละเอียดใหม่ → ฝากแบบคงสัดส่วน (scene desc) · ไม่ผ่าน = หยุด ยังไม่แก้สินค้า
  const descUp = new Map<string, string>();
  for (const ref of shopeeEditDescUploadRefs(plan.body)) {
    try { descUp.set(ref, (await shopeeUploadRef(ref, "raw")).imageId); }
    catch (e) {
      const error = `ฝากรูปในรายละเอียดกับ Shopee ไม่สำเร็จ (${descUp.size + 1}): ${(e as Error).message} — ยังไม่ได้แก้สินค้า`;
      await audit({ ok: false, error, raw_error: (e as Error).message, uploaded: uploaded.size + descUp.size });
      return reply({ ok: false, view, error }, 502);
    }
  }
  const descResolved = shopeeEditResolveDesc(plan.body, descUp);
  const sentIds = imgChanged ? imgPlan!.refs.map((ref) => shopeeImageIdOfRef(ref) ?? uploaded.get(ref)!.imageId) : null;
  const patch = { ...descResolved.body, ...(sentIds ? { image: { image_id_list: sentIds, ...(ratio === "3:4" ? { image_ratio: "3:4" } : {}) } } : {}) };
  const wantDescText = plan.body.description_info ? descResolved.text : plan.body.description ?? null;

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
    return !!v2 && (plan.body.item_name == null || norm(v2.name) === norm(plan.body.item_name)) && (wantDescText == null || norm(v2.description) === norm(wantDescText))
      && (!plan.body.description_info || v2.descriptionImages.length === descResolved.imageIds.length)
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
      ...(descResolved.body.description_info ? { description_type: "extended", description_info: descResolved.body.description_info } : {}),
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
