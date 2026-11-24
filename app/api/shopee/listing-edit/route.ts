/**
 * แก้ชื่อ / รายละเอียด / รูปสินค้า บน Shopee — ลิ้นชักสินค้าบนร้าน · เฟส 4A (ชื่อ/รายละเอียด) + 4C (รูป) · แก้ร้านจริง · หน้าเว็บถามก่อนเสมอ
 *  POST { listing_id, before?: { name, description }, edit?: { name?, description? }, images?: { before_ids, refs } }   (products.platforms.publish)
 *   images.refs = ชุดรูปใหม่ทั้งชุด เรียงตามลำดับ ("spi:<image_id>" = รูปเดิมบนร้าน · "r2:<key>" = รูปใหม่จากคลังรูปในระบบ)
 *   attributes = ข้อมูลจำเพาะ (2026-11-23): { before: ค่าบนร้านตอนเปิด (กันทับ), values: ช่องที่แก้ (state ช่องกรอกกลาง), fields?: [{id,name,required}] }
 *     → ส่ง attribute_list ทั้งชุด (ของเดิม + ที่แก้) ไปพร้อม update_item ครั้งเดียวกัน
 *   options = ตัวเลือก (2026-11-24 · ส่งแยกจากอย่างอื่น): { before: { names, image_ids, model_ids } (กันทับ), names?: { index: ชื่อใหม่ }, images?: { index: ref }, add?: ShopeeOptionAdd[] }
 *     → update_tier_variation (ทุกชั้น + model_list ของ model เดิม) แล้ว add_model ให้สีใหม่ (สต๊อก 0) · เพิ่มไม่ผ่าน = เอาสีใหม่ที่ค้างออก
 *   option_images = แบบเดิม 2026-11-22 (เปลี่ยนรูปตามชื่อ) — ตัวตรวจร้าน↔ระบบยังใช้ · แปลงเป็น options ข้างใน
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
import { shopeeAddModel, shopeeErrorText, shopeeUpdateItem, shopeeUpdateTierVariation } from "@/lib/shopee";
import { planShopeeOptionEdit, shopeeOptionEditLanded, type ShopeeOptionWant, shopeeOptionResolve, shopeeOptionUploadRefs, shopeeEditDescUploadRefs, shopeeEditResolveDesc, planShopeeEdit, planShopeeImages, shopeeImageIdOfRef, shopeeListingView, shopeeR2KeyOfRef, planShopeeAttrs, shopeeAttrStateOf, shopeeAttrValSig, type ShopeeWriteResponse } from "@/lib/shopee-listing-edit";
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
    option_images?: { before?: unknown; refs?: unknown };
    /** ตัวเลือก (2026-11-24): ชื่อ · รูป · เพิ่มสี */
    options?: { before?: { names?: unknown; image_ids?: unknown; model_ids?: unknown }; names?: unknown; images?: unknown; add?: unknown };
    /** ข้อมูลจำเพาะ (2026-11-23) */
    attributes?: { before?: unknown; values?: unknown; fields?: unknown } };
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
  const idxMap = (v: unknown): Record<number, string> | null => { const m = strMap(v ?? {}); if (!m) return null; const o: Record<number, string> = {}; for (const [k, x] of Object.entries(m)) { const i = Number(k); if (!Number.isInteger(i) || i < 0) return null; o[i] = x; } return o; };
  const addList = (v: unknown): ShopeeOptionWant["add"] | null => {
    if (v == null) return [];
    if (!Array.isArray(v)) return null;
    const out: NonNullable<ShopeeOptionWant["add"]> = [];
    for (const x of v) {
      const o = (x && typeof x === "object" ? x : null) as Record<string, unknown> | null; if (!o) return null;
      const n = (p: unknown) => (p == null || p === "" ? null : Number.isFinite(Number(p)) ? Number(p) : null);
      const sizes = Array.isArray(o.sizes) ? (o.sizes as unknown[]).map((z) => { const q = (z && typeof z === "object" ? z : {}) as Record<string, unknown>; return { index: Number(q.index), sku: String(q.sku ?? ""), price: n(q.price) }; }) : undefined;
      out.push({ name: String(o.name ?? ""), image: o.image == null ? null : String(o.image), sku: String(o.sku ?? ""), price: n(o.price), ...(sizes ? { sizes } : {}) });
    }
    return out;
  };
  let optIn: { before: { names: string[] | null; imageIds: string[] | null; modelIds: string[] | null; byName: Record<string, string> | null }; want: ShopeeOptionWant } | null = null;
  if (body.options) {
    const o = body.options, names = idxMap(o.names), imgs = idxMap(o.images), add = addList(o.add);
    const bn = strList(o.before?.names), bi = strList(o.before?.image_ids), bm = strList(o.before?.model_ids);
    if (!names || !imgs || !add || !bn || !bi || !bm) return reply({ ok: false, view: null, error: "ข้อมูลตัวเลือกไม่ครบ (before.names/image_ids/model_ids + names/images/add)" }, 400);
    optIn = { before: { names: bn, imageIds: bi, modelIds: bm, byName: null }, want: { names, images: imgs, add } };
  }
  if (optImgs && optIn) return reply({ ok: false, view: null, error: "ส่ง option_images กับ options พร้อมกันไม่ได้" }, 400);
  const attrsIn = body.attributes ? { before: shopeeAttrStateOf(body.attributes.before), values: shopeeAttrStateOf(body.attributes.values),
    fields: Array.isArray(body.attributes.fields) ? (body.attributes.fields as unknown[]).map((x) => { const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>; return { id: String(o.id ?? ""), name: String(o.name ?? o.id ?? ""), required: o.required === true }; }).filter((x) => x.id) : null } : null;
  if ((optImgs || optIn) && (wantText || images || descImgs || attrsIn)) return reply({ ok: false, view: null, error: "ตัวเลือกต้องส่งแยกจากชื่อ/รายละเอียด/รูปสินค้า (กดทีละอย่าง)" }, 400);
  if (!listingId || (!wantText && !images && !descImgs && !optImgs && !optIn && !attrsIn)) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + ชื่อ/รายละเอียด หรือ รูป)" }, 400);

  const admin = supabaseAdmin();
  const r = await loadShopeeListingLive(admin, listingId, user?.id ?? null);
  if (!r.ok) return reply({ ok: false, view: null, error: r.error }, r.status);
  if (isGoneStatus(r.row.status)) return reply({ ok: false, view: null, error: GONE_MSG }, 400);
  const view = r.view;
  // แบบเดิม (เปลี่ยนรูปตามชื่อตัวเลือก) → ตัวเลือกแบบใหม่ (ตำแหน่ง → ref)
  if (optImgs) {
    const t0n = view.optionTiers[0]?.options.map((o) => o.name) ?? [];
    const images: Record<number, string> = {};
    t0n.forEach((n, i) => { const ref = String(optImgs.refs![n] ?? "").trim(); if (ref) images[i] = ref; });
    optIn = { before: { names: null, imageIds: null, modelIds: null, byName: optImgs.before! }, want: { images } };
  }

  // ───── ตัวเลือก (สี): ชื่อ · รูป · เพิ่มสี → update_tier_variation (+ add_model) · คำสั่งแยกของ Shopee (2026-11-22 รูป · 2026-11-24 ชื่อ/เพิ่มสี) ─────
  if (optIn) {
    const t0 = view.optionTiers[0]?.options ?? [];
    // กันทับ: ชื่อ/รูป/ชุดตัวเลือกบนร้านต้องยังเหมือนตอนเปิดลิ้นชัก
    const curNames = t0.map((o) => o.name), curImgs = t0.map((o) => o.imageId ?? ""), curModels = view.models.map((m) => m.modelId).sort();
    const b = optIn.before;
    if ((b.names && b.names.join("\n") !== curNames.join("\n")) || (b.imageIds && b.imageIds.join("\n") !== curImgs.join("\n"))
      || (b.modelIds && [...b.modelIds].sort().join(",") !== curModels.join(","))
      || (b.byName && Object.entries(b.byName).some(([k, id]) => curNames.includes(k) && curImgs[curNames.indexOf(k)] !== id))) {
      return reply({ ok: false, view, error: `ตัวเลือก${CONFLICT}` }, 409);
    }
    const want = optIn.want;
    const op = planShopeeOptionEdit(view, want);
    if (op.errors.length) return reply({ ok: false, view, error: op.errors.join(" · ") }, 400);
    if (!op.changed) return reply({ ok: true, view, summary: "ไม่มีอะไรเปลี่ยน", error: null });
    const optChanges = op.changes.map((c) => ({ field: c.label === "ชื่อตัวเลือก" ? "tier_variation.option" : c.label === "รูปตัวเลือก" ? "tier_variation.images" : "add_model", label: c.label, old: c.before, new: c.after, text: `${c.before} → ${c.after}` }));
    const auditOpt = (meta: Record<string, unknown>) => writeAudit(admin, {
      action: "update", entityType: "platform_catalog", entityId: r.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { source: "shopee_listing_edit", part: "options", item_id: r.itemId, shop_id: r.shopId, changes: optChanges, want, ...meta },
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
    const beforeIds = curModels.join(",");
    const beforePrice = Object.fromEntries(view.models.map((m) => [m.modelId, m.originalPrice ?? m.price]));
    let echoO: ReturnType<typeof shopeeWriteEcho>;
    try { echoO = shopeeWriteEcho(await shopeeUpdateTierVariation(r.accessToken, r.shopId, r.itemId, tv, op.modelList)); }
    catch (e) {
      const error = shopeeErrorText(e);
      await auditOpt({ ok: false, error, raw_error: (e as Error).message, sent: { tier_variation: tv, model_list: op.modelList } });
      return reply({ ok: false, view, error: `แก้ตัวเลือกบน Shopee ไม่สำเร็จ: ${error}` }, 502);
    }
    // สีใหม่ → add_model · ไม่ผ่าน = เอาตัวเลือกใหม่ที่ไม่มี model ออก (กลับเป็นชุดเดิม + ชื่อ/รูปที่แก้)
    const warningsO: string[] = [...op.warnings.filter((w) => !w.startsWith("ตัวเลือกเดิม ราคา"))];
    if (echoO.show) warningsO.push(`Shopee แจ้ง: ${echoO.show}`);
    let addError: string | null = null;
    if (op.addModels.length) {
      try { const e2 = shopeeWriteEcho(await shopeeAddModel(r.accessToken, r.shopId, r.itemId, op.addModels)); if (e2.show) warningsO.push(`Shopee แจ้ง: ${e2.show}`); }
      catch (e) {
        addError = shopeeErrorText(e);
        const back = tv.map((t, ti) => ti === 0 ? { ...t, option_list: ((t.option_list as unknown[]) ?? []).slice(0, t0.length) } : t);
        let undone = false;
        try { await shopeeUpdateTierVariation(r.accessToken, r.shopId, r.itemId, back, op.modelList); undone = true; } catch { /* แจ้งด้านล่าง */ }
        warningsO.push(undone ? `เพิ่มสีไม่สำเร็จ: ${addError} — เอาสีใหม่ที่ค้างออกแล้ว (ชื่อ/รูปที่แก้ยังอยู่)` : `เพิ่มสีไม่สำเร็จ: ${addError} — ⚠️ อาจมีสีใหม่ค้างโดยไม่มีราคา/สต๊อก ให้เช็กใน Seller Centre`);
        await auditOpt({ ok: false, step: "add_model", error: addError, raw_error: (e as Error).message, rollback: undone, sent: op.addModels });
      }
    }
    // ดึงกลับเช็ก: ตัวเลือกเดิมครบ (รหัส/ตำแหน่งเดิม) · ชื่อ/รูปเปลี่ยนจริง · สีใหม่ขึ้นครบ · ราคาเดิม
    const wantLanded: typeof want = addError ? { ...want, add: [] } : want;
    const landedO = (l: { base: Record<string, unknown>; models: Parameters<typeof shopeeListingView>[1] }) => shopeeOptionEditLanded(view, wantLanded, shopeeListingView(l.base, l.models)).length === 0;
    const freshO = await refetchShopeeLive(r.accessToken, r.shopId, r.itemId, landedO);
    const fv = freshO ? shopeeListingView(freshO.base, freshO.models, view.limits) : null;
    let structureChanged = false;
    if (!fv) warningsO.push("Shopee ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก Shopee” แล้วเช็กตัวเลือก/สต๊อกใน Seller Centre");
    else {
      const problems = shopeeOptionEditLanded(view, wantLanded, fv);
      if (problems.some((p) => p.startsWith("ตัวเลือกเดิม"))) { structureChanged = true; warningsO.push("⚠️ ตัวเลือกเดิมบน Shopee เปลี่ยน (รหัส/ตำแหน่ง) — เช็กสต๊อกและการผูกใน BigSeller ด่วน"); }
      const rest = problems.filter((p) => !p.startsWith("ตัวเลือกเดิม"));
      if (rest.length) warningsO.push(`Shopee รับคำสั่งแล้ว แต่ยังไม่ครบ: ${rest.join(" · ")} — กด “ดึงตัวนี้จาก Shopee” ภายหลังเพื่อยืนยัน`);
      const priceMoved = fv.models.filter((m) => beforePrice[m.modelId] != null && (m.originalPrice ?? m.price) !== beforePrice[m.modelId]).length;
      if (priceMoved) warningsO.push(`⚠️ ราคาตั้งเปลี่ยน ${priceMoved} ตัวเลือกหลังส่ง — เช็กใน Seller Centre`);
    }
    if (freshO) { const err = await saveShopeeSlimCopy(admin, r.row, freshO); if (err) warningsO.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`); }
    const parts = [op.changes.some((c) => c.label === "ชื่อตัวเลือก") ? "ชื่อ" : "", op.changes.some((c) => c.label === "รูปตัวเลือก") ? "รูป" : "", op.addModels.length && !addError ? `เพิ่ม ${(want.add ?? []).length} สี` : ""].filter(Boolean);
    const summaryO = parts.length ? `แก้ตัวเลือกบน Shopee แล้ว (${parts.join(" · ")})` : "ไม่มีอะไรเปลี่ยน";
    await auditOpt({ ok: !addError, summary: summaryO, warnings: warningsO, refreshed: !!freshO, structure_changed: structureChanged, model_ids_before: beforeIds, model_ids_after: fv?.models.map((m) => m.modelId).sort().join(",") ?? null });
    return reply({ ok: !addError || parts.length > 0, view: fv ?? view, summary: summaryO, warnings: warningsO, error: addError && !parts.length ? `เพิ่มสีไม่สำเร็จ: ${addError}` : null });
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
  // ข้อมูลจำเพาะ (2026-11-23): ช่องที่จะแก้ ต้องยังเป็นค่าเดิมตอนเปิดลิ้นชัก · ส่งทั้งชุด (ของเดิม + ที่แก้) ไม่ให้ช่องที่ไม่ได้แตะหาย
  if (attrsIn && Object.keys(attrsIn.values).some((id) => shopeeAttrValSig(attrsIn.before[id]) !== shopeeAttrValSig(view.attrs[id]))) return reply({ ok: false, view, error: `ข้อมูลจำเพาะ${CONFLICT}` }, 409);
  const attrPlan = attrsIn ? planShopeeAttrs(view, attrsIn.values, attrsIn.fields) : null;
  const attrChanged = !!attrPlan?.changed;
  const errors = [...plan.errors, ...(imgChanged ? imgPlan!.errors : []), ...(attrChanged ? attrPlan!.errors : [])];
  if (errors.length) return reply({ ok: false, view, error: errors.join(" · ") }, 400);
  if (!plan.changes.length && !imgChanged && !attrChanged) return reply({ ok: true, view, summary: "ไม่มีอะไรเปลี่ยน", error: null });

  // ประวัติแบบกลาง "จากอะไรเป็นอะไร" (auditDiff) + ป้ายภาษาไทย (ลิ้นชักอ่าน label)
  const before: Record<string, unknown> = { ...(plan.body.item_name != null ? { item_name: view.name } : {}), ...(plan.body.description != null ? { description: view.description } : {}) };
  const changes: Record<string, unknown>[] = auditDiff(before, { ...(plan.body.item_name != null ? { item_name: plan.body.item_name } : {}), ...(plan.body.description != null ? { description: plan.body.description } : {}) })
    .map((c) => ({ ...c, label: c.field === "item_name" ? "ชื่อสินค้า" : "รายละเอียด" }));
  for (const c of plan.changes.filter((x) => x.label === "รูปในรายละเอียด" || (x.label === "รายละเอียด" && plan.body.description_info))) {
    changes.push({ field: c.label === "รายละเอียด" ? "description_info.text" : "description_info.images", label: c.label, old: c.label === "รายละเอียด" ? view.description : view.descriptionImages.map((x) => x.id), new: c.label === "รายละเอียด" ? (plan.body.description_info?.extended_description.field_list.find((f) => f.field_type === "text")?.text ?? null) : descImgs?.refs ?? null, text: `${c.before} → ${c.after}` });
  }
  if (imgChanged) changes.push({ field: "image_id_list", label: "รูปสินค้า", old: view.imageIds, new: imgPlan!.refs, text: `${imgPlan!.changes[0]?.before ?? ""} → ${imgPlan!.changes[0]?.after ?? ""}` });
  if (attrChanged) for (const c of attrPlan!.changes) changes.push({ field: "attribute_list", label: c.label, old: c.before, new: c.after, text: `${c.before} → ${c.after}` });
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
  const patch = { ...descResolved.body, ...(sentIds ? { image: { image_id_list: sentIds, ...(ratio === "3:4" ? { image_ratio: "3:4" } : {}) } } : {}), ...(attrChanged ? { attribute_list: attrPlan!.payload } : {}) };
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
      && imagesLanded(v2.imageIds)
      && (!attrChanged || Object.entries(attrsIn!.values).every(([id, vals]) => !vals.length || shopeeAttrValSig(v2.attrs[id]) === shopeeAttrValSig(vals)));
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
  const labels = [...plan.changes.map((c) => c.label), ...(imgChanged ? ["รูปสินค้า"] : []), ...(attrChanged ? [`ข้อมูลจำเพาะ ${attrPlan!.changes.length} ช่อง`] : [])];
  if (attrChanged) warnings.push(...attrPlan!.warnings);
  const summary = `แก้${labels.join(" + ")}บน Shopee แล้ว`;
  await audit({
    ok: true, summary, warnings, refreshed: !!fresh, optimistic: !!fresh && !isLanded, status_after: freshView?.status ?? null,
    ...(imgChanged ? { uploaded: [...uploaded.entries()].map(([ref, u]) => ({ ref, image_id: u.imageId })), sent_ids: sentIds, ids_after: fresh ? shopeeListingView(fresh.base, null)?.imageIds ?? null : null } : {}),
    shopee_warning: echo.warning, shopee_response: echo.response,
  });
  return reply({ ok: true, view: freshView ?? view, summary, warnings, error: null });
}
