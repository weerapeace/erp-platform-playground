/**
 * 📚 ลงทะเบียนไฟล์ที่อัปตรงเข้า R2 แล้ว (ทางไฟล์ใหญ่ของ lib/media-upload) เข้าคลังกลาง — POST /api/assets/register
 *
 *   { key, name, type } → { data: AssetRow, duplicate }
 *   - ตรวจว่าไฟล์อยู่ใน R2 จริง (อ่านขนาดจาก R2 — ไม่เชื่อขนาดที่ส่งมา)
 *   - key ต้องอยู่ในโฟลเดอร์ทางไฟล์ใหญ่ (BIG_UPLOAD_FOLDERS) — กันลงทะเบียนไฟล์อื่นใน bucket
 *   - r2_key นี้อยู่ในคลังแล้ว = คืนตัวเดิม (duplicate: true)
 *   - ติดแท็กตามที่มา (folder) ให้อัตโนมัติ · ไฟล์ทางเล็ก (≤ 4 MB) ลงคลังเองที่ /api/admin/upload อยู่แล้ว
 *
 * ของกลาง: guardApi(files.upload) · writeAudit · lib/r2 (r2HeadSize) · app/api/assets/shared
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { r2HeadSize } from "@/lib/r2";
import { detectAssetType, extOf } from "@/lib/assets";
import { BIG_UPLOAD_FOLDERS } from "@/lib/media-upload-limits";
import { LIBRARY_FOLDER_LABEL, attachTags, rowOf, type AssetDbRow } from "@/app/api/assets/shared";

export const dynamic = "force-dynamic";

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.upload");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { key?: unknown; name?: unknown; type?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const key = String(body.key ?? "");
  const folder = key.split("/")[0] ?? "";
  if (!SAFE_KEY.test(key) || !BIG_UPLOAD_FOLDERS.includes(folder)) return NextResponse.json({ error: "ไฟล์นี้ลงคลังทางนี้ไม่ได้" }, { status: 400 });
  const name = String(body.name ?? "").trim().slice(0, 200) || key.split("/").pop() || key;
  const type = String(body.type ?? "").slice(0, 80);

  const admin = supabaseAdmin();
  const { data: ex } = await admin.from("assets").select("*").eq("r2_key", key).eq("status", "active").limit(1).maybeSingle();
  if (ex) return NextResponse.json({ data: await rowOf(admin, ex as AssetDbRow), duplicate: true });

  const size = await r2HeadSize(key);
  if (size == null) return NextResponse.json({ error: "ไม่พบไฟล์ในที่เก็บไฟล์ (อาจอัปไม่สำเร็จ)" }, { status: 404 });

  const { data: ins, error } = await admin
    .from("assets")
    .insert({
      title: name,
      file_name: name,
      r2_key: key,
      asset_type: detectAssetType(type, name),
      content_type: type || null,
      ext: extOf(name) || extOf(key) || null,
      size_bytes: size,
      checksum: null,
      status: "active",
      source: "upload",
      uploaded_by: user?.email ?? user?.id ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error || !ins) return NextResponse.json({ error: `ลงคลังไม่สำเร็จ: ${error?.message ?? "unknown"}` }, { status: 500 });

  const tag = LIBRARY_FOLDER_LABEL[folder] ?? folder;
  if (tag) await attachTags(admin, ins.id as string, [tag]);
  await writeAudit(admin, {
    action: "create",
    entityType: "asset",
    entityId: ins.id as string,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { r2_key: key, size, type, via: "register-big-upload" },
  });
  return NextResponse.json({ data: await rowOf(admin, ins as AssetDbRow), duplicate: false });
}
