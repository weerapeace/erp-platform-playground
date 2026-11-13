/**
 * แก้สินค้าบน TikTok Shop — ลิ้นชักสินค้าบนร้าน (แก้ร้านจริง · หน้าเว็บถามก่อนเสมอ)
 *  POST { listing_id, before_title?, title?, before_description?, description?, media?: { before_uris, before_pkg, images, pkg } }   (products.platforms.publish)
 *   เฟส A: ชื่อสินค้า · รายละเอียด (HTML · รูปต้องฝากกับ TikTok แล้ว — /api/tiktok-shop/upload-image) · เฟส C: รูปสินค้า (images = "tts:<uri>" รูปเดิม / "r2:<key>" รูปใหม่จากคลังรูปในระบบ) + กล่องพัสดุ (กก./ซม.)
 *
 *   1) ดึงสดจาก TikTok (ฉบับขาย + ฉบับรอตรวจ) → ชื่อ/รูป/กล่องบนร้านต่างจากที่หน้าเว็บเห็น = 409 ไม่ส่งทับ (คืนข้อมูลล่าสุดให้ฟอร์มเริ่มใหม่)
 *   2) planTiktokTitle / planTiktokMedia — กฎเดียวกับหน้าเว็บ
 *   3) รูปใหม่ → JPG จัตุรัสพื้นขาว 1500px (/api/r2-image &sq=1) → Upload Product Image (MAIN_IMAGE) ได้ uri — ฝากไม่ผ่าน = หยุด ไม่แก้สินค้า
 *   4) Partial Edit 202509 ส่งเฉพาะช่องที่เปลี่ยน (ครั้งเดียว) → TikTok ส่งไปตรวจใหม่ (ระหว่างตรวจ ร้านยังใช้ของเดิม)
 *   5) ดึงกลับตรวจว่าไปถึง → สำเนาย่อ → ประวัติ (audit tiktok_listing_edit) ทั้งสำเร็จ/ไม่สำเร็จ
 *  → TiktokWriteResponse
 * ไม่แตะราคา (listing-prices) / สต๊อก / รูปตัวเลือก (ต้องส่งตัวเลือกทั้งชุดพร้อมสต๊อก — ไม่ทำตราบใดที่ BigSeller ซิงค์สต๊อก)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsErrorText, ttsPartialEdit } from "@/lib/tiktok-shop";
import {
  planTiktokDescription, planTiktokMedia, planTiktokTitle, samePkg, tiktokListingView, tiktokMediaBase, tiktokPkgFields, tiktokR2KeyOfRef, tiktokUriOfRef,
  type TiktokPkg, type TiktokWriteResponse,
} from "@/lib/tiktok-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadTtsListingLive, saveTtsSlimCopy, ttsCategoryMeta, ttsGetProductRetry, ttsUploadRef, ttsViewWithReview } from "../shared";
import { planTiktokAttrs, planTiktokCod, planTiktokSizeChart, sameAttrState, type TtsAttrState, type TtsAttrVal } from "@/lib/tiktok-attrs";

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
/** ค่าคุณลักษณะจาก body (กันค่าแปลก) */
const attrStateOf = (v: unknown): TtsAttrState | null => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: TtsAttrState = {};
  for (const [k, vals] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(vals)) continue;
    const list = vals.map((x): TtsAttrVal => { const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>; const id = String(o.id ?? "").trim(); const name = String(o.name ?? "").trim(); return { ...(id ? { id } : {}), ...(name ? { name } : {}) }; }).filter((x) => x.id || x.name);
    if (list.length) out[String(k)] = list;
  }
  return out;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; before_title?: unknown; title?: unknown; before_description?: unknown; description?: unknown; media?: unknown; extra?: unknown };
  try { body = await request.json(); } catch { return reply({ ok: false, view: null, error: "invalid JSON" }, 400); }
  const listingId = String(body.listing_id ?? "").trim();
  const wantTitle = typeof body.title === "string" && typeof body.before_title === "string";
  const wantDesc = typeof body.description === "string" && typeof body.before_description === "string";
  const m = body.media && typeof body.media === "object" ? body.media as Record<string, unknown> : null;
  const media = m ? { beforeUris: strList(m.before_uris), beforePkg: pkgOf(m.before_pkg), images: strList(m.images), pkg: pkgOf(m.pkg) } : null;
  if (media && (!media.beforeUris || !media.beforePkg || !media.images || !media.pkg)) return reply({ ok: false, view: null, error: "ข้อมูลรูป/กล่องไม่ครบ" }, 400);
  // คุณลักษณะ / COD / ตารางขนาด (ส่งมาเฉพาะที่แก้ — before_* ใช้กันส่งทับ)
  const x = body.extra && typeof body.extra === "object" ? body.extra as Record<string, unknown> : null;
  const ex = {
    attrs: x && "attrs" in x ? { before: attrStateOf(x.before_attrs) ?? {}, next: attrStateOf(x.attrs) ?? {} } : null,
    cod: x && typeof x.cod === "boolean" ? { before: typeof x.before_cod === "boolean" ? x.before_cod : null, next: x.cod } : null,
    size: x && "size_chart" in x ? { before: typeof x.before_size_chart === "string" && x.before_size_chart ? x.before_size_chart : null, next: typeof x.size_chart === "string" && x.size_chart ? x.size_chart : null } : null,
  };
  const wantExtra = !!(ex.attrs || ex.cod || ex.size);
  if (!listingId || (!wantTitle && !wantDesc && !media && !wantExtra)) return reply({ ok: false, view: null, error: "ข้อมูลไม่ครบ (listing_id + ชื่อ / รายละเอียด / รูป/กล่อง / คุณลักษณะ)" }, 400);

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
  const baseDesc = view.pendingDescription ?? view.description;
  if (wantDesc && String(body.before_description).trim() !== baseDesc.trim()) return reply({ ok: false, view, error: `รายละเอียด${conflict}` }, 409);
  const base = tiktokMediaBase(view);
  if (media) {
    if (media.beforeUris!.join("\n") !== base.images.map((x) => x.uri).join("\n")) return reply({ ok: false, view, error: `รูป${conflict}` }, 409);
    if (!samePkg(media.beforePkg!, base.pkg)) return reply({ ok: false, view, error: `กล่องพัสดุ${conflict}` }, 409);
  }

  if (ex.attrs && !sameAttrState(ex.attrs.before, view.attrs)) return reply({ ok: false, view, error: `คุณลักษณะ${conflict}` }, 409);
  if (ex.cod && ex.cod.before !== view.cod) return reply({ ok: false, view, error: `การเก็บเงินปลายทาง${conflict}` }, 409);
  if (ex.size && ex.size.before !== (view.sizeChart?.uri ?? null)) return reply({ ok: false, view, error: `ตารางขนาด${conflict}` }, 409);
  // ช่อง/กติกาของหมวด (แคช 10 นาที) — ใช้ตรวจค่าก่อนส่ง
  const meta = wantExtra && view.categoryId ? await ttsCategoryMeta(live.accessToken, live.cipher, view.categoryId) : null;
  if (ex.attrs && !meta?.fields) return reply({ ok: false, view, error: meta?.error ?? "ไม่รู้หมวดของสินค้านี้ — ดึงตัวนี้จาก TikTok แล้วลองใหม่" }, 502);
  const attrPlan = ex.attrs && meta?.fields ? planTiktokAttrs(meta.fields, view.attrs, ex.attrs.next, { strictRequired: true, names: view.attrNames }) : null;
  const codPlan = ex.cod ? planTiktokCod(view.cod, ex.cod.next, meta?.rules?.codSupported ?? null) : null;
  const sizePlan = ex.size ? planTiktokSizeChart(view.sizeChart?.uri ?? null, ex.size.next, meta?.rules ?? null) : null;
  const titlePlan = wantTitle ? planTiktokTitle(view.pendingTitle ?? view.title, String(body.title)) : null;
  const mediaPlan = media ? planTiktokMedia(base.images.map((x) => x.uri), base.pkg, media.images!, media.pkg!) : null;
  const descPlan = wantDesc ? planTiktokDescription(baseDesc, String(body.description)) : null;
  const descChanged = !!descPlan?.changed;
  const errors = [...(titlePlan?.errors ?? []), ...(descChanged ? descPlan!.errors : []), ...(mediaPlan?.errors ?? []), ...(attrPlan?.errors ?? []), ...(codPlan?.errors ?? []), ...(sizePlan?.errors ?? [])];
  if (errors.length) return reply({ ok: false, view, error: errors.join(" · ") }, 400);
  const titleChanged = !!titlePlan?.changed;
  const mediaChanged = !!mediaPlan && (mediaPlan.imagesChanged || mediaPlan.weightChanged || mediaPlan.boxChanged);
  const attrChanged = !!attrPlan?.changed; const codChanged = !!codPlan?.changed; const sizeChanged = !!sizePlan?.changed && !!ex.size?.next;
  if (!titleChanged && !descChanged && !mediaChanged && !attrChanged && !codChanged && !sizeChanged) return reply({ ok: true, view, summary: "เหมือนเดิม — ไม่มีอะไรต้องส่ง", error: null });

  const changes = [
    ...(titleChanged ? [{ label: "ชื่อสินค้า", before: view.pendingTitle ?? view.title, after: titlePlan!.title }] : []),
    ...(descChanged && descPlan!.change ? [descPlan!.change] : []),
    ...(mediaPlan?.changes ?? []),
    ...(attrChanged ? attrPlan!.changes : []),
    ...(codChanged && codPlan!.change ? [codPlan!.change] : []),
    ...(sizeChanged && sizePlan!.change ? [sizePlan!.change] : []),
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
      try {
        uploaded.set(ref, await ttsUploadRef(live.accessToken, ref));
      } catch (e) {
        const error = `ฝากรูปกับ TikTok ไม่สำเร็จ (${uploaded.size + 1}/${toUpload.length}): ${(e as Error).message} — ยังไม่ได้แก้สินค้า`;
        await audit({ ok: false, error, raw_error: (e as Error).message, uploaded: uploaded.size });
        return reply({ ok: false, view, error }, 502);
      }
    }
  }

  // รูปตารางขนาดใหม่จากระบบ → ฝากแบบ SIZE_CHART_IMAGE
  let sizeUri: string | null = null;
  if (sizeChanged) {
    const ref = ex.size!.next!;
    if (ref.startsWith("tts:")) sizeUri = ref.slice(4);
    else {
      try { sizeUri = await ttsUploadRef(live.accessToken, ref, "SIZE_CHART_IMAGE"); }
      catch (e) {
        const error = `ฝากรูปตารางขนาดกับ TikTok ไม่สำเร็จ: ${(e as Error).message} — ยังไม่ได้แก้สินค้า`;
        await audit({ ok: false, error, raw_error: (e as Error).message });
        return reply({ ok: false, view, error }, 502);
      }
    }
  }

  const fields: Parameters<typeof ttsPartialEdit>[3] = {
    ...(titleChanged ? { title: titlePlan!.title } : {}),
    ...(descChanged ? { description: descPlan!.html } : {}),
    ...(mediaPlan?.imagesChanged ? { main_images: mediaPlan.images.map((r) => ({ uri: tiktokUriOfRef(r) ?? uploaded.get(r)! })) } : {}),
    ...(mediaPlan ? tiktokPkgFields(mediaPlan) : {}),
    ...(attrChanged ? { product_attributes: attrPlan!.payload } : {}),
    ...(codChanged ? { is_cod_allowed: ex.cod!.next } : {}),
    ...(sizeChanged && sizeUri ? { size_chart: { image: { uri: sizeUri } } } : {}),
  };
  const sentUris = fields.main_images?.map((x) => x.uri) ?? null;

  let resp: Record<string, unknown>;
  // ฉบับร่าง = บันทึกเป็นร่างต่อ (ไม่ส่งตรวจ/ไม่เผยแพร่) — เผยแพร่ทำแยก (ใน Seller Center)
  const isDraft = (view.status ?? view.productStatus) === "DRAFT";
  try { resp = await ttsPartialEdit(live.accessToken, live.cipher, live.productId, fields, isDraft ? { saveMode: "AS_DRAFT" } : {}); }
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
  const what = [titleChanged ? "ชื่อ" : "", descChanged ? "รายละเอียด" : "", attrChanged ? "คุณลักษณะ" : "", codChanged ? "COD" : "", sizeChanged ? "ตารางขนาด" : "", mediaPlan?.imagesChanged ? "รูป" : "", mediaPlan?.weightChanged || mediaPlan?.boxChanged ? "กล่อง" : ""].filter(Boolean).join("/");
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
  // ฉบับร่าง: บันทึกเป็นร่างต่อ (ไม่ส่งตรวจ) — ถ้าดึงกลับแล้วไม่ใช่ร่าง = เตือนชัด ๆ
  if (isDraft) {
    pending = false;
    const nowStatus = freshView ? (freshView.status ?? freshView.productStatus) : "DRAFT";
    summary = nowStatus === "DRAFT" ? `บันทึก${what}ลงฉบับร่างแล้ว — ยังไม่ส่งตรวจ (เผยแพร่ใน Seller Center)` : `แก้${what}แล้ว`;
    if (nowStatus !== "DRAFT") warnings.push(`สินค้านี้ไม่ได้เป็นฉบับร่างแล้ว (สถานะ ${nowStatus}) — ตรวจใน Seller Center`);
  }
  if (freshDetail) {
    const err = await saveTtsSlimCopy(admin, live.row, freshDetail);
    if (err) warnings.push(`บันทึกสำเนาในระบบไม่สำเร็จ: ${err}`);
  }
  await audit({ ok: true, audit_status: auditStatus || null, edit_resp_audit: respAudit || null, pending, summary, warnings, refreshed: !!freshView, uploaded: uploaded.size });
  return reply({ ok: true, view: freshView ?? tiktokListingView(live.detail, titleChanged ? { id: live.productId, title: titlePlan!.title } : undefined), summary, warnings, error: null });
}
