/**
 * 🖨 ลายรีด — หลังบ้าน (แท็บออเดอร์เว็บ) : /api/website/print-designs
 *
 * GET   ?shop=<slug>&id=<design id>   → แบบ + ส่วนพิมพ์ (รูปฉาก) + ลายแต่ละชิ้น (รูปดู · ลิงก์ไฟล์ลูกค้าชั่วคราว 15 นาที · ไฟล์พิมพ์ในคลัง)
 *                                       + ช่องทางแจ้งลูกค้า (LINE/อีเมล) + งานจัดเรียงที่ส่งไปแล้ว + งานร่างให้เลือก
 * PATCH { shop, id, action, note, notify } → ตรวจลาย: approve อนุมัติ · reupload ขอรูปใหม่ · reject ปฏิเสธ · pending กลับเป็นรอตรวจ (+ audit)
 *                                       ขอรูปใหม่/ปฏิเสธ + notify (ค่าเริ่ม true) = แจ้งลูกค้าทาง LINE/อีเมล (lib/website-print-notify)
 * POST  { shop, id, action:"nest", jobId } → ตัดไฟล์พิมพ์ตามทรง → คลังไฟล์พิมพ์ → งานจัดเรียง (ใหม่ / งานร่างที่เลือก) — ต้องมีสิทธิ์ nesting.run ด้วย
 *
 * สิทธิ์: กลุ่ม "ออเดอร์และลูกค้า" (lib/website-access) · รูปลูกค้าอยู่ bucket ส่วนตัว ดูได้ผ่านลิงก์ชั่วคราวเท่านั้น
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardWebsite } from "@/lib/website-api-guard";
import { apiCan } from "@/lib/api-auth";
import { shopBySlug } from "@/lib/website-shop";
import { writeAuditFor } from "@/lib/audit";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { printNeedsReview, printQuality, printTierOf } from "@/lib/website-print-design";
import { PRINT_DESIGN_SELECT, PRINT_REVIEW_LABEL, signedPrintUrls, type PrintDesignRow } from "@/lib/website-print-design-server";
import { notifyPrintReview, printNotifyChannels, printNotifyNote } from "@/lib/website-print-notify";
import { draftNestingJobs, nestingJobsOfDesign, sendPrintDesignToNesting } from "@/lib/website-print-nest";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// ตัดไฟล์พิมพ์หลายลายด้วย sharp
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = { approve: "approved", reupload: "reupload", reject: "rejected", pending: "pending" } as const;

async function actorOf(request: NextRequest, sb: ReturnType<typeof supabaseAdmin>): Promise<{ id: string | null; name: string | null }> {
  try {
    const user = (await supabaseFromRequest(request).auth.getUser()).data.user;
    if (!user) return { id: null, name: null };
    const { data: prof } = await sb.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle();
    return { id: user.id, name: (prof?.display_name as string | null) || user.email || null };
  } catch {
    return { id: null, name: null };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "รหัสแบบไม่ถูกต้อง" }, { status: 400 });
  const sb = supabaseAdmin();
  const shop = await shopBySlug<{ id: string; slug: string }>(sb, url.searchParams.get("shop") ?? "", "id, slug");
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const { data } = await sb.from("store_print_designs").select(PRINT_DESIGN_SELECT).eq("shop_id", shop.id).eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "ไม่พบแบบลายนี้" }, { status: 404 });
  const d = data as PrintDesignRow;
  const placements = Array.isArray(d.placements) ? d.placements : [];
  const img = (key: string, w = 1200) => `${url.origin}/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

  const assetIds = [...new Set(placements.map((p) => p.assetId).filter((x): x is string => !!x))];
  const canNest = await apiCan(request, "nesting.run");
  const [{ data: assets }, signed, { data: parent }, channels, sentJobs, drafts] = await Promise.all([
    assetIds.length ? sb.from("assets").select("id, title, r2_key, nest_print_file").in("id", assetIds) : Promise.resolve({ data: [] }),
    d.uploads_purged_at ? Promise.resolve(new Map<string, string>()) : signedPrintUrls(sb, placements.map((p) => p.upload?.path ?? "")),
    // ปก/รูปแรกของรุ่น — ส่วนพิมพ์ที่ไม่ได้เลือกรูป
    sb.from("parent_skus_v2").select("cover_image_r2_key").eq("id", d.parent_sku_id).maybeSingle(),
    d.status === "ordered" ? printNotifyChannels(sb, shop.id, shop.slug, d.order_ref) : Promise.resolve({ email: false, line: false }),
    nestingJobsOfDesign(sb, d.id),
    canNest && d.status === "ordered" ? draftNestingJobs(sb) : Promise.resolve([]),
  ]);
  const assetById = new Map(((assets ?? []) as { id: string; title: string | null; r2_key: string | null; nest_print_file: { name?: string } | null }[]).map((a) => [a.id, a]));
  const fallback = (parent?.cover_image_r2_key as string | null) ?? null;

  return NextResponse.json({
    design: {
      id: d.id,
      code: d.code,
      method: d.method,
      extra: Number(d.extra_price) || 0,
      hasUpload: printNeedsReview(placements),
      status: d.status,
      reviewStatus: d.review_status,
      reviewLabel: d.review_status ? PRINT_REVIEW_LABEL[d.review_status] : null,
      reviewNote: d.review_note,
      reviewedAt: d.reviewed_at,
      orderRef: d.order_ref,
      uploadsPurged: !!d.uploads_purged_at,
      createdAt: d.created_at,
    },
    notify: channels,
    nesting: { canSend: canNest, sent: sentJobs, drafts },
    zones: (Array.isArray(d.zones) ? d.zones : []).map((z) => ({ ...z, imageUrl: z.imageKey ? img(z.imageKey) : fallback ? img(fallback) : null })),
    placements: placements.map((p) => {
      const a = p.assetId ? assetById.get(p.assetId) : undefined;
      const upUrl = p.upload ? signed.get(p.upload.path) ?? null : null;
      return {
        ...p,
        tier: printTierOf(p.w, p.h),
        previewUrl: p.kind === "lib" ? (a?.r2_key ? img(a.r2_key, 800) : null) : upUrl,
        fileUrl: upUrl,
        printFile: p.kind === "lib" ? { assetTitle: a?.title ?? p.name, hasPrintPng: !!a?.nest_print_file } : null,
        quality: p.kind === "upload" && p.upload ? printQuality(p.upload.w, p.w) : null,
      };
    }),
  });
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const id = String(body.id ?? "");
  const action = String(body.action ?? "") as keyof typeof ACTIONS;
  if (!UUID.test(id) || !(action in ACTIONS)) return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  const note = String(body.note ?? "").trim().slice(0, 300) || null;
  if ((action === "reupload" || action === "reject") && !note) return NextResponse.json({ error: "ใส่เหตุผลให้ลูกค้าด้วย" }, { status: 400 });

  const sb = supabaseAdmin();
  const shop = await shopBySlug<{ id: string; slug: string }>(sb, String(body.shop ?? ""), "id, slug");
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const { data: cur } = await sb.from("store_print_designs").select("id, code, review_status, order_ref, status").eq("shop_id", shop.id).eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบแบบลายนี้" }, { status: 404 });
  if (cur.status !== "ordered") return NextResponse.json({ error: "แบบนี้ยังไม่ได้สั่งซื้อ" }, { status: 409 });

  const now = new Date().toISOString();
  const next = ACTIONS[action];
  const actor = await actorOf(request, sb);
  const { error } = await sb
    .from("store_print_designs")
    .update({ review_status: next, review_note: action === "approve" || action === "pending" ? null : note, reviewed_at: now, reviewed_by: actor.id, updated_at: now })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  await writeAuditFor(request, sb, {
    action: `print_${action}`,
    entityType: "store_print_designs",
    entityId: id,
    metadata: { shop: shop.slug, order_no: cur.order_ref, from: cur.review_status, to: next, note },
  });
  // 📣 แจ้งลูกค้า (ขอรูปใหม่/ปฏิเสธ) — ส่งไม่ถึงไม่ล้มผลตรวจ · ข้อความกลับไปให้คัดลอกส่งเองได้
  let notified: { note: string; text: string; sent: boolean } | null = null;
  if ((action === "reupload" || action === "reject") && body.notify !== false && note) {
    try {
      const r = await notifyPrintReview(sb, shop, { id, code: cur.code as string, order_ref: cur.order_ref as string | null }, action === "reject" ? "rejected" : "reupload", note, actor);
      notified = { note: printNotifyNote(r), text: r?.text ?? "", sent: !!r && (r.line || r.email === "sent") };
    } catch {
      notified = { note: "แจ้งลูกค้าไม่สำเร็จ — คัดลอกข้อความไปส่งเอง", text: "", sent: false };
    }
  }
  return NextResponse.json({ ok: true, reviewStatus: next, reviewLabel: PRINT_REVIEW_LABEL[next], notified });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  if (!(await apiCan(request, "nesting.run"))) return NextResponse.json({ error: "ต้องมีสิทธิ์ใช้งาน 'จัดเรียงงานพิมพ์' ก่อน" }, { status: 403 });
  const body = await readBody(request);
  if (!body || body.action !== "nest") return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  const id = String(body.id ?? "");
  const jobId = body.jobId ? String(body.jobId) : null;
  if (!UUID.test(id) || (jobId && !UUID.test(jobId))) return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  const sb = supabaseAdmin();
  const shop = await shopBySlug<{ id: string; slug: string }>(sb, String(body.shop ?? ""), "id, slug");
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const actor = await actorOf(request, sb);
  const r = await sendPrintDesignToNesting(sb, shop.id, id, jobId, actor);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await writeAuditFor(request, sb, {
    action: "print_send_nesting",
    entityType: "store_print_designs",
    entityId: id,
    metadata: { shop: shop.slug, job_id: r.job.id, job: r.job.name, created: r.job.created, files: r.files },
  });
  return NextResponse.json({ ok: true, job: r.job, files: r.files });
}
