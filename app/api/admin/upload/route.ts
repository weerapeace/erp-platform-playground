/**
 * Image upload — Sprint 6
 *
 * POST /api/admin/upload
 *   FormData: file (image), folder (e.g., "parent-skus")
 *   → upload to R2 + return { r2_key, content_type, size }
 *
 * ใช้กับ ImageInput component ใน MasterCRUDPage form
 */

import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2PutObject, r2DeleteObject } from "@/lib/r2";
import { writeAudit } from "@/lib/audit";
import { detectAssetType, extOf, sha256Hex } from "@/lib/assets";
import { attachTags } from "@/app/api/assets/shared";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const MAX_SIZE = 10 * 1024 * 1024;  // 10 MB (รองรับ PDF บิล/ใบรับ)
const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;

// แท็กในคลังกลางตาม "ที่มา" (folder) — ใส่ชื่ออ่านง่าย ไม่งั้นใช้ชื่อ folder ตรง ๆ
const LIBRARY_FOLDER_LABEL: Record<string, string> = {
  "parent-skus": "สินค้า (Parent)", "skus": "สินค้า (SKU)",
  "app-icons": "ไอคอนแอป", "section-icons": "ไอคอนหมวด", "overview-theme": "ธีมภาพรวม",
  "design-sheets": "งานออกแบบ", "uploads": "อัปทั่วไป",
};

// ลงทะเบียนไฟล์ที่เพิ่งอัปเข้าคลังกลาง (assets) อัตโนมัติ — กันซ้ำด้วย checksum · ห้าม throw (best-effort)
async function registerToLibrary(p: { buffer: ArrayBuffer; key: string; file: File; folder: string; uploadedBy: string | null }): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const checksum = await sha256Hex(p.buffer);
    const tag = LIBRARY_FOLDER_LABEL[p.folder] ?? p.folder;
    // ไฟล์เดิม (เนื้อหาเดียวกัน) อยู่ในคลังแล้ว → ไม่ลงซ้ำ แค่เพิ่มแท็กที่มา
    const { data: dup } = await admin.from("assets").select("id").eq("checksum", checksum).eq("status", "active").limit(1).maybeSingle();
    if (dup?.id) { if (tag) await attachTags(admin, dup.id as string, [tag]); return; }
    const { data: ins } = await admin.from("assets").insert({
      title: p.file.name, file_name: p.file.name, r2_key: p.key,
      asset_type: detectAssetType(p.file.type, p.file.name),
      content_type: p.file.type || null, ext: extOf(p.file.name) || null, size_bytes: p.file.size,
      checksum, status: "active", source: "upload", uploaded_by: p.uploadedBy,
    }).select("id").maybeSingle();
    if (ins?.id && tag) await attachTags(admin, ins.id as string, [tag]);
  } catch { /* คลังมีปัญหา ไม่ให้กระทบการอัปโหลด */ }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.upload");
  if (denied) return denied;

  // auth check
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "ต้องแนบไฟล์" }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: `ประเภทไฟล์ไม่รองรับ: ${file.type}` }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน 5MB (${(file.size / 1024 / 1024).toFixed(1)}MB)` }, { status: 400 });
  }

  const folder = (formData.get("folder") as string ?? "uploads").replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  // unique key — folder/user_id/timestamp.ext (no random — deterministic OK for now)
  const key = `${folder}/${user.id}/${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`;
  const buffer = await file.arrayBuffer();

  try {
    // F21: R2 binding ล้วน (ไม่มี AWS SDK)
    await r2PutObject(key, buffer, file.type);
    // ของกลาง: ทุกรูปที่อัปผ่านตัวนี้ → ลงคลังกลาง /master/assets อัตโนมัติ (กันซ้ำ · best-effort)
    await registerToLibrary({ buffer, key, file, folder, uploadedBy: user.email ?? user.id });
    await writeAudit(supabaseAdmin(), {
      action: "upload",
      entityType: "file",
      entityId: null,
      actorId: user.id,
      actorName: user.email ?? null,
      metadata: { r2_key: key, content_type: file.type, size: file.size },
    });
    return NextResponse.json({
      r2_key:       key,
      content_type: file.type,
      size:         file.size,
      error:        null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `upload failed: ${(e as Error).message ?? e}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/upload?key=<r2_key>
 *   ลบไฟล์ออกจาก R2 จริง + บันทึก audit
 *   ใช้ตอนลบรูปออกจากกระดาน Canvas (และโมดูลอื่นที่ต้องลบไฟล์)
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.delete");
  if (denied) return denied;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key || !SAFE_KEY.test(key)) return NextResponse.json({ error: "invalid key" }, { status: 400 });

  try {
    await r2DeleteObject(key);
    await writeAudit(supabaseAdmin(), {
      action: "delete", entityType: "file", entityId: null,
      actorId: user.id, actorName: user.email ?? null, metadata: { r2_key: key },
    });
    return NextResponse.json({ ok: true, error: null });
  } catch (e) {
    return NextResponse.json({ error: `delete failed: ${(e as Error).message ?? e}` }, { status: 500 });
  }
}
