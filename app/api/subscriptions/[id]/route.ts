/**
 * /api/subscriptions/[id] — แก้ไข / ลบ รายการ (subscriptions.edit)
 * PATCH  → อัปเดตเฉพาะ field ที่ส่งมา
 * DELETE → ลบรายการ + ใบเสร็จที่แนบ (row + ไฟล์ใน Storage)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi, apiCan } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { toSubRow, validateSubInput, type SubInput } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // สิทธิ์ขั้นต่ำ = view (แก้ "ส่วนตัวของตัวเอง" ได้) · รายการงาน/ของคนอื่นต้องมีสิทธิ์ edit
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;
  const { id } = await params;

  let body: Partial<SubInput> & { actor?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const err = validateSubInput(body, false);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const patch: Record<string, unknown> = { ...toSubRow(body), updated_at: new Date().toISOString() };
  if (Object.keys(patch).length <= 1) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });

  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const me = auth?.user?.id ?? null;

  const db = supabaseAdmin();

  // ตรวจสิทธิ์: รายการ "ส่วนตัว" ที่มีเจ้าของ → แก้ได้เฉพาะเจ้าของ (คนที่ถูกแชร์ดูได้อย่างเดียว)
  const { data: cur } = await db.from("subscriptions").select("type, owner_id").eq("id", id).single();
  const isOwnPersonal = cur?.type === "personal" && !!cur.owner_id && cur.owner_id === me;
  if (cur?.type === "personal" && cur.owner_id && cur.owner_id !== me) {
    return NextResponse.json({ error: "รายการส่วนตัวนี้แก้ได้เฉพาะเจ้าของ" }, { status: 403 });
  }
  // ไม่ใช่ส่วนตัวของตัวเอง (งาน / ส่วนตัวเก่าไม่มีเจ้าของ) → ต้องมีสิทธิ์ edit
  if (!isOwnPersonal && !(await apiCan(request, "subscriptions.edit"))) {
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้ไข (subscriptions.edit)" }, { status: 403 });
  }
  // รักษาความสอดคล้อง owner_id ตามประเภทหลังแก้: personal→มีเจ้าของ, work→ไม่มีเจ้าของ
  const nextType = (patch.type as string | undefined) ?? cur?.type;
  if (nextType === "personal") patch.owner_id = (cur?.owner_id as string | null) || me;
  else if (nextType === "work") patch.owner_id = null;

  const { data, error } = await db.from("subscriptions").update(patch).eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "update failed" }, { status: 500 });

  await writeAudit(db, {
    action: "update", entityType: "subscriptions", entityId: null,
    actorId: auth?.user?.id ?? null, actorName: body.actor ?? null,
    metadata: { sub_id: id, name: data.name, changed: Object.keys(toSubRow(body)) },
  });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // สิทธิ์ขั้นต่ำ = view (ลบ "ส่วนตัวของตัวเอง" ได้) · รายการงาน/ของคนอื่นต้องมีสิทธิ์ edit
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;
  const { id } = await params;

  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const me = auth?.user?.id ?? null;
  const db = supabaseAdmin();

  // ชื่อไว้ log ก่อนลบ + ตรวจสิทธิ์เจ้าของ (รายการส่วนตัวลบได้เฉพาะเจ้าของ)
  const { data: sub } = await db.from("subscriptions").select("name, type, owner_id").eq("id", id).single();
  if (sub?.type === "personal" && sub.owner_id && sub.owner_id !== me) {
    return NextResponse.json({ error: "รายการส่วนตัวนี้ลบได้เฉพาะเจ้าของ" }, { status: 403 });
  }
  // ไม่ใช่ส่วนตัวของตัวเอง (งาน / ส่วนตัวเก่าไม่มีเจ้าของ) → ต้องมีสิทธิ์ edit
  const isOwnPersonal = sub?.type === "personal" && !!sub.owner_id && sub.owner_id === me;
  if (!isOwnPersonal && !(await apiCan(request, "subscriptions.edit"))) {
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้ไข (subscriptions.edit)" }, { status: 403 });
  }

  // ลบใบเสร็จที่แนบ (ไฟล์ Storage + row) แบบ best-effort ก่อนลบรายการ
  const { data: invs } = await db.from("subscription_invoices").select("id, file_path").eq("subscription_id", id);
  if (invs && invs.length > 0) {
    const paths = invs.map((i) => i.file_path as string).filter(Boolean);
    if (paths.length) { try { await db.storage.from("invoices").remove(paths); } catch { /* ignore */ } }
    await db.from("subscription_invoices").delete().eq("subscription_id", id);
  }

  const { error } = await db.from("subscriptions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(db, {
    action: "delete", entityType: "subscriptions", entityId: null,
    actorId: auth?.user?.id ?? null, actorName: null,
    metadata: { sub_id: id, name: sub?.name ?? null, invoices_removed: invs?.length ?? 0 },
  });
  return NextResponse.json({ ok: true, error: null });
}
