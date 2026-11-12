/**
 * แก้สินค้าบน TikTok Shop — ลิ้นชักสินค้าบนร้าน (แก้ร้านจริง · หน้าเว็บถามก่อนเสมอ)
 *  POST { listing_id, before_title?, title?, media?: { before_uris, before_pkg, images, pkg } }   (products.platforms.publish)
 *   เฟส A: ชื่อสินค้า · เฟส C: รูปสินค้า (images = "tts:<uri>" รูปเดิม / "r2:<key>" รูปใหม่จากคลังรูปในระบบ) + กล่องพัสดุ (กก./ซม.)
 *
 *   1) ดึงสดจาก TikTok (ฉบับขาย + ฉบับรอตรวจ) → ชื่อ/รูป/กล่องบนร้านต่างจากที่หน้าเว็บเห็น = 409 ไม่ส่งทับ (คืนข้อมูลล่าสุดให้ฟอร์มเริ่มใหม่)
 *   2) planTiktokTitle / planTiktokMedia — กฎเดียวกับหน้าเว็บ
 *   3) รูปใหม่ → JPG จัตุรัสพื้นขาว 1500px (/api/r2-image &sq=1) → Upload Product Image (MAIN_IMAGE) ได้ uri — ฝากไม่ผ่าน = หยุด ไม่แก้สินค้า
 *   4) Partial Edit 202509 ส่งเฉพาะช่องที่เปลี่ยน (ครั้งเดียว) → TikTok ส่งไปตรวจใหม่ (ระหว่างตรวจ ร้านยังใช้ของเดิม)
 *   5) ดึงกลับตรวจว่าไปถึง → สำเนาย่อ → ประวัติ (audit tiktok_listing_edit) ทั้งสำเร็จ/ไม่สำเร็จ
 *  → TiktokWriteResponse
 * ไม่แตะราคา (listing-prices) / สต๊อก / รายละเอียด / รูปตัวเลือก
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsErrorText, ttsPartialEdit, ttsUploadImage } from "@/lib/tiktok-shop";
import { publicImageUrl } from "@/lib/line-shopping-server";
import {
  planTiktokMedia, planTiktokTitle, samePkg, tiktokListingView, tiktokMediaBase, tiktokPkgFields, tiktokR2KeyOfRef, tiktokUriOfRef,
  type TiktokPkg, type TiktokWriteResponse,
} from "@/lib/tiktok-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadTtsListingLive, saveTtsSlimCopy, ttsGetProductRetry, ttsViewWithReview } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const reply = (body: TiktokWriteResponse, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const numOrNull = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const pkgOf = (v: unknown): TiktokPkg | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return { weight: numOrNull(o.weight), length: numOrNull(o.length), width: numOrNull(o.width), height: numOrNull(o.height) };
};
const strList = (v: unknown): string[] | null => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : null);
/** รูปในระบบ → JPG จัตุรัสพื้นขาว 1500px (TikTok ปก: แนะนำพื้นขาว · 300–4000 px) */
const uploadSource = (key: string) => `${publicImageUrl(key)}&w=1500&sq=1`;
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before_title?: unknown; title?: unknown; media?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  const wantTitle = typeof body.title === "string" && typeof body.before_title === "string";
  const m = body.media && typeof body.media === "object" ? body.media as Record<string, unknown> : null;
  const media = m ? { beforeUris: strList(m.before_uris), beforePkg: pkgOf(m.before_pkg), images: strList(m.images), pkg: pkgOf(m.pkg) } : null;
  if (media && (!media.beforeUris || !media.beforePkg || !media.images || !media.pkg)) return reply({ ok: false, view: null, error: "ข้อมูลรูป/กล่องไม่ครบ" }, 400);
  if (!listingId || (!wantTitle && !media)) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + ชื่อ หรือ รูป/กล่อง)" }, 400);

  const admin = supabaseAdmin();
  const live = await loadTtsListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return reply({ ok: false, view: null, error: live.error }, live.status);
  if (isGoneStatus(live.row.status)) return reply({ ok: false, view: null, error: "สินค้านี้ติดป้าย \"ไม่อยู่บนร้านแล้ว\" — กดดึงตัวนี้จาก TikTok ก่อน" }, 400);
  const view = await ttsViewWithReview(live.accessToken, live.cipher, live.detail);
  if (!view) return reply({ ok: false, view: null, error: "TikTok ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง" }, 502);
  if (view.productStatus === "FREEZE" || view.productStatus === "DELETED") return reply({ ok: false, view, error: "สินค้าที่ถูกระงับ/ลบแล้ว แก้ไม่ได้" }, 400);

  // กันส่งทับ: มีคนแก้บนร้านหลังเปิดลิ้นชัก (เทียบกับฉบับขาย หรือฉบับที่รอตรวจ)
  const conflict = "บนร้าน TikTok เปลี่ยนไปแล้วหลังจากเปิดหน้านี้ — ระบบโหลดของล่าสุดให้แล้ว ตรวจแล้วแก้ใหม่อีกครั้ง";
  if (wantTitle) {
    const shown = String(body.before_title).trim();
    if (shown !== view.title.trim() && shown !== (view.pendingTitle ?? "").trim()) return reply({ ok: false, view, error: `ชื่อ${conflict}` }, 409);
  }
  const base = tiktokMediaBase(view);
  if (media) {
    if (media.beforeUris!.join("\n") !== base.images.map((x) => x.uri).join("\n")) return reply({ ok: false, view, error: `รูป${conflict}` }, 409);
    if (!samePkg(media.beforePkg!, base.pkg)) return reply({ ok: false, view, error: `กล่องพัสดุ${conflict}` }, 409);
  }

  const titlePlan = wantTitle ? planTiktokTitle(view.pendingTitle ?? view.title, String(body.title)) : null;
  const mediaPlan = media ? planTiktokMedia(base.images.map((x) => x.uri), base.pkg, media.images!, media.pkg!) : null;
  const errors = [...(titlePlan?.errors ?? []), ...(mediaPlan?.errors ?? [])];
  if (errors.length) return reply({ ok: false, view, error: errors.join(" · ") }, 400);
  const titleChanged = !!titlePlan?.changed;
  const mediaChanged = !!mediaPlan && (mediaPlan.imagesChanged || mediaPlan.weightChanged || mediaPlan.boxChanged);
  if (!titleChanged && !mediaChanged) return reply({ ok: true, view, summary: "เหมือนเดิม — ไม่มีอะไรต้องส่ง", error: null });

  const changes = [
    ...(titleChanged ? [{ label: "ชื่อสินค้า", before: view.pendingTitle ?? view.title, after: titlePlan!.title }] : []),
    ...(mediaPlan?.changes ?? []),
  ];
  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: live.row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "tiktok_listing_edit", product_id: live.productId, changes, ...meta },
  });

  // รูปใหม่จากระบบ → ฝากกับ TikTok ก่อน (ไม่ผ่าน = หยุด ไม่แก้สินค้า)
  const uploaded = new Map<string, string>();
  if (mediaPlan?.imagesChanged) {
    const toUpload = mediaPlan.images.filter((r) => tiktokR2KeyOfRef(r));
    for (const ref of toUpload) {
      const key = tiktokR2KeyOfRef(ref)!;
      try {
        const res = await fetch(uploadSource(key), { cache: "no-store" });
        const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim();
        if (!res.ok || !ct.startsWith("image/")) throw new Error(`โหลดรูปจากระบบไม่ได้ (HTTP ${res.status})`);
        const bytes = await res.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error(`ขนาดรูป ${(bytes.byteLength / 1048576).toFixed(1)}MB ไม่อยู่ในช่วงที่ TikTok รับ (≤ 10MB)`);
        const name = `${key.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") || "image"}.${ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg"}`;
        const r = await ttsUploadImage(live.accessToken, bytes, name, ct);
        uploaded.set(ref, r.uri);
      } catch (e) {
        const error = `ฝากรูปกับ TikTok ไม่สำเร็จ (${uploaded.size + 1}/${toUpload.length}): ${ttsErrorText(e)} — ยังไม่ได้แก้สินค้า`;
        await audit({ ok: false, error, raw_error: (e as Error).message, uploaded: uploaded.size });
        return reply({ ok: false, view, error }, 502);
      }
    }
  }

  const fields: Parameters<typeof ttsPartialEdit>[3] = {
    ...(titleChanged ? { title: titlePlan!.title } : {}),
    ...(mediaPlan?.imagesChanged ? { main_images: mediaPlan.images.map((r) => ({ uri: tiktokUriOfRef(r) ?? uploaded.get(r)! })) } : {}),
    ...(mediaPlan ? tiktokPkgFields(mediaPlan) : {}),
  };
  const sentUris = fields.main_images?.map((x) => x.uri) ?? null;

  let resp: Record<string, unknown>;
  try { resp = await ttsPartialEdit(live.accessToken, live.cipher, live.productId, fields); }
  catch (e) {
    const error = ttsErrorText(e);
    await audit({ ok: false, error, raw_error: (e as Error).message, uploaded: uploaded.size });
    return reply({ ok: false, view, error: `แก้สินค้าบน TikTok ไม่สำเร็จ: ${error}` }, 502);
  }

  // ดึงกลับตรวจ: ฉบับขาย (สำเนาย่อ) + ฉบับรอตรวจ (ของใหม่ไปถึงไหม)
  const warnings: string[] = [];
  let freshDetail: Record<string, unknown> | null = null;
  try { freshDetail = await ttsGetProductRetry(live.accessToken, live.cipher, live.productId); } catch { /* ดึงกลับไม่ได้ = เตือนด้านล่าง */ }
  const freshView = freshDetail ? await ttsViewWithReview(live.accessToken, live.cipher, freshDetail) : null;
  // สถานะตรวจ: เชื่อของที่ดึงกลับก่อน — คำตอบของ Partial Edit บอก APPROVED (ของฉบับที่ขายอยู่) ทั้งที่ของใหม่รอตรวจ (เจอจริง 2026-11-12)
  const respAudit = String((resp.audit as { status?: unknown } | undefined)?.status ?? "");
  const auditStatus = freshView?.auditStatus ?? respAudit;
  const what = [titleChanged ? "ชื่อ" : "", mediaPlan?.imagesChanged ? "รูป" : "", mediaPlan?.weightChanged || mediaPlan?.boxChanged ? "กล่อง" : ""].filter(Boolean).join("/");
  let summary = `แก้${what}แล้ว`;
  let pending = false;
  if (!freshView) warnings.push("TikTok ตอบรับแล้ว แต่ดึงข้อมูลกลับมาเช็กไม่ได้ — กด “ดึงตัวนี้จาก TikTok” อีกครั้งในอีกสักครู่เพื่อยืนยัน");
  else {
    const fb = tiktokMediaBase(freshView);
    const titleLive = !titleChanged || freshView.title === titlePlan!.title;
    const titleSeen = !titleChanged || titleLive || freshView.pendingTitle === titlePlan!.title;
    const imgsLive = !sentUris || freshView.imageUris.join("\n") === sentUris.join("\n");
    const imgsSeen = !sentUris || imgsLive || fb.images.map((x) => x.uri).join("\n") === sentUris.join("\n");
    pending = !(titleLive && imgsLive) || auditStatus === "AUDITING";
    if (titleLive && imgsLive && auditStatus !== "AUDITING") summary = `แก้${what}แล้ว — ขึ้นร้านแล้ว`;
    else if ((titleSeen && imgsSeen) || auditStatus === "AUDITING") summary = `ส่ง${what}ใหม่แล้ว — รอ TikTok ตรวจ (ระหว่างนี้ร้านยังใช้ของเดิม)`;
    else warnings.push("TikTok ตอบรับแล้ว แต่ยังไม่เห็นของใหม่ (อาจใช้เวลาสักครู่) — กดดึงตัวนี้อีกครั้งภายหลัง");
    if (sentUris && imgsSeen && fb.images.length !== sentUris.length) warnings.push(`ส่งรูป ${sentUris.length} รูป แต่ TikTok เห็น ${fb.images.length} รูป — ตรวจในแท็บรูป`);
  }
  if (freshDetail) {
    const err = await saveTtsSlimCopy(admin, live.row, freshDetail);
    if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);
  }
  await audit({ ok: true, audit_status: auditStatus || null, edit_resp_audit: respAudit || null, pending, summary, warnings, refreshed: !!freshView, uploaded: uploaded.size });
  return reply({ ok: true, view: freshView ?? tiktokListingView(live.detail, titleChanged ? { id: live.productId, title: titlePlan!.title } : undefined), summary, warnings, error: null });
}
