/**
 * 🧵 ไฟล์ปัก — อ่าน / แก้ / ลบ งานเดียว
 * GET    /api/embroidery/designs/<id>          → { data: row (มีเส้นของชิ้น + สินค้าที่ผูก) }
 * PATCH  /api/embroidery/designs/<id>          → ส่งเฉพาะช่องที่แก้ · is_active:true = กู้คืนจากถังขยะ
 * DELETE /api/embroidery/designs/<id>          → ลบแบบเก็บไว้ก่อน (ย้ายเข้าถังขยะ)
 * DELETE /api/embroidery/designs/<id>?hard=1   → ลบถาวร — เฉพาะงานที่อยู่ในถังขยะแล้ว
 * สิทธิ์ embroidery.view / embroidery.edit · audit ทุกการเขียน (ค่าตั้งจดเป็นรายช่อง จาก → เป็น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import type { BlockPiece } from "@/lib/block-print";
import type { EmbSettings } from "@/lib/embroidery";
import { bad, cleanDesignBody, EDIT_PERM, ENTITY, isUuid, settingsAuditChanges, TABLE, VIEW_PERM } from "../../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

const load = (id: string) => supabaseAdmin().from(TABLE).select("*, parent:parent_skus_v2(id, code, name:name_th)").eq("id", id).maybeSingle();

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("ไม่พบงานนี้", 404);
  const { data, error } = await load(id);
  if (error) return bad(friendlyDbError(error.message), 500);
  if (!data) return bad("ไม่พบงานนี้", 404);
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("ไม่พบงานนี้", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const { data: before } = await load(id);
  if (!before) return bad("ไม่พบงานนี้", 404);
  const v = cleanDesignBody(body, true, (before.pieces ?? []) as BlockPiece[]);
  if (!v.ok) return bad(v.error);

  const out: Record<string, unknown> = { ...v.patch, updated_at: new Date().toISOString() };
  if (v.patch.is_active === true) out.deleted_at = null;
  if (v.patch.is_active === false) out.deleted_at = new Date().toISOString();
  const admin = supabaseAdmin();
  const { data, error } = await admin.from(TABLE).update(out).eq("id", id).select("*, parent:parent_skus_v2(id, code, name:name_th)").single();
  if (error) return bad(friendlyDbError(error.message));

  const { pieces, settings, stitch_count: _s, color_count: _c, width_mm: _w, height_mm: _h, shop_file_b64: _b, shop_file_kind: _k, shop_file_at: _a, shop_file_name, ...plain } = v.patch;
  const meta = auditChangeMeta(before, plain);
  const extra = settings ? settingsAuditChanges(before.settings as Partial<EmbSettings>, settings) : [];
  if ("shop_file" in body) extra.push({ field: "shop_file", label: "ไฟล์จากร้าน", old: before.shop_file_name ?? null, new: shop_file_name ?? null });
  if (pieces) extra.push({ field: "pieces", label: "ลาย (เปิดไฟล์ใหม่ / แก้จุด / เพิ่มตัวหนังสือ)", old: `${(before.pieces ?? []).length} ชิ้น`, new: `${pieces.length} ชิ้น` });
  const action = v.patch.is_active === true && before.is_active === false ? "restore" : v.patch.is_active === false && before.is_active ? "archive" : "update";
  if (action !== "update" || meta.changes?.length || extra.length) {
    await writeAuditFor(request, admin, {
      action, entityType: ENTITY, entityId: id,
      metadata: { code: data.code, name: data.name, ...meta, changes: [...(meta.changes ?? []), ...extra] },
    });
  }
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("ไม่พบงานนี้", 404);
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const { data: before } = await load(id);
  if (!before) return bad("ไม่พบงานนี้", 404);
  const admin = supabaseAdmin();
  if (hard) {
    if (before.is_active) return bad("ลบถาวรได้เฉพาะงานที่อยู่ในถังขยะ — ย้ายเข้าถังขยะก่อน", 409);
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
