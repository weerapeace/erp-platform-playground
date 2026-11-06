/**
 * Design Sheets — ใบแจ้งลูกค้า ทีละใบ
 *
 * GET    /api/design-sheets/[id]/notices/[noticeId] → { data: NoticeRecord }
 * PATCH  /api/design-sheets/[id]/notices/[noticeId] → แก้เฉพาะช่องที่ส่งมา (kind/title/images/img_cols/calc/note/display)
 *        ส่งมาแค่ display (สิ่งที่เลือกโชว์ตอนส่ง PDF/JPEG) = ค่าการแสดงผล ไม่ลงประวัติ (เหมือนค่าตั้งหน้าจอ)
 * DELETE /api/design-sheets/[id]/notices/[noticeId] → ลบใบแจ้ง (เก็บสำเนาหัวข้อ/ชนิดไว้ในประวัติ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../../master-v2/[entity]/route";
import { cleanNotice, cleanNoticeDisplay } from "@/lib/design-sheet-notice";
import { NOTICE_COLS, noticeActor, noticeFromRow } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string; noticeId: string }> };
const FIELDS = ["kind", "title", "images", "img_cols", "calc", "note", "display"] as const;

export async function GET(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id, noticeId } = await params;
  const { data, error } = await supabaseAdmin().from("design_sheet_notices").select(NOTICE_COLS)
    .eq("sheet_id", id).eq("id", noticeId).maybeSingle();
  if (error) return NextResponse.json({ data: null, error: friendlyDbError(error.message) }, { status: 500 });
  if (!data) return NextResponse.json({ data: null, error: "ไม่พบใบแจ้งนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  return NextResponse.json({ data: noticeFromRow(data as Record<string, unknown>), error: null });
}

export async function PATCH(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id, noticeId } = await params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const sent = FIELDS.filter((k) => body && k in body);
  if (!sent.length) return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  const actor = await noticeActor(request, admin);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: actor.id };
  if (sent.length === 1 && sent[0] === "display") {
    patch.show = cleanNoticeDisplay(body.display);
  } else {
    const doc = cleanNotice(body);   // ช่องที่ไม่ส่งมา cleanNotice ใส่ค่าตั้งต้น → หยิบเฉพาะช่องที่ส่งมา
    if (sent.includes("kind")) patch.kind = doc.kind;
    if (sent.includes("title")) patch.title = doc.title;
    if (sent.includes("images")) patch.images = doc.images;
    if (sent.includes("img_cols")) patch.img_cols = doc.img_cols;
    if (sent.includes("calc")) patch.calc = doc.calc;
    if (sent.includes("note")) patch.note = doc.note || null;
    if (sent.includes("display")) patch.show = doc.display;
  }
  const { data, error } = await admin.from("design_sheet_notices").update(patch)
    .eq("sheet_id", id).eq("id", noticeId).select(NOTICE_COLS).maybeSingle();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  if (!data) return NextResponse.json({ error: "ไม่พบใบแจ้งนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  if (!(sent.length === 1 && sent[0] === "display")) {
    await writeAudit(admin, {
      action: "notice_update", entityType: "design_sheet", entityId: id, actorId: actor.id, actorName: actor.email,
      metadata: { notice_id: noticeId, fields: sent, title: (data as { title?: string }).title ?? null },
    });
  }
  return NextResponse.json({ data: noticeFromRow(data as Record<string, unknown>), error: null });
}

export async function DELETE(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id, noticeId } = await params;
  const admin = supabaseAdmin();
  const { data: old } = await admin.from("design_sheet_notices").select(NOTICE_COLS).eq("sheet_id", id).eq("id", noticeId).maybeSingle();
  if (!old) return NextResponse.json({ error: "ไม่พบใบแจ้งนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await admin.from("design_sheet_notices").delete().eq("sheet_id", id).eq("id", noticeId);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  const actor = await noticeActor(request, admin);
  const n = noticeFromRow(old as Record<string, unknown>);
  await writeAudit(admin, {
    action: "notice_delete", entityType: "design_sheet", entityId: id, actorId: actor.id, actorName: actor.email,
    metadata: { notice_id: noticeId, kind: n.kind, title: n.title, images: n.images.length, note: n.note.slice(0, 300), created_by: n.created_by_name },
  });
  return NextResponse.json({ ok: true, error: null });
}
