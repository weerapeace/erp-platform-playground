/**
 * เปิด / ปิดขาย สินค้าบน TikTok Shop (ทั้งสินค้า) — ลิ้นชักสินค้าบนร้าน · เฟส A (แก้ร้านจริง · หน้าเว็บถามก่อนเสมอ)
 *  POST { listing_id, open: boolean }   (products.platforms.publish)
 *
 *   ปิด → Deactivate (ซ่อนทันที → SELLER_DEACTIVATED)
 *   เปิด → Activate (TikTok ส่งตรวจก่อน → PENDING → ผ่านแล้วกลับเป็น ACTIVATE)
 *   ก่อนทำ: ดึงสด → planTiktokDisplay (อยู่สถานะนั้นแล้ว = ไม่ส่ง · สถานะที่ทำไม่ได้ = บอกเหตุผล)
 *   หลังทำ: เช็ก data.errors[] (TikTok ตอบ code 0 แต่ทำไม่สำเร็จรายตัวได้) → ดึงกลับตรวจ → สำเนาย่อ → ประวัติ (audit tiktok_listing_display)
 *  → TiktokWriteResponse
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsErrorText, ttsSetProductsActive } from "@/lib/tiktok-shop";
import { planTiktokDisplay, tiktokDisplayErrors, tiktokListingView, tiktokStatusBadge, type TiktokWriteResponse } from "@/lib/tiktok-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadTtsListingLive, saveTtsSlimCopy, ttsGetProductRetry } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: TiktokWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; open?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId || typeof body.open !== "boolean") return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + open)" }, 400);
  const open = body.open;

  const admin = supabaseAdmin();
  const live = await loadTtsListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return reply({ ok: false, view: null, error: live.error }, live.status);
  if (isGoneStatus(live.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย \"ไม่อยู่บนร้านแล้ว\" — กดดึงตัวนี้จาก TikTok ก่อน" }, 400);
  const view = tiktokListingView(live.detail);
  if (!view) return reply({ ok: false, view: null, error: "TikTok ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" }, 502);

  const plan = planTiktokDisplay(view, open);
  if (plan.errors.length) return reply({ ok: false, view, error: plan.errors.join(" · ") }, 400);
  if (plan.api === "none") return reply({ ok: true, view, summary: plan.summary, error: null });

  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: live.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "tiktok_listing_display", product_id: live.productId, title: view.title, open, summary: plan.summary, status_before: view.status, product_status_before: view.productStatus, ...meta },
  });

  try {
    const data = await ttsSetProductsActive(live.accessToken, live.cipher, [live.productId], open);
    const errs = tiktokDisplayErrors(data, live.productId);
    if (errs.length) {
      await audit({ ok: false, error: errs.join(" · ") });
      return reply({ ok: false, view, error: `${open ? "เปิด" : "ปิด"}ขายบน TikTok ไม่สำเร็จ: ${errs.join(" · ")}` }, 502);
    }
  } catch (e) {
    const error = ttsErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message });
    return reply({ ok: false, view, error: `${open ? "เปิด" : "ปิด"}ขายบน TikTok ไม่สำเร็จ: ${error}` }, 502);
  }

  // คำเตือนของแผน (เปิดขาย = ต้องรอตรวจ) โชว์ในหน้าต่างยืนยันแล้ว — ที่นี่เฉพาะผลหลังส่ง
  const warnings: string[] = [];
  let fresh: Record<string, unknown> | null = null;
  try { fresh = await ttsGetProductRetry(live.accessToken, live.cipher, live.productId); } catch { /* เตือนด้านล่าง */ }
  const freshView = fresh ? tiktokListingView(fresh) : null;
  let summary = plan.summary;
  if (!freshView) warnings.push("TikTok ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก TikTok” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
  else if (open && freshView.status === "PENDING") summary = "ส่งเปิดขายแล้ว — รอ TikTok ตรวจ";
  else if (open && freshView.productStatus === "ACTIVATE") summary = "เปิดขายแล้ว";
  else if ((freshView.productStatus === "ACTIVATE") !== open) warnings.push(`TikTok ตอบรับแล้ว แต่ยังเห็นสถานะ “${tiktokStatusBadge(freshView.status).label}” (อาจใช้เวลาสักครู่) — กดดึงตัวนี้อีกครั้งภายหลัง`);
  if (fresh) {
    const err = await saveTtsSlimCopy(admin, live.row, fresh);
    if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);
  }
  await audit({ ok: true, summary, status_after: freshView?.status ?? null, warnings, refreshed: !!freshView });
  return reply({ ok: true, view: freshView ?? view, summary, warnings, error: null });
}
