/**
 * POST /api/subscriptions/mail-bills/file { sub_id, message_id, part_id } — เปิดดูไฟล์แนบจากเมลก่อนตัดสินใจแนบ (subscriptions.edit)
 * คืนเนื้อไฟล์ตรง ๆ (PDF/รูป) · ไม่บันทึกอะไร
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { gmailGetAttachment } from "@/lib/gmail-api";
import { invoiceFileKind } from "@/lib/subscriptions";
import { loadMailContext } from "@/lib/subscription-mail-bills-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;

  let body: { sub_id?: string; message_id?: string; part_id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.sub_id || !body.message_id || !body.part_id) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const ctx = await loadMailContext(request, supabaseAdmin(), body.sub_id);
  if ("res" in ctx) return ctx.res;

  const got = await gmailGetAttachment(ctx.token, body.message_id, body.part_id);
  if (!got) return NextResponse.json({ error: "ไม่พบไฟล์แนบนี้ในเมล" }, { status: 404 });
  const kind = invoiceFileKind(got.attachment.filename, got.attachment.mimeType);
  if (!kind) return NextResponse.json({ error: "ไฟล์นี้ไม่ใช่ PDF หรือรูปภาพ" }, { status: 400 });

  const type = kind === "pdf" ? "application/pdf" : (got.attachment.mimeType || "application/octet-stream");
  return new NextResponse(Buffer.from(got.bytes), {
    headers: { "Content-Type": type, "Cache-Control": "no-store", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(got.attachment.filename)}` },
  });
}
