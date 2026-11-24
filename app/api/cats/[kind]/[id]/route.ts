/**
 * 🐾 ทะเบียนแมว — แก้ / ลบ รายการเดียว
 * PATCH  /api/cats/<kind>/<id>          → ส่งเฉพาะช่องที่แก้ · is_active:true = กู้คืนจากถังขยะ
 * DELETE /api/cats/<kind>/<id>          → ลบแบบเก็บไว้ก่อน (ย้ายเข้าถังขยะ)
 * DELETE /api/cats/<kind>/<id>?hard=1   → ลบถาวร — เฉพาะของในถังขยะ
 *   (ลบแมวถาวร = ประวัติของแมวตัวนั้นหายด้วย · ลบคลินิกถาวร = ประวัติเดิมยังอยู่ แค่ไม่มีชื่อคลินิก)
 * สิทธิ์ cats.edit · audit ทุกการเขียน (changes: จาก → เป็น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { CATS_EDIT, cleanCatBody, recordLabel } from "@/lib/cats";
import { bad, kindOf, UUID } from "../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ kind: string; id: string }> };

async function resolve(ctx: Ctx) {
  const { kind, id } = await ctx.params;
  const k = kindOf(kind);
  if (!k || !UUID.test(id)) return null;
  const { data } = await supabaseAdmin().from(k.table).select("*").eq("id", id).maybeSingle();
  return data ? { ...k, id, before: data as Record<string, unknown> } : null;
}

export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, CATS_EDIT); if (denied) return denied;
  const r = await resolve(ctx);
  if (!r) return bad("ไม่พบรายการนี้", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  // แก้แค่วันนัด → เทียบกับวันที่ให้เดิม (กันวันนัดก่อนวันที่ให้)
  const merged = { ...body };
  if ("next_due_date" in body && !("date_given" in body) && r.before.date_given) merged.date_given = r.before.date_given;
  const v = cleanCatBody(r.kind, merged, true);
  if (!v.ok) return bad(v.error);
  const patch = { ...v.patch };
  if (!("date_given" in body)) delete patch.date_given;
  // นับสต็อกใหม่ → จำเวลาที่นับ (ไม่ส่งมา = ตอนนี้) · ซื้อเข้าหลังเวลานี้เท่านั้นที่บวกเพิ่ม (lib/cats-supplies)
  if (r.kind === "supplies" && "stock_base_qty" in patch && !("stock_base_at" in patch)) patch.stock_base_at = new Date().toISOString();

  const now = new Date().toISOString();
  const out: Record<string, unknown> = { ...patch, updated_at: now };
  if (patch.is_active === true) out.deleted_at = null;
  if (patch.is_active === false) out.deleted_at = now;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from(r.table).update(out).eq("id", r.id).select("*").single();
  if (error) return bad(friendlyDbError(error.message));

  const action = patch.is_active === true && r.before.is_active === false ? "restore" : patch.is_active === false && r.before.is_active ? "archive" : "update";
  await writeAuditFor(request, admin, {
    action, entityType: r.table, entityId: r.id,
    metadata: { name: recordLabel(r.kind, data), ...auditChangeMeta(r.before, patch) },
  });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, CATS_EDIT); if (denied) return denied;
  const r = await resolve(ctx);
  if (!r) return bad("ไม่พบรายการนี้", 404);
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const admin = supabaseAdmin();
  const name = recordLabel(r.kind, r.before);
  if (hard) {
    if (r.before.is_active) return bad("ลบถาวรได้เฉพาะรายการที่อยู่ในถังขยะ — ย้ายเข้าถังขยะก่อน", 409);
    const { error } = await admin.from(r.table).delete().eq("id", r.id);
    if (error) return bad(friendlyDbError(error.message));
    await writeAuditFor(request, admin, { action: "delete", entityType: r.table, entityId: r.id, metadata: { hard: true, name, snapshot: r.before } });
    return NextResponse.json({ id: r.id, error: null });
  }
  const now = new Date().toISOString();
  const { error } = await admin.from(r.table).update({ is_active: false, deleted_at: now, updated_at: now }).eq("id", r.id);
  if (error) return bad(friendlyDbError(error.message));
  await writeAuditFor(request, admin, { action: "archive", entityType: r.table, entityId: r.id, metadata: { hard: false, name } });
  return NextResponse.json({ id: r.id, error: null });
}
