/**
 * GET /api/drive/browse?brand=<brandId|"">&folder=<folderId>&q=<คำค้น>
 *   เดินดู "โฟลเดอร์กลาง" ของแบรนด์ (<โฟลเดอร์แบรนด์>/ไฟล์กลาง · สร้างให้ถ้ายังไม่มี) — ใช้กับหน้าต่างเลือกไฟล์ DriveFilePicker
 *   folder ว่าง = ชั้นบนสุด · folder ต้องอยู่ใต้โฟลเดอร์กลางของแบรนด์นั้นเท่านั้น (กันเปิดโฟลเดอร์อื่นในไดรฟ์)
 *   → { root:{id,name}, path:[{id,name}], entries: DriveEntry[], brands:[{id,name}] }
 * สิทธิ์ products.view
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveListEntries } from "@/lib/google-drive";
import { ensureCentralFolder, pathUnderRoot } from "@/lib/product-drive-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้เชื่อม Google Drive (แจ้งผู้ดูแลระบบ)" }, { status: 503 });
  const sp = new URL(request.url).searchParams;
  const brandRaw = (sp.get("brand") ?? "").trim();
  const brandId = /^[0-9a-f-]{36}$/i.test(brandRaw) ? brandRaw : null;
  const folder = (sp.get("folder") ?? "").trim();
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const admin = supabaseAdmin();
  try {
    const [root, brandsRes] = await Promise.all([
      ensureCentralFolder(admin, brandId),
      admin.from("brands").select("id, name").eq("is_active", true).order("name", { ascending: true }),
    ]);
    const current = folder && /^[a-zA-Z0-9_-]+$/.test(folder) ? folder : root.id;
    const path = await pathUnderRoot(current, root.id, root.name);
    if (!path) return NextResponse.json({ error: "โฟลเดอร์นี้ไม่ได้อยู่ในโฟลเดอร์กลาง" }, { status: 403 });
    const entries = await driveListEntries(current, q);
    return NextResponse.json({
      data: { root, path, entries, brands: (brandsRes.data ?? []) as { id: string; name: string }[] },
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: `อ่าน Google Drive ไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}
