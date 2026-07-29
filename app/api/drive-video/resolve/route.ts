/**
 * /api/drive-video/resolve — รับลิงก์ Google Drive → ตรวจว่าอ่านได้จริง แล้วคืนข้อมูลไฟล์
 *   POST { link } → { file_id, name, mime_type, size }
 * ใช้ตอนผู้ใช้วางลิงก์วิดีโอ เพื่อกันเคส "แชร์ไฟล์ให้ service account ยังไม่ได้" (จะได้บอกทันที ไม่ใช่พังตอนโพสต์)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { driveFileMeta, parseDriveFileId, driveConfigured } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive ในระบบ" }, { status: 400 });

  let body: { link?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const fileId = parseDriveFileId(body.link ?? "");
  if (!fileId) return NextResponse.json({ error: "อ่านลิงก์ไม่ออก — วางลิงก์แบบ https://drive.google.com/file/d/.../view" }, { status: 400 });

  const meta = await driveFileMeta(fileId);
  if (!meta) return NextResponse.json({ error: "เปิดไฟล์นี้ไม่ได้ — แชร์ไฟล์/โฟลเดอร์ให้บัญชีระบบ (service account) ก่อน แล้วลองใหม่" }, { status: 400 });
  if (meta.mimeType && !meta.mimeType.startsWith("video/"))
    return NextResponse.json({ error: `ไฟล์นี้ไม่ใช่วิดีโอ (${meta.mimeType})` }, { status: 400 });

  return NextResponse.json({ file_id: meta.id, name: meta.name, mime_type: meta.mimeType, size: meta.size ?? null, error: null });
}
