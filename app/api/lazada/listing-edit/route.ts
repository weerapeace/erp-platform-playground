/**
 * แก้ชื่อ / รายละเอียด / จุดเด่น ของสินค้าบน Lazada — ลิ้นชักสินค้าบนร้าน · เฟส 2 (แก้ร้านจริง)
 *  POST { listing_id, before: LazadaEditState, edit: LazadaEditState }   (products.platforms.publish)
 *
 *   1) ดึงสินค้าตัวนี้สดจาก Lazada → ถ้าต่างจาก "before" (ที่คนเห็นตอนเปิดลิ้นชัก) = มีคนแก้บนร้านไปแล้ว → 409 ไม่ส่งทับ
 *   2) planLazadaEdit (กฎเดียวกับหน้าเว็บ) → ตรวจไม่ผ่าน = 400 ไม่ส่งอะไร · ไม่มีอะไรเปลี่ยน = ok ไม่ส่ง
 *   3) /product/update — ส่งเฉพาะช่องที่เปลี่ยน + SKU ครบตามลำดับเดิมพร้อมสถานะเดิมทุกตัว (lazUpdateProductXml)
 *   4) ดึงใหม่ → ตรวจว่าเปลี่ยนจริง + สถานะรอตรวจ (Pending QC) → อัปเดตสำเนาย่อในระบบ
 *   5) ประวัติ (audit) ทั้งสำเร็จและไม่สำเร็จ — ก่อน → หลัง
 *  → LazadaWriteResponse
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lazErrorText, lazUpdateProduct } from "@/lib/lazada";
import { lazadaEditStateFromView, lazadaListingView, lazUpdateProductXml, lazViewAfterWrite, planLazadaEdit, type LazadaEditState, type LazadaWriteResponse } from "@/lib/lazada-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadLazListingLive, refetchLazItem, saveLazSlimCopy } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: LazadaWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const cleanState = (v: unknown): LazadaEditState | null => {
  const o = v && typeof v === "object" ? v as Record<string, unknown> : null;
  if (!o) return null;
  return { name: String(o.name ?? ""), description: String(o.description ?? ""), highlights: String(o.highlights ?? "") };
};
const norm = (s: LazadaEditState) => [s.name.replace(/\s+/g, " ").trim(), s.description, s.highlights.split("\n").map((x) => x.trim()).filter(Boolean).join("\n")].join("\u0000");

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before?: unknown; edit?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  const seen = cleanState(body.before); const after = cleanState(body.edit);
  if (!listingId || !seen || !after) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + before + edit)" }, 400);

  const admin = supabaseAdmin();
  const live = await loadLazListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return reply({ ok: false, view: null, error: live.error }, live.status);
  if (isGoneStatus(live.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย \"ไม่อยู่บนร้านแล้ว\" — กดดึงตัวนี้จาก Lazada ก่อน" }, 400);
  const liveView = lazadaListingView(live.item);
  if (!liveView) return reply({ ok: false, view: null, error: "Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" }, 502);
  const liveState = lazadaEditStateFromView(liveView);

  // 1) มีคนแก้บนร้านหลังเปิดลิ้นชัก → ไม่ส่งทับ
  if (norm(liveState) !== norm(seen)) {
    return reply({ ok: false, view: liveView, error: "ข้อมูลบนร้าน Lazada เปลี่ยนไปตั้งแต่เปิดลิ้นชัก (มีคนแก้ในร้าน?) — ระบบโหลดข้อมูลล่าสุดให้แล้ว ตรวจแล้วแก้อีกครั้ง" }, 409);
  }
  // 2) ตรวจ + เลือกเฉพาะช่องที่เปลี่ยน
  const plan = planLazadaEdit(liveState, after);
  if (plan.errors.length) return reply({ ok: false, view: liveView, error: plan.errors.join(" · ") }, 400);
  if (plan.changes.length === 0) return reply({ ok: true, view: liveView, changes: [], error: null });

  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: live.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "lazada_listing_edit", item_id: live.itemId, title: live.row.title, changes: plan.changes, ...meta },
  });

  // 3) ส่งขึ้น Lazada
  const xml = lazUpdateProductXml(live.itemId, liveView.skus.map((s) => ({ skuId: s.skuId, sellerSku: s.sellerSku, status: s.status })), plan.fields);
  let res: Record<string, unknown>;
  try { res = await lazUpdateProduct(live.gateway, live.accessToken, xml); }
  catch (e) {
    const error = lazErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message });
    return reply({ ok: false, view: liveView, error: `ส่งขึ้น Lazada ไม่สำเร็จ: ${error}` }, 502);
  }

  // 4) ดึงใหม่ → ตรวจผล + สำเนาย่อ
  const warnings = [...plan.warnings.filter((w) => !w.includes("ตรวจใหม่"))];
  const resData = res.data && typeof res.data === "object" ? res.data as Record<string, unknown> : {};
  const fresh = await refetchLazItem(live.gateway, live.accessToken, live.itemId);   // ลองซ้ำถ้า Lazada จำกัดความถี่
  const freshView = fresh ? lazadaListingView(fresh) : null;
  const qc = /pending/i.test(String(resData.item_status ?? "")) || /pending/i.test(String(freshView?.status ?? ""));
  if (qc) warnings.push("Lazada ส่งสินค้าไปรอตรวจ (Pending QC · ไม่เกิน 24 ชม.)");
  if (!freshView) {
    // ส่งสำเร็จแล้ว แต่ดึงกลับไม่ได้ → แสดงตามที่ส่ง + ชื่อในระบบตามที่ส่ง + เตือนให้ยืนยันเอง (ไม่โชว์ของเก่าให้เข้าใจผิดว่าไม่สำเร็จ)
    warnings.push("Lazada ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ (Lazada ตอบช้า) — ระบบแสดงตามที่ส่งไว้ก่อน กด “ดึงตัวนี้จาก Lazada” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
    if (plan.fields.name) await admin.from("platform_catalog_listings").update({ title: plan.fields.name, updated_at: new Date().toISOString() }).eq("id", live.row.id);
    await audit({ ok: true, qc, warnings, refreshed: false, optimistic: true });
    return reply({ ok: true, view: lazViewAfterWrite(liveView, { fields: plan.fields }), changes: plan.changes, qc, warnings, error: null });
  }
  if (plan.fields.name && freshView.name.replace(/\s+/g, " ").trim() !== plan.fields.name) warnings.push("Lazada ตอบรับแล้ว แต่ชื่อบนร้านยังเป็นชื่อเดิม (อาจรอตรวจ) — ดูอีกครั้งภายหลัง");
  const changedStatus = freshView.skus.filter((s) => liveView.skus.find((b) => b.skuId === s.skuId)?.status !== s.status).length;
  if (changedStatus) warnings.push(`สถานะตัวเลือกเปลี่ยนไป ${changedStatus} ตัวหลังแก้ — ตรวจในแท็บตัวเลือก`);
  const err = await saveLazSlimCopy(admin, live.row, fresh!);
  if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);

  // 5) ประวัติ
  await audit({ ok: true, qc, warnings, refreshed: true });
  return reply({ ok: true, view: freshView, changes: plan.changes, qc, warnings, error: null });
}
