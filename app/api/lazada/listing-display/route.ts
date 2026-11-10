/**
 * เปิด / ปิดขาย สินค้าบน Lazada — ลิ้นชักสินค้าบนร้าน · เฟส 2 (แก้ร้านจริง)
 *  POST { listing_id, open: boolean, sku_ids?: string[] }   (products.platforms.publish)
 *   ไม่ส่ง sku_ids = ทั้งสินค้า · ส่ง = เฉพาะตัวเลือกนั้น
 *
 *   ปิด → /product/deactivate (ทั้งสินค้า = ระบุแค่ ItemId · บางตัว = ระบุ SkuId)
 *   เปิด → /product/update ตั้ง Status active เฉพาะตัวที่สั่ง (Lazada ไม่มี API เปิดขาย) — ส่ง SKU ครบตามลำดับเดิม ตัวอื่นคงสถานะเดิม
 *   ก่อนทำ: ดึงสดจาก Lazada → ข้ามตัวที่อยู่สถานะนั้นแล้ว (planLazadaDisplay) · หลังทำ: ดึงใหม่ตรวจผล + สำเนาย่อ + ประวัติ (audit)
 *  → LazadaWriteResponse
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lazDeactivateProduct, lazErrorText, lazUpdateProduct } from "@/lib/lazada";
import { lazadaListingView, lazDeactivateXml, lazRawAfterStatus, lazUpdateProductXml, lazViewAfterWrite, planLazadaDisplay, type LazadaWriteResponse } from "@/lib/lazada-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadLazListingLive, refetchLazItem, saveLazSlimCopy } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: LazadaWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; open?: unknown; sku_ids?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId || typeof body.open !== "boolean") return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + open)" }, 400);
  const skuIds = Array.isArray(body.sku_ids) ? (body.sku_ids as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];

  const admin = supabaseAdmin();
  const live = await loadLazListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return reply({ ok: false, view: null, error: live.error }, live.status);
  if (isGoneStatus(live.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย \"ไม่อยู่บนร้านแล้ว\" — กดดึงตัวนี้จาก Lazada ก่อน" }, 400);
  const view = lazadaListingView(live.item);
  if (!view) return reply({ ok: false, view: null, error: "Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" }, 502);

  const plan = planLazadaDisplay(view, { open: body.open, skuIds });
  if (plan.errors.length) return reply({ ok: false, view, error: plan.errors.join(" · ") }, 400);
  if (plan.api === "none") return reply({ ok: true, view, summary: plan.summary, error: null });

  const targets = plan.targets.map((s) => ({ sku_id: s.skuId, seller_sku: s.sellerSku, label: s.label }));
  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: live.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "lazada_listing_display", item_id: live.itemId, title: live.row.title, open: body.open, whole_item: plan.wholeItem, summary: plan.summary, targets, ...meta },
  });

  try {
    if (plan.api === "deactivate") await lazDeactivateProduct(live.gateway, live.accessToken, lazDeactivateXml(live.itemId, plan.wholeItem ? undefined : plan.targets.map((s) => s.skuId)));
    else await lazUpdateProduct(live.gateway, live.accessToken, lazUpdateProductXml(live.itemId, view.skus.map((s) => ({ skuId: s.skuId, sellerSku: s.sellerSku, status: s.status })), {}, plan.statusOverride));
  } catch (e) {
    const error = lazErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message });
    return reply({ ok: false, view, error: `${body.open ? "เปิด" : "ปิด"}ขายบน Lazada ไม่สำเร็จ: ${error}` }, 502);
  }

  // ดึงใหม่ → ตรวจว่าเปลี่ยนจริงทุกตัว (ลองซ้ำถ้า Lazada จำกัดความถี่)
  const warnings: string[] = [];
  const fresh = await refetchLazItem(live.gateway, live.accessToken, live.itemId);
  const freshView = fresh ? lazadaListingView(fresh) : null;
  if (!freshView) {
    // ส่งสำเร็จแล้ว แต่ดึงกลับไม่ได้ → แสดง/เก็บตามที่สั่ง + เตือนให้ยืนยันเอง (เคยโชว์ของเก่า = คนเข้าใจว่าไม่สำเร็จ)
    warnings.push("Lazada ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ (Lazada ตอบช้า) — ระบบแสดงตามที่สั่งไว้ก่อน กด “ดึงตัวนี้จาก Lazada” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
    const after = lazRawAfterStatus(live.row.raw?.lazada, plan.statusOverride);
    const { error: e2 } = await admin.from("platform_catalog_listings").update({ raw: { ...(live.row.raw ?? {}), lazada: after.lazada }, status: after.status, updated_at: new Date().toISOString() }).eq("id", live.row.id);
    if (e2) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${e2.message}`);
    await audit({ ok: true, warnings, refreshed: false, optimistic: true });
    return reply({ ok: true, view: lazViewAfterWrite(view, { statusOverride: plan.statusOverride }), summary: plan.summary, warnings, error: null });
  }
  {
    const want = body.open ? "active" : "inactive";
    const notYet = plan.targets.filter((t) => (freshView.skus.find((s) => s.skuId === t.skuId)?.status ?? "") !== want);
    if (notYet.length) warnings.push(`Lazada ตอบรับแล้ว แต่ยังเห็น ${notYet.length} ตัวเลือกสถานะเดิม (อาจใช้เวลาสักครู่) — กดดึงตัวนี้อีกครั้งภายหลัง`);
    const others = freshView.skus.filter((s) => !plan.targets.some((t) => t.skuId === s.skuId) && view.skus.find((b) => b.skuId === s.skuId)?.status !== s.status).length;
    if (others) warnings.push(`ตัวเลือกอื่นเปลี่ยนสถานะไปด้วย ${others} ตัว — ตรวจในแท็บตัวเลือก`);
  }
  const err = await saveLazSlimCopy(admin, live.row, fresh!);
  if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);
  await audit({ ok: true, warnings, refreshed: true });
  return reply({ ok: true, view: freshView, summary: plan.summary, warnings, error: null });
}
