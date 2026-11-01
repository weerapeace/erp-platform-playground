/**
 * /api/gmail/connections — สถานะการเชื่อม Gmail (ไม่ส่ง token ออกไปเด็ดขาด)
 * GET    → { configured, data: [{ email, connected_at, last_used_at, last_error }] } (subscriptions.view)
 * DELETE ?email= → เลิกเชื่อม (ยกเลิกสิทธิ์ที่ Google + ลบ) (subscriptions.edit)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { deleteGmailConnection, gmailConfigured, listGmailConnections, normEmail } from "@/lib/gmail-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;
  const data = await listGmailConnections(supabaseAdmin());
  return NextResponse.json({ configured: gmailConfigured(), data, error: null });
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  const email = normEmail(request.nextUrl.searchParams.get("email"));
  if (!email) return NextResponse.json({ error: "ไม่ได้ระบุอีเมล" }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await deleteGmailConnection(db, email);
  if (error) return NextResponse.json({ error }, { status: 500 });
  await writeAuditFor(request, db, { action: "disconnect", entityType: "gmail_connections", entityId: null, metadata: { email } });
  return NextResponse.json({ ok: true, error: null });
}
