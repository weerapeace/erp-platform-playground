/**
 * GET /api/drive/folder-files?folder=<folderId หรือ ลิงก์โฟลเดอร์> — ไฟล์ทั้งหมดในโฟลเดอร์ Drive
 *   ไว้โชว์ว่า "ในโฟลเดอร์ต้นฉบับมีไฟล์อะไรบ้าง" + ลิงก์เปิดไฟล์ใน Google Drive
 *   → { files: [{id, name, mimeType, size, webViewLink, modifiedTime}] }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { driveConfigured, driveListFiles, parseDriveFolderId } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ files: [], error: null });   // ไม่ได้ตั้ง Drive = เงียบ ๆ ไม่ต้องโชว์ error

  const raw = (new URL(request.url).searchParams.get("folder") ?? "").trim();
  // รับได้ทั้ง folder id ตรง ๆ และลิงก์เต็ม
  const id = /^[a-zA-Z0-9_-]+$/.test(raw) ? raw : parseDriveFolderId(raw);
  if (!id) return NextResponse.json({ files: [], error: null });

  try {
    return NextResponse.json({ files: await driveListFiles(id), error: null });
  } catch (e) {
    return NextResponse.json({ files: [], error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
