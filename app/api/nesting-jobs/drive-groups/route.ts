/**
 * GET /api/nesting-jobs/drive-groups?print_type=DTF — ใช้ในหน้าต่าง "ส่งเข้าคลังงานพิมพ์"
 *   → { configured, subpath, folders: ["goodgoods", …] } — โฟลเดอร์ย่อยที่มีอยู่แล้วใต้ [โฟลเดอร์แม่งานพิมพ์]/[ซับของประเภท]
 *   ไม่สร้างอะไร (แค่อ่าน) — nesting.view
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured } from "@/lib/google-drive";
import { listDriveGroupFolders } from "@/lib/artwork-drive";
import { printDriveRoot, printTypeByCode, subpathOf } from "../publish-shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.view"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ data: { configured: false, subpath: "", folders: [] }, error: null });
  const admin = supabaseAdmin();
  const pt = await printTypeByCode(admin, request.nextUrl.searchParams.get("print_type"));
  if (!pt) return NextResponse.json({ data: { configured: true, subpath: "", folders: [] }, error: null });
  try {
    const root = await printDriveRoot(admin);
    const folders = await listDriveGroupFolders(root.folder_id || null, subpathOf(pt));
    return NextResponse.json({ data: { configured: true, subpath: subpathOf(pt), folders }, error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
