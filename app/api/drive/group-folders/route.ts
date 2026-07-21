/**
 * GET /api/drive/group-folders?root=<folderId>&subpath=Printed/DTF
 *   → { folders: ["goodgoods", "brandX", …] } — ชื่อโฟลเดอร์ย่อยที่มีอยู่แล้ว (ไว้ทำ dropdown เลือก/สร้างใหม่)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { driveConfigured } from "@/lib/google-drive";
import { listDriveGroupFolders } from "@/lib/artwork-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ folders: [], error: null });
  const sp = new URL(request.url).searchParams;
  const root = (sp.get("root") ?? "").trim() || null;
  const subpath = (sp.get("subpath") ?? "").trim();
  try {
    return NextResponse.json({ folders: await listDriveGroupFolders(root, subpath), error: null });
  } catch (e) {
    return NextResponse.json({ folders: [], error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
