/**
 * POST /api/drive/folder-images — ดึงรายการไฟล์รูปในโฟลเดอร์ Drive ที่เลือก (ไว้สร้างแถวฟอร์มนำเข้า)
 *   body { folder_ids: string[], only_new?: boolean }
 *   only_new=true → ตัดรูปที่ลงคลังแล้วออก (เทียบตาม folder + ชื่อไฟล์/ชื่อบัตร) เหลือเฉพาะรูปใหม่
 *   → { images: { [folderId]: [{id, name, width?, height?}] } } (เฉพาะ png/jpg/webp/gif)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveListImages, parseDriveFolderId } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const IMG_RE = /^image\/(png|jpe?g|webp|gif)$/i;
const stripExt = (s: string) => s.trim().replace(/\.[^.]+$/, "").toLowerCase();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });

  let body: { folder_ids?: string[]; only_new?: boolean }; try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = [...new Set((Array.isArray(body.folder_ids) ? body.folder_ids : []).map(String).filter(Boolean))].slice(0, 50);
  if (!ids.length) return NextResponse.json({ error: "ไม่มีรายการ" }, { status: 400 });
  const onlyNew = body.only_new !== false;   // ค่าเริ่มต้น = เอาเฉพาะรูปใหม่

  // รูปที่ลงคลังแล้วในโฟลเดอร์เหล่านี้ → ชุดชื่อ (ตัดนามสกุล) ต่อ folder
  const importedByFolder = new Map<string, Set<string>>();
  if (onlyNew) {
    const admin = supabaseAdmin();
    const { data: linked } = await admin.from("assets").select("master_url, file_name, title").eq("status", "active").like("master_url", "%/folders/%");
    const want = new Set(ids);
    for (const a of (linked ?? []) as { master_url: string | null; file_name: string | null; title: string | null }[]) {
      const fid = parseDriveFolderId(a.master_url ?? ""); if (!fid || !want.has(fid)) continue;
      let set = importedByFolder.get(fid); if (!set) { set = new Set(); importedByFolder.set(fid, set); }
      if (a.file_name) set.add(stripExt(a.file_name));
      if (a.title) set.add(stripExt(a.title));
    }
  }

  const images: Record<string, { id: string; name: string; width?: number; height?: number }[]> = {};
  for (const fid of ids) {
    try {
      const impSet = importedByFolder.get(fid) ?? null;
      images[fid] = (await driveListImages(fid))
        .filter((x) => IMG_RE.test(x.mimeType))
        .filter((x) => !(onlyNew && impSet && impSet.has(stripExt(x.name))))
        .map((x) => ({ id: x.id, name: x.name, width: x.width, height: x.height }));
    } catch { images[fid] = []; }
  }
  return NextResponse.json({ images, error: null });
}
