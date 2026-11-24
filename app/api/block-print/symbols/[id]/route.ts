/**
 * 🧱 บล็อกพิมพ์ — คลังสัญลักษณ์ ตัวเดียว
 * PATCH  /api/block-print/symbols/<id>          → แก้ชื่อ / หมวด / ขนาดที่ใช้บ่อย (w,h) · is_active:true = กู้คืน · is_active:false = ย้ายเข้าถังขยะ
 * DELETE /api/block-print/symbols/<id>          → ย้ายเข้าถังขยะ
 * DELETE /api/block-print/symbols/<id>?hard=1   → ลบถาวร (เฉพาะที่อยู่ในถังขยะแล้ว)
 * สิทธิ์ block_print.edit · audit ทุกการเขียน (changes จาก → เป็น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { SYMBOL_LIMITS } from "@/lib/block-print-symbols";
import { bad, EDIT_PERM } from "../../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "block_print_symbols";
const ENTITY = "block_print_symbols";
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;
const load = (id: string) => supabaseAdmin().from(TABLE).select("id, code, name, category, w, h, is_active").eq("id", id).maybeSingle();

export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("ไม่พบสัญลักษณ์นี้", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = String(body.name ?? "").trim().slice(0, SYMBOL_LIMITS.name);
    if (!name) return bad("ต้องใส่ชื่อสัญลักษณ์");
    patch.name = name;
  }
  if ("category" in body) patch.category = String(body.category ?? "").trim().slice(0, SYMBOL_LIMITS.category) || null;
  for (const k of ["w", "h"] as const) {
    if (!(k in body)) continue;
    const v = Number(body[k]);
    if (!(Number.isFinite(v) && v > 0 && v <= 2000)) return bad("ขนาดไม่ถูกต้อง");
    patch[k] = v;
  }
  if ("is_active" in body) patch.is_active = body.is_active === true;
  if (!Object.keys(patch).length) return bad("ไม่มีช่องที่ต้องแก้");
  const { data: before } = await load(id);
  if (!before) return bad("ไม่พบสัญลักษณ์นี้", 404);
  const now = new Date().toISOString();
  const out: Record<string, unknown> = { ...patch, updated_at: now };
  if (patch.is_active === true) out.deleted_at = null;
  if (patch.is_active === false) out.deleted_at = now;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from(TABLE).update(out).eq("id", id).select("*").single();
  if (error) return bad(friendlyDbError(error.message));
  const action = patch.is_active === true && !before.is_active ? "restore" : patch.is_active === false && before.is_active ? "archive" : "update";
  await writeAuditFor(request, admin, { action, entityType: ENTITY, entityId: id, metadata: { code: data.code, name: data.name, ...auditChangeMeta(before, patch) } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("ไม่พบสัญลักษณ์นี้", 404);
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const { data: before } = await load(id);
  if (!before) return bad("ไม่พบสัญลักษณ์นี้", 404);
  const admin = supabaseAdmin();
  if (hard) {
    if (before.is_active) return bad("ลบถาวรได้เฉพาะที่อยู่ในถังขยะ — ย้ายเข้าถังขยะก่อน", 409);
    const { error } = await admin.from(TABLE).delete().eq("id", id);
    if (error) return bad(friendlyDbError(error.message));
    await writeAuditFor(request, admin, { action: "delete", entityType: ENTITY, entityId: id, metadata: { hard: true, code: before.code, name: before.name } });
    return NextResponse.json({ id, error: null });
  }
  const now = new Date().toISOString();
  const { error } = await admin.from(TABLE).update({ is_active: false, deleted_at: now, updated_at: now }).eq("id", id);
  if (error) return bad(friendlyDbError(error.message));
  await writeAuditFor(request, admin, { action: "archive", entityType: ENTITY, entityId: id, metadata: { hard: false, code: before.code, name: before.name } });
  return NextResponse.json({ id, error: null });
}
