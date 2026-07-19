/**
 * POST /api/drive/folder-images — ดึงรายการไฟล์รูปในโฟลเดอร์ Drive ที่เลือก (ไว้สร้างแถวฟอร์มนำเข้า)
 *   body { folder_ids: string[] }
 *   → { images: { [folderId]: [{id, name}] } } (เฉพาะ png/jpg/webp/gif)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { driveConfigured, driveListImages } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const IMG_RE = /^image\/(png|jpe?g|webp|gif)$/i;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });

  let body: { folder_ids?: string[] }; try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = [...new Set((Array.isArray(body.folder_ids) ? body.folder_ids : []).map(String).filter(Boolean))].slice(0, 50);
  if (!ids.length) return NextResponse.json({ error: "ไม่มีรายการ" }, { status: 400 });

  const images: Record<string, { id: string; name: string }[]> = {};
  for (const fid of ids) {
    try { images[fid] = (await driveListImages(fid)).filter((x) => IMG_RE.test(x.mimeType)).map((x) => ({ id: x.id, name: x.name })); }
    catch { images[fid] = []; }
  }
  return NextResponse.json({ images, error: null });
}
