/**
 * /api/subscriptions/[id]/invoices/[invId] — แก้ค่า / ลบ ใบเสร็จ 1 ไฟล์ (subscriptions.edit)
 * PATCH  → แก้ amount/currency/invoice_date/month เอง (เช่นตอนระบบอ่านผิด) · set parsed_at กัน backfill ทับ
 * DELETE → ลบทั้ง row และไฟล์ใน Storage
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CUR = new Set(["THB", "USD", "EUR", ""]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; invId: string }> }) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  const { id, invId } = await params;

  let body: { amount?: number | string | null; currency?: string; invoice_date?: string | null; month?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if (body.amount !== undefined) {
    const n = body.amount === null || body.amount === "" ? null : Number(body.amount);
    if (n !== null && !isFinite(n)) return NextResponse.json({ error: "จำนวนเงินไม่ถูกต้อง" }, { status: 400 });
    patch.amount = n;
  }
  if (body.currency !== undefined) {
    if (!CUR.has(body.currency)) return NextResponse.json({ error: "สกุลเงินไม่ถูกต้อง" }, { status: 400 });
    patch.currency = body.currency || "";
  }
  if (body.invoice_date !== undefined) {
    const d = body.invoice_date || null;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    patch.invoice_date = d;
  }
  if (body.month !== undefined && /^\d{4}-\d{2}$/.test(body.month)) patch.month = body.month;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });
  patch.parsed_at = new Date().toISOString(); // แก้เอง = ตรวจแล้ว (กันปุ่มอ่านบิลย้อนหลังทับ)

  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const db = supabaseAdmin();
  const { data, error } = await db.from("subscription_invoices")
    .update(patch).eq("id", invId).eq("subscription_id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "แก้ไขไม่สำเร็จ" }, { status: 500 });

  await writeAudit(db, {
    action: "update", entityType: "subscription_invoices", entityId: null,
    actorId: auth?.user?.id ?? null, actorName: null,
    metadata: { sub_id: id, inv_id: invId, changed: Object.keys(patch).filter((k) => k !== "parsed_at") },
  });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; invId: string }> }) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  const { id, invId } = await params;

  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const db = supabaseAdmin();

  const { data: inv } = await db.from("subscription_invoices")
    .select("file_path, file_name").eq("id", invId).eq("subscription_id", id).single();
  if (!inv) return NextResponse.json({ error: "ไม่พบใบเสร็จ" }, { status: 404 });

  if (inv.file_path) { try { await db.storage.from("invoices").remove([inv.file_path as string]); } catch { /* ignore */ } }
  const { error } = await db.from("subscription_invoices").delete().eq("id", invId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(db, {
    action: "detach", entityType: "subscription_invoices", entityId: null,
    actorId: auth?.user?.id ?? null, actorName: null,
    metadata: { sub_id: id, inv_id: invId, file: inv.file_name },
  });
  return NextResponse.json({ ok: true, error: null });
}
