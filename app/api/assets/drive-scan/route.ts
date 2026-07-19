/**
 * POST /api/assets/drive-scan — สแกนโฟลเดอร์ Drive ของแบรนด์ หาโฟลเดอร์งานที่ "ยังไม่มีบัตรในคลัง"
 *   body { brand_id }
 *   โครง Drive: [โฟลเดอร์แบรนด์] > [ซับตามชนิด] > [โฟลเดอร์งาน] · โฟลเดอร์งานไหนไม่มี asset ผูก master_url = ยังไม่เชื่อม
 *   → { folders: [{folderId, folderName, folderLink, typeSubName, artworkType, master_path}], scanned }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveListChildFolders, parseDriveFolderId } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const winJoin = (base: string, ...rest: string[]) => {
  const b = base.trim().replace(/[\\/]+$/, "");
  const tail = rest.map((p) => p.trim().replace(/^[\\/]+|[\\/]+$/g, "")).filter(Boolean);
  return [b, ...tail].filter(Boolean).join("\\");
};

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

  // โฟลเดอร์ที่เชื่อมแล้ว (folder id จาก master_url ของ asset ที่ยังใช้งาน — ลบ(trashed)ไม่นับ ให้โผล่มาเชื่อมใหม่ได้)
  const { data: linked } = await admin.from("assets").select("master_url").eq("status", "active").like("master_url", "%/folders/%");
  const linkedSet = new Set<string>();
  for (const a of (linked ?? []) as { master_url: string | null }[]) { const id = parseDriveFolderId(a.master_url ?? ""); if (id) linkedSet.add(id); }

  try {
    const typeSubs = await driveListChildFolders(baseFolderId);   // ชั้นซับตามชนิด
    const folders: { folderId: string; folderName: string; folderLink: string; typeSubName: string; artworkType: string; master_path: string }[] = [];
    let scanned = 0;
    for (const sub of typeSubs) {
      const artworkType = subToType.get(sub.name.trim()) || sub.name.trim();   // แม็ปกลับ · ไม่เจอ = ใช้ชื่อซับเป็นชนิด
      const works = await driveListChildFolders(sub.id);   // โฟลเดอร์งานในซับ
      for (const w of works) {
        scanned++;
        if (linkedSet.has(w.id)) continue;   // เชื่อมแล้ว → ข้าม
        folders.push({
          folderId: w.id, folderName: w.name,
          folderLink: `https://drive.google.com/drive/folders/${w.id}`,
          typeSubName: sub.name, artworkType,
          master_path: localBase ? winJoin(localBase, sub.name, w.name) : "",
        });
      }
    }
    return NextResponse.json({ folders, scanned, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
