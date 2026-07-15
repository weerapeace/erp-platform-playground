/**
 * POST /api/drive/upload (multipart) — อัปไฟล์ต้นฉบับขึ้น Drive "ผ่านแอป" (เลี่ยง CORS ของ browser→Google)
 *   fields: name (ชื่องาน/โฟลเดอร์), artworkType?, folderId? (มีแล้วไม่ต้องสร้างซ้ำ), filename?, file?
 *   → ensure โฟลเดอร์ (ชื่อ=name ใต้โฟลเดอร์แม็ปตามชนิด/ฐาน) + อัปไฟล์ (ถ้ามี) → { folderId, folderLink }
 *   ⚠️ จำกัดขนาด ~4MB/ไฟล์ (ลิมิต body ของ Vercel) — ไฟล์ใหญ่กว่านี้อัปเองในโฟลเดอร์
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveEnsureFolder, driveGetFolder, driveUploadFile, DRIVE_ROOT_FOLDER_ID } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "ต้องเป็น multipart/form-data" }, { status: 400 }); }
  const name = String(form.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องมีชื่องาน" }, { status: 400 });

  try {
    let folderId = String(form.get("folderId") ?? "").trim();
    if (!folderId) {
      const admin = supabaseAdmin();
      // 1) โฟลเดอร์ฐานของแบรนด์ (ไม่มีแม็ป = โฟลเดอร์แม่)
      let brandFolder = DRIVE_ROOT_FOLDER_ID;
      const brandId = String(form.get("brand_id") ?? "").trim();
      if (brandId) { const { data } = await admin.from("erp_brand_drive_folders").select("folder_id").eq("brand_id", brandId).maybeSingle(); if (data?.folder_id) brandFolder = String(data.folder_id); }
      // 2) ซับโฟลเดอร์ตามชนิด (แม็ปชื่อซับ เช่น โลโก้→"01_Logo" · ไม่มี = ใช้ชื่อชนิด)
      let parent = brandFolder;
      const artType = String(form.get("artworkType") ?? "").trim();
      if (artType) {
        const { data } = await admin.from("erp_artwork_drive_folders").select("subfolder_name").eq("artwork_type", artType).maybeSingle();
        const subName = (data?.subfolder_name || artType).trim();
        if (subName) parent = await driveEnsureFolder(subName, brandFolder);
      }
      // 3) โฟลเดอร์ตามชื่องาน
      folderId = await driveEnsureFolder(name, parent);
    }
    const file = form.get("file") as File | null;
    if (file) {
      const filename = String(form.get("filename") ?? "") || file.name;
      await driveUploadFile(filename, file.type || "application/octet-stream", await file.arrayBuffer(), folderId);
    }
    const info = await driveGetFolder(folderId);
    return NextResponse.json({ folderId, folderLink: info?.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
