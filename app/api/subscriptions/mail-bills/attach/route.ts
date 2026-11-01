/**
 * POST /api/subscriptions/mail-bills/attach { sub_id, month, message_id, part_id } — แนบไฟล์จากเมลเป็นบิลของเดือนนั้น (subscriptions.edit)
 * เรียกหลังผู้ใช้เลือกไฟล์ + กด "ยืนยันแนบบิล" เท่านั้น · ใช้ saveSubInvoice เดียวกับ 📎 แนบบิล (อ่านยอดจาก PDF ให้เหมือนเดิม)
 * จำเลขเมลไว้ (gmail_message_id) กันแนบไฟล์เดิมซ้ำ + audit ว่ามาจากเมลไหน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { gmailGetAttachment } from "@/lib/gmail-api";
import { loadMailContext } from "@/lib/subscription-mail-bills-server";
import { saveSubInvoice } from "@/lib/subscription-invoices-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;

  let body: { sub_id?: string; month?: string; message_id?: string; part_id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const month = String(body.month ?? "");
  if (!body.sub_id || !body.message_id || !body.part_id || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ (รายการ/เดือน/เมล/ไฟล์)" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const ctx = await loadMailContext(request, db, body.sub_id);
  if ("res" in ctx) return ctx.res;

  const got = await gmailGetAttachment(ctx.token, body.message_id, body.part_id);
  if (!got) return NextResponse.json({ error: "ไม่พบไฟล์แนบนี้ในเมลแล้ว ลองค้นใหม่" }, { status: 404 });

  // กันแนบไฟล์เดิมจากเมลเดิมซ้ำ
  const safeName = got.attachment.filename.replace(/[^\w.\-() ]+/g, "_");
  const { data: dup } = await db.from("subscription_invoices").select("id, month")
    .eq("subscription_id", ctx.sub.id).eq("gmail_message_id", body.message_id).eq("file_name", safeName).maybeSingle();
  if (dup) return NextResponse.json({ error: `ไฟล์นี้แนบไปแล้ว (เดือน ${dup.month})` }, { status: 409 });

  const saved = await saveSubInvoice(db, {
    subId: ctx.sub.id, month, fileName: got.attachment.filename, contentType: got.attachment.mimeType,
    bytes: got.bytes.slice().buffer, actorId: ctx.uid, gmailMessageId: body.message_id,
    auditExtra: { source: "gmail", email: ctx.email, message_id: body.message_id, subject: got.message.subject, from: got.message.from },
  });
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ data: saved.data, error: null });
}
