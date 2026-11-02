/**
 * /api/drive-video/resolve — รับลิงก์ Google Drive → ตรวจว่าอ่านได้จริง แล้วคืนข้อมูลไฟล์
 *   POST { link, accept?: "video" | "image" }   (ไม่ส่ง accept = วิดีโอ เหมือนเดิม)
 *     ลิงก์ไฟล์       → { file_id, name, mime_type, size }
 *     ลิงก์โฟลเดอร์ (accept=image) → { folder: { id, name }, files: [{ file_id, name, mime_type, size }] }  (รูปในโฟลเดอร์ ≤100 ไว้ให้ติ๊กเลือก)
 * ใช้ตอนผู้ใช้วางลิงก์วิดีโอ/รูป เพื่อกันเคส "แชร์ไฟล์ให้ service account ยังไม่ได้" (จะได้บอกทันที ไม่ใช่พังตอนโพสต์)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { driveFileMeta, parseDriveFileId, parseDriveFolderId, driveGetFolder, driveListFiles, driveConfigured } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NOT_SHARED = "เปิดไม่ได้ — แชร์ไฟล์/โฟลเดอร์ให้บัญชีระบบ (service account) ก่อน แล้วลองใหม่";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive ในระบบ" }, { status: 400 });

  let body: { link?: string; accept?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const accept = body.accept === "image" ? "image" : "video";
  const kindTh = accept === "image" ? "รูป" : "วิดีโอ";

  // โฟลเดอร์ (เฉพาะรูป) → รายการรูปให้เลือก
  const folderId = accept === "image" ? parseDriveFolderId(body.link ?? "") : null;
  if (folderId) {
    const folder = await driveGetFolder(folderId);
    if (!folder) return NextResponse.json({ error: NOT_SHARED }, { status: 400 });
    const files = (await driveListFiles(folderId)).filter((f) => f.mimeType.startsWith("image/"));
    if (!files.length) return NextResponse.json({ error: "โฟลเดอร์นี้ไม่มีไฟล์รูป" }, { status: 400 });
    return NextResponse.json({ folder: { id: folder.id, name: folder.name }, files: files.map((f) => ({ file_id: f.id, name: f.name, mime_type: f.mimeType, size: f.size ?? null })), error: null });
  }

  const fileId = parseDriveFileId(body.link ?? "");
  if (!fileId) return NextResponse.json({ error: `อ่านลิงก์ไม่ออก — วางลิงก์แบบ https://drive.google.com/file/d/.../view${accept === "image" ? " หรือลิงก์โฟลเดอร์" : ""}` }, { status: 400 });

  const meta = await driveFileMeta(fileId);
  if (!meta) return NextResponse.json({ error: NOT_SHARED }, { status: 400 });
  if (meta.mimeType && !meta.mimeType.startsWith(`${accept}/`))
    return NextResponse.json({ error: `ไฟล์นี้ไม่ใช่${kindTh} (${meta.mimeType})` }, { status: 400 });

  return NextResponse.json({ file_id: meta.id, name: meta.name, mime_type: meta.mimeType, size: meta.size ?? null, error: null });
}
