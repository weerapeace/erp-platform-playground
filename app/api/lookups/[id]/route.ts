/**
 * Generic Lookups — single value PATCH / DELETE
 *
 * 🔒 (audit 2026-11-17) ตาราง erp_lookups ปิดเขียนตรงแล้ว → เขียนผ่านเซิร์ฟเวอร์ (service role) ที่นี่เท่านั้น
 *    ต้องล็อกอิน (เหมือนเดิม — หน้าเงินเดือน/ฟอร์มพนักงาน/ตัวเลือกทั่วไปใช้ร่วม) + บันทึก audit ทุกการแก้/ลบ
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

const ALLOWED = ["name", "code", "sort_order", "parent_id", "is_active", "metadata"];

async function currentUser(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return user;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  for (const k of ALLOWED) if (body[k] !== undefined) patch[k] = body[k];
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มี field ที่ update" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("erp_lookups").select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

  const { data, error } = await admin
    .from("erp_lookups")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const old: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) old[k] = (before as Record<string, unknown>)[k];
  await writeAudit(admin, {
    action: "update", entityType: "erp_lookup", entityId: id, actorId: user.id, actorName: user.email ?? null,
    metadata: { lookup_type: before.lookup_type, name: before.name, old, new: patch },
  });
  return NextResponse.json({ data, error: null });
}

// DELETE — default: soft delete (is_active=false) · ?hard=1: ลบจริงออกจากตาราง
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("erp_lookups").select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

  const { error } = hard
    ? await admin.from("erp_lookups").delete().eq("id", id)
    : await admin.from("erp_lookups").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, {
    action: hard ? "delete" : "archive", entityType: "erp_lookup", entityId: id, actorId: user.id, actorName: user.email ?? null,
    metadata: { lookup_type: before.lookup_type, snapshot: before },
  });
  return NextResponse.json({ ok: true, error: null });
}
