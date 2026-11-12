/**
 * แก้ชื่อสินค้าบน TikTok Shop — ลิ้นชักสินค้าบนร้าน · เฟส A (แก้ร้านจริง · หน้าเว็บถามก่อนเสมอ)
 *  POST { listing_id, before_title, title }   (products.platforms.publish)
 *
 *   1) ดึงสดจาก TikTok → ชื่อบนร้านต่างจาก before_title = 409 ไม่ส่งทับ (คืนข้อมูลล่าสุดให้ฟอร์มเริ่มใหม่)
 *   2) planTiktokTitle (25–255 ตัวอักษร · ไม่มี HTML) — กฎเดียวกับหน้าเว็บ
 *   3) Partial Edit 202509 ส่งแค่ title → TikTok ส่งไปตรวจใหม่ (ระหว่างตรวจ ร้านยังขายชื่อเดิม)
 *   4) ดึงกลับ (ฉบับขาย + ฉบับรอตรวจ) ตรวจว่าชื่อใหม่ไปถึง → สำเนาย่อ → ประวัติ (audit tiktok_listing_edit) ทั้งสำเร็จ/ไม่สำเร็จ
 *  → TiktokWriteResponse
 * ไม่แตะราคา/สต๊อก/รูป/รายละเอียด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsErrorText, ttsPartialEdit } from "@/lib/tiktok-shop";
import { planTiktokTitle, tiktokListingView, type TiktokWriteResponse } from "@/lib/tiktok-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadTtsListingLive, saveTtsSlimCopy, ttsGetProductRetry, ttsViewWithReview } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: TiktokWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before_title?: unknown; title?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId || typeof body.title !== "string" || typeof body.before_title !== "string") return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + before_title + title)" }, 400);

  const admin = supabaseAdmin();
  const live = await loadTtsListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return reply({ ok: false, view: null, error: live.error }, live.status);
  if (isGoneStatus(live.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย \"ไม่อยู่บนร้านแล้ว\" — กดดึงตัวนี้จาก TikTok ก่อน" }, 400);
  const view = await ttsViewWithReview(live.accessToken, live.cipher, live.detail);
  if (!view) return reply({ ok: false, view: null, error: "TikTok ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" }, 502);
  // กันส่งทับ: มีคนแก้บนร้านหลังเปิดลิ้นชัก (เทียบกับชื่อบนร้าน หรือชื่อที่รอตรวจ)
  const shown = body.before_title.trim();
  if (shown !== view.title.trim() && shown !== (view.pendingTitle ?? "").trim()) {
    return reply({ ok: false, view, error: "ชื่อบนร้าน TikTok เปลี่ยนไปแล้วหลังจากเปิดหน้านี้ — ระบบโหลดของล่าสุดให้แล้ว ตรวจแล้วแก้ใหม่อีกครั้ง" }, 409);
  }
  if (view.productStatus === "FREEZE" || view.productStatus === "DELETED") return reply({ ok: false, view, error: "สินค้าที่ถูกระงับ/ลบแล้ว แก้ไม่ได้" }, 400);

  const plan = planTiktokTitle(view.pendingTitle ?? view.title, body.title);
  if (plan.errors.length) return reply({ ok: false, view, error: plan.errors.join(" · ") }, 400);
  if (!plan.changed) return reply({ ok: true, view, summary: "ชื่อเหมือนเดิม — ไม่มีอะไรต้องส่ง", error: null });

  const changes = [{ label: "ชื่อสินค้า", before: view.pendingTitle ?? view.title, after: plan.title }];
  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: live.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "tiktok_listing_edit", product_id: live.productId, changes, ...meta },
  });

  let resp: Record<string, unknown>;
  try { resp = await ttsPartialEdit(live.accessToken, live.cipher, live.productId, { title: plan.title }); }
  catch (e) {
    const error = ttsErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message });
    return reply({ ok: false, view, error: `แก้ชื่อบน TikTok ไม่สำเร็จ: ${error}` }, 502);
  }

  // ดึงกลับตรวจ: ฉบับขาย (สำเนาย่อ) + ฉบับรอตรวจ (ชื่อใหม่ไปถึงไหม)
  const warnings: string[] = [];
  let freshDetail: Record<string, unknown> | null = null;
  try { freshDetail = await ttsGetProductRetry(live.accessToken, live.cipher, live.productId); } catch { /* ดึงกลับไม่ได้ = เตือนด้านล่าง */ }
  const freshView = freshDetail ? await ttsViewWithReview(live.accessToken, live.cipher, freshDetail) : null;
  // สถานะตรวจ: เชื่อของที่ดึงกลับก่อน — คำตอบของ Partial Edit บอก APPROVED (ของฉบับที่ขายอยู่) ทั้งที่ชื่อใหม่รอตรวจ (เจอจริง 2026-11-12)
  const respAudit = String((resp.audit as { status?: unknown } | undefined)?.status ?? "");
  const auditStatus = freshView?.auditStatus ?? respAudit;
  let summary = "แก้ชื่อแล้ว";
  if (!freshView) warnings.push("TikTok ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก TikTok” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
  else if (freshView.title === plan.title) summary = "แก้ชื่อแล้ว — ขึ้นร้านแล้ว";
  else if (freshView.pendingTitle === plan.title || auditStatus === "AUDITING") summary = "ส่งชื่อใหม่แล้ว — รอ TikTok ตรวจ (ระหว่างนี้ร้านยังใช้ชื่อเดิม)";
  else warnings.push("TikTok ตอบรับแล้ว แต่ยังไม่เห็นชื่อใหม่ (อาจใช้เวลาสักครู่) — กดดึงตัวนี้อีกครั้งภายหลัง");
  if (freshDetail) {
    const err = await saveTtsSlimCopy(admin, live.row, freshDetail);
    if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);
  }
  await audit({ ok: true, audit_status: auditStatus || null, edit_resp_audit: respAudit || null, pending: !!freshView?.pendingTitle, summary, warnings, refreshed: !!freshView });
  return reply({ ok: true, view: freshView ?? tiktokListingView(live.detail, { id: live.productId, title: plan.title }), summary, warnings, error: null });
}
