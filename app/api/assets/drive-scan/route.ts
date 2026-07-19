/**
 * POST /api/assets/drive-scan — สแกนโฟลเดอร์ Drive ของแบรนด์ หา "รูปที่ยังไม่ลงคลัง"
 *   body { brand_id }
 *   โครง Drive: [โฟลเดอร์แบรนด์] > [ซับตามชนิด] > [โฟลเดอร์งาน] > รูป
 *   เทียบรายรูป: รูปในโฟลเดอร์ที่ยังไม่มี asset (แม็ปตาม folder + ชื่อไฟล์/ชื่อบัตร) = ยังไม่ลง
 *   คืนโฟลเดอร์ที่มีรูปใหม่อย่างน้อย 1 รูป (แม้โฟลเดอร์นั้นเชื่อมบางรูปแล้ว)
 *   → { folders: [{folderId, folderName, folderLink, typeSubName, artworkType, master_path, newCount, total}], scanned, newImages }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveListChildFolders, driveListImages, parseDriveFolderId } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const IMG_RE = /^image\/(png|jpe?g|webp|gif)$/i;
const stripExt = (s: string) => s.trim().replace(/\.[^.]+$/, "").toLowerCase();

const winJoin = (base: string, ...rest: string[]) => {
  const b = base.trim().replace(/[\\/]+$/, "");
  const tail = rest.map((p) => p.trim().replace(/^[\\/]+|[\\/]+$/g, "")).filter(Boolean);
  return [b, ...tail].filter(Boolean).join("\\");
};

// รันงาน async หลายอันแบบจำกัดจำนวนพร้อมกัน (กันยิง Drive ถล่ม/ช้าเกิน)
async function mapLimit<T, R>(arr: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const ret = new Array<R>(arr.length);
  let i = 0;
  const worker = async () => { while (i < arr.length) { const idx = i++; ret[idx] = await fn(arr[idx], idx); } };
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, worker));
  return ret;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });

  let body: { brand_id?: string }; try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = String(body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "เลือกแบรนด์ก่อน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: bf } = await admin.from("erp_brand_drive_folders").select("folder_id, local_base_path").eq("brand_id", brandId).maybeSingle();
  const baseFolderId = String(bf?.folder_id ?? "").trim();
  const localBase = String(bf?.local_base_path ?? "").trim();
  if (!baseFolderId) return NextResponse.json({ error: "แบรนด์นี้ยังไม่ได้ตั้ง Drive folder id (ตั้งในหน้าตั้งค่าก่อน)" }, { status: 400 });

  // ชื่อซับ → ชนิด (reverse map)
  const { data: tf } = await admin.from("erp_artwork_drive_folders").select("artwork_type, subfolder_name");
  const subToType = new Map<string, string>();
  for (const r of (tf ?? []) as { artwork_type: string; subfolder_name: string | null }[]) if (r.subfolder_name) subToType.set(r.subfolder_name.trim(), r.artwork_type);

  // รูปที่ลงคลังแล้ว → แม็ปตาม folder id: ชุดชื่อ (ตัดนามสกุล) ของ file_name + title (ไว้เทียบว่ารูปไหนลงแล้ว)
  const { data: linked } = await admin.from("assets").select("master_url, file_name, title").eq("status", "active").like("master_url", "%/folders/%");
  const importedByFolder = new Map<string, Set<string>>();
  for (const a of (linked ?? []) as { master_url: string | null; file_name: string | null; title: string | null }[]) {
    const id = parseDriveFolderId(a.master_url ?? ""); if (!id) continue;
    let set = importedByFolder.get(id); if (!set) { set = new Set(); importedByFolder.set(id, set); }
    if (a.file_name) set.add(stripExt(a.file_name));
    if (a.title) set.add(stripExt(a.title));
  }

  try {
    const typeSubs = await driveListChildFolders(baseFolderId);   // ชั้นซับตามชนิด
    // รวมโฟลเดอร์งานทั้งหมดก่อน แล้วค่อยไล่ list รูปแบบขนาน
    const workList: { w: { id: string; name: string }; subName: string; artworkType: string }[] = [];
    for (const sub of typeSubs) {
      const artworkType = subToType.get(sub.name.trim()) || sub.name.trim();
      const works = await driveListChildFolders(sub.id);
      for (const w of works) workList.push({ w, subName: sub.name, artworkType });
    }

    // list รูปในแต่ละโฟลเดอร์งาน (ขนาน ≤8) → นับรูปที่ยังไม่ลง
    const counts = await mapLimit(workList, 8, async ({ w }) => {
      const imgs = (await driveListImages(w.id)).filter((x) => IMG_RE.test(x.mimeType));
      const impSet = importedByFolder.get(w.id) ?? null;
      const newCount = impSet ? imgs.filter((img) => !impSet.has(stripExt(img.name))).length : imgs.length;
      return { total: imgs.length, newCount };
    });

    const folders: { folderId: string; folderName: string; folderLink: string; typeSubName: string; artworkType: string; master_path: string; newCount: number; total: number }[] = [];
    let newImages = 0;
    workList.forEach(({ w, subName, artworkType }, idx) => {
      const c = counts[idx];
      if (c.newCount <= 0) return;   // ไม่มีรูปใหม่ → ข้าม
      newImages += c.newCount;
      folders.push({
        folderId: w.id, folderName: w.name,
        folderLink: `https://drive.google.com/drive/folders/${w.id}`,
        typeSubName: subName, artworkType,
        master_path: localBase ? winJoin(localBase, subName, w.name) : "",
        newCount: c.newCount, total: c.total,
      });
    });
    return NextResponse.json({ folders, scanned: workList.length, newImages, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
