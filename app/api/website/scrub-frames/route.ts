/**
 * 🎞 อัปภาพทีละเฟรมของ "คลิปเล่นตามการเลื่อน" (ผืนผ้าใบ ฉากค้าง · ชิ้นวิดีโอ scIn = scrub)
 *
 * ERP แปลงคลิปเป็นภาพทีละเฟรมในเบราว์เซอร์ (lib/website-scrub-frames.ts) แล้วส่งมาทีละชุด
 * POST FormData: set (รหัสชุด a-z0-9- 8–40 ตัว) · start (ลำดับเฟรมแรกของชุดนี้) · ext (webp|jpg) · frame (ไฟล์ ซ้ำได้หลายไฟล์)
 *   → R2 `storefront-scrub/<set>/<000>.<ext>` (เว็บร้านโหลดผ่าน /api/r2-image) · done=1 + count = จบชุด → บันทึก audit
 * ไม่ลงคลังไฟล์ (เป็นของที่สร้างจากคลิป — สร้างใหม่ได้เสมอ)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardWebsite } from "@/lib/website-api-guard";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2PutObject } from "@/lib/r2";
import { writeAuditFor } from "@/lib/audit";
import { CANVAS_SCRUB_MAX_FRAMES, CANVAS_SCRUB_PREFIX } from "@/lib/website-canvas";

const SET = /^[a-z0-9-]{8,40}$/;
const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg" };
/** ต่อเฟรม (720px WebP ปกติ ~30–80KB) */
const MAX_FRAME = 600 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });
  }
  const set = String(form.get("set") ?? "");
  const ext = String(form.get("ext") ?? "webp");
  const start = Number(form.get("start") ?? 0);
  if (!SET.test(set) || !TYPES[ext] || !Number.isInteger(start) || start < 0) return NextResponse.json({ error: "รหัสชุด/ชนิดภาพ/ลำดับไม่ถูกต้อง" }, { status: 400 });
  const prefix = `${CANVAS_SCRUB_PREFIX}/${set}`;

  // จบชุด: บันทึกว่าใครเตรียมคลิปไหน กี่เฟรม (ไฟล์อัปครบแล้ว)
  if (form.get("done") === "1") {
    const count = Number(form.get("count") ?? 0);
    if (!Number.isInteger(count) || count < 2 || count > CANVAS_SCRUB_MAX_FRAMES) return NextResponse.json({ error: "จำนวนเฟรมไม่ถูกต้อง" }, { status: 400 });
    await writeAuditFor(request, supabaseAdmin(), {
      action: "create",
      entityType: "website_scrub_frames",
      entityId: set,
      metadata: { prefix, count, ext, video: String(form.get("video") ?? "").slice(0, 200) },
    });
    return NextResponse.json({ key: prefix, count, ext });
  }

  const files = form.getAll("frame").filter((f): f is File => f instanceof File);
  if (!files.length || files.length > 16) return NextResponse.json({ error: "ส่งได้ครั้งละ 1–16 เฟรม" }, { status: 400 });
  if (start + files.length > CANVAS_SCRUB_MAX_FRAMES) return NextResponse.json({ error: `ไม่เกิน ${CANVAS_SCRUB_MAX_FRAMES} เฟรม` }, { status: 400 });
  for (const f of files) {
    if (f.size > MAX_FRAME) return NextResponse.json({ error: "ภาพเฟรมใหญ่เกินไป" }, { status: 413 });
    if (f.type && f.type !== TYPES[ext]) return NextResponse.json({ error: "ชนิดภาพไม่ตรง" }, { status: 400 });
  }
  try {
    await Promise.all(files.map(async (f, i) => r2PutObject(`${prefix}/${String(start + i).padStart(3, "0")}.${ext}`, new Uint8Array(await f.arrayBuffer()), TYPES[ext])));
  } catch {
    return NextResponse.json({ error: "อัปภาพไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, saved: files.length });
}
