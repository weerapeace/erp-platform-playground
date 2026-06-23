/**
 * POST /api/assets/[id]/replace — แทนที่ไฟล์เดิมด้วยไฟล์ใหม่ (multipart: file)
 *
 * สำคัญ: เขียนทับ "R2 key เดิม" → ทุกที่ที่เก็บ key นี้ไว้ (offer item / cover_image / attachment)
 * เห็นรูปใหม่ทันที โดยไม่ต้องไล่แก้ทุกโมดูล + asset id เดิม → usages/ลิงก์ทั้งหมดคงอยู่
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { r2PutObject, isR2Configured } from "@/lib/r2";
import { detectAssetType, extOf, sha256Hex, ASSET_MAX_BYTES } from "@/lib/assets";
import { rowOf, actorId } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "assets.edit");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!(await isR2Configured()))
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (R2)" }, { status: 503 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "ต้องเป็น multipart/form-data" }, { status: 400 }); }
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "ต้องแนบไฟล์" }, { status: 400 });
  if (file.size > ASSET_MAX_BYTES)
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${Math.round(ASSET_MAX_BYTES / 1024 / 1024)}MB` }, { status: 400 });
  const widthRaw  = form.get("width")  ? Number(form.get("width"))  : NaN;
  const heightRaw = form.get("height") ? Number(form.get("height")) : NaN;

  const admin = supabaseAdmin();
  const { data: asset, error: e0 } = await admin.from("assets").select("id, r2_key").eq("id", id).maybeSingle();
  if (e0) return NextResponse.json({ error: e0.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404 });

  const oldKey = (asset as { r2_key: string }).r2_key;
  const buffer = await file.arrayBuffer();
  const checksum = await sha256Hex(buffer);
  try {
    await r2PutObject(oldKey, new Uint8Array(buffer), file.type || "application/octet-stream");
  } catch (err: unknown) {
    return NextResponse.json({ error: "อัปโหลดไฟล์ใหม่ไม่สำเร็จ: " + (err instanceof Error ? err.message : "") }, { status: 500 });
  }

  const { data: upd, error } = await admin.from("assets").update({
    file_name: file.name, content_type: file.type || null, ext: extOf(file.name) || null,
    asset_type: detectAssetType(file.type, file.name), size_bytes: file.size, checksum,
    width:  Number.isFinite(widthRaw)  ? widthRaw  : null,
    height: Number.isFinite(heightRaw) ? heightRaw : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (error || !upd)
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });

  await writeAudit(admin, {
    action: "replace", entityType: "asset", entityId: id,
    actorId: await actorId(request), actorName: form.get("actor") ? String(form.get("actor")) : null,
    metadata: { file_name: file.name, size_bytes: file.size },
  });
  return NextResponse.json({ data: await rowOf(admin, upd as Parameters<typeof rowOf>[1]), error: null });
}
