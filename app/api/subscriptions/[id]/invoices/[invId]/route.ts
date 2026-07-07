/**
 * /api/subscriptions/[id]/invoices/[invId] — ลบใบเสร็จ 1 ไฟล์ (subscriptions.edit)
 * ลบทั้ง row และไฟล์ใน Storage
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
