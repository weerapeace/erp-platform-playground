/**
 * 🎬 Video Shot — แก้ / ลบ ช็อตเดียว (learn.manage)
 * PATCH  /api/learn/shots/<id>          → ส่งเฉพาะช่องที่แก้ · is_active:true = กู้คืนจากถังขยะ · เปลี่ยนลิงก์ = ดึงภาพปกใหม่ให้
 * DELETE /api/learn/shots/<id>          → ลบแบบเก็บไว้ก่อน (ถังขยะ)
 * DELETE /api/learn/shots/<id>?hard=1   → ลบถาวร — เฉพาะช็อตที่อยู่ในถังขยะ
 * audit ทุกการเขียน (changes: จาก → เป็น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAuditFor } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { LEARN_MANAGE } from "@/lib/learn";
import { cleanShotBody } from "@/lib/video-shot";
import { fetchShotMeta, loadShot, resolveShotLink } from "@/lib/video-shot-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  const { id } = await ctx.params;
  const before = await loadShot(id);
  if (!before) return bad("ไม่พบช็อตนี้", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }

  if (Object.prototype.hasOwnProperty.call(body, "url")) {
    const link = await resolveShotLink(String(body.url ?? ""));
    if (!link) return bad("ลิงก์นี้ยังไม่รองรับ — ใช้ลิงก์ YouTube / TikTok / Pinterest / Instagram");
    body = { ...body, url: link.url };
    if (link.url !== before.url && !Object.prototype.hasOwnProperty.call(body, "thumb_url") && link.id) {
      const meta = await fetchShotMeta(link).catch(() => null);
      body.thumb_url = meta?.thumb_url ?? null;
    }
  }
  const v = cleanShotBody(body, true, before);
  if (!v.ok) return bad(v.error);

  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const now = new Date().toISOString();
  const out: Record<string, unknown> = { ...v.patch, updated_at: now, updated_by: actor.name };
  if (v.patch.is_active === true) out.deleted_at = null;
  if (v.patch.is_active === false) out.deleted_at = now;
  const { error } = await admin.from("erp_video_shots").update(out).eq("id", id);
  if (error) return bad("บันทึกช็อตไม่สำเร็จ กรุณาลองใหม่", 500);

  const action = v.patch.is_active === true && !before.is_active ? "restore" : v.patch.is_active === false && before.is_active ? "archive" : "update";
  const meta = auditChangeMeta(before as unknown as Record<string, unknown>, v.patch as Record<string, unknown>);
  await writeAuditFor(request, admin, { action, entityType: "learn_shot", entityId: id, metadata: { name: v.patch.title ?? before.title, ...meta } });
  return NextResponse.json({ data: await loadShot(id), error: null });
}

export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  const { id } = await ctx.params;
  const before = await loadShot(id);
  if (!before) return bad("ไม่พบช็อตนี้", 404);
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const admin = supabaseAdmin();
  if (hard) {
    if (before.is_active) return bad("ลบถาวรได้เฉพาะช็อตที่อยู่ในถังขยะ — ย้ายเข้าถังขยะก่อน", 409);
    const { error } = await admin.from("erp_video_shots").delete().eq("id", id);
    if (error) return bad("ลบถาวรไม่สำเร็จ กรุณาลองใหม่", 500);
    await writeAuditFor(request, admin, { action: "delete", entityType: "learn_shot", entityId: id, metadata: { hard: true, name: before.title, snapshot: before } });
    return NextResponse.json({ data: { id }, error: null });
  }
  const now = new Date().toISOString();
  const { error } = await admin.from("erp_video_shots").update({ is_active: false, deleted_at: now, updated_at: now }).eq("id", id);
  if (error) return bad("ลบไม่สำเร็จ กรุณาลองใหม่", 500);
  await writeAuditFor(request, admin, { action: "archive", entityType: "learn_shot", entityId: id, metadata: { hard: false, name: before.title } });
  return NextResponse.json({ data: { id }, error: null });
}
