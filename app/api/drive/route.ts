/**
 * GET  /api/drive           → { configured } (ตั้งค่า Google Drive ครบไหม)
 * POST /api/drive (prepare)  เตรียมอัปไฟล์ใหญ่ขึ้น Drive "ส่งตรงจากเครื่อง" (ใช้กับตัวแยกไฟล์ ERP · docs/file-sorter.md)
 *   body { name, brand_id?, artworkType?, files:[{ filename, mime, size?, sha256?, dir? }] }  (ไม่เกิน 100 ไฟล์ต่อครั้ง)
 *   → โฟลเดอร์ตามโครงกลาง [แบรนด์] › [ซับตามชนิด] › [ชื่องาน] (lib/artwork-drive · มีอยู่แล้ว = ใช้เดิม)
 *     dir = โฟลเดอร์ย่อยในงาน (เช่น "export") สร้างตามให้
 *   → { folderId, folderLink, uploads:[{ filename, dir, uploadUrl? , exists?, file_id? }] }
 *     exists = มีไฟล์ชื่อนี้ เนื้อเดียวกันอยู่แล้ว (ขนาด/sha256 ตรง) → ไม่ต้องอัปซ้ำ (กดซ้ำได้)
 *     ชื่อซ้ำแต่เนื้อต่าง → ตั้งชื่อใหม่ต่อท้าย _2, _3 … (ไม่ทับของเดิม) · filename ที่คืน = ชื่อจริงบน Drive
 *   โปรแกรมเอา uploadUrl ไป PUT ตรงเข้า Google (ไม่ติด CORS/ลิมิต 4MB เพราะไม่ใช่เบราว์เซอร์)
 *   เบราว์เซอร์ใช้ไม่ได้ (CORS) → ฝั่งเว็บส่งทีละชิ้นผ่าน /api/drive/upload-chunk แทน
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveGetFolder, driveCreateResumableSession, driveListFiles } from "@/lib/google-drive";
import { resolveArtworkDriveFolder, ensureSubPath } from "@/lib/artwork-drive";
import { safeFolderName } from "@/lib/file-sort";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_FILES = 100;

type FileIn = { filename?: string; mime?: string; size?: number; sha256?: string; dir?: string };

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ configured: driveConfigured() });
}

/** ชื่อว่างถัดไป: logo.psd → logo_2.psd → logo_3.psd */
function nextFreeName(name: string, taken: Set<string>): string {
  const m = name.match(/^(.*?)(\.[^.]+)?$/);
  const stem = m?.[1] || name, ext = m?.[2] ?? "";
  for (let i = 2; i < 1000; i++) { const n = `${stem}_${i}${ext}`; if (!taken.has(n.toLowerCase())) return n; }
  return `${stem}_${Date.now()}${ext}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive (env)" }, { status: 503 });

  let body: { name?: string; brand_id?: string; artworkType?: string; files?: FileIn[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = safeFolderName(body.name ?? "");
  const files = (Array.isArray(body.files) ? body.files : []).filter((f) => f && String(f.filename ?? "").trim());
  if (!String(body.name ?? "").trim() || !files.length) return NextResponse.json({ error: "ต้องมีชื่องาน + ไฟล์อย่างน้อย 1" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `ส่งได้ครั้งละไม่เกิน ${MAX_FILES} ไฟล์ — แบ่งส่งหลายครั้ง` }, { status: 400 });

  try {
    const folderId = await resolveArtworkDriveFolder(supabaseAdmin(), {
      brandId: String(body.brand_id ?? "").trim() || null,
      artworkType: String(body.artworkType ?? "").trim() || null,
      name,
    });
    const info = await driveGetFolder(folderId);
    const folderLink = info?.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;

    const dirIds = new Map<string, string>([["", folderId]]);
    const listing = new Map<string, Awaited<ReturnType<typeof driveListFiles>>>();
    const reserved = new Map<string, Set<string>>();   // ชื่อที่จองไปแล้วในรอบนี้ (กันสองไฟล์ได้ชื่อเดียวกัน)
    const uploads: { filename: string; dir: string; uploadUrl?: string; exists?: boolean; file_id?: string }[] = [];

    for (const f of files) {
      const dir = String(f.dir ?? "").replace(/\\/g, "/").split("/").map((s) => s.trim()).filter((s) => s && s !== "." && s !== "..").map(safeFolderName).join("/");
      if (!dirIds.has(dir)) dirIds.set(dir, await ensureSubPath(folderId, dir));
      const target = dirIds.get(dir)!;
      if (!listing.has(target)) listing.set(target, await driveListFiles(target));
      const existing = listing.get(target)!;
      const taken = reserved.get(target) ?? new Set(existing.map((x) => x.name.toLowerCase()));
      reserved.set(target, taken);

      const filename = String(f.filename).trim().replace(/[\\/]/g, "-");
      const size = typeof f.size === "number" ? f.size : null;
      const sha = String(f.sha256 ?? "").trim().toLowerCase();
      // เนื้อเดียวกัน = sha256 ตรง (ถ้ามีทั้งคู่) · ไม่งั้นขนาดตรง · ไม่รู้ขนาด = ถือว่าชื่อเดียวกันคือไฟล์เดิม
      const exact = (x: { name: string }) => x.name.toLowerCase() === filename.toLowerCase();
      const contentEq = (x: { name: string; size?: number; sha256?: string }) =>
        sha && x.sha256 ? x.sha256.toLowerCase() === sha : size === null ? exact(x) : x.size === size;
      const m = filename.match(/^(.*?)(\.[^.]+)?$/);
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const variant = new RegExp(`^${esc(m?.[1] || filename)}(_\\d+)?${esc(m?.[2] ?? "")}$`, "i");   // logo.psd หรือ logo_2.psd ที่เคยตั้งชื่อใหม่
      const same = existing.find((x) => (exact(x) || (size !== null || sha ? variant.test(x.name) : false)) && contentEq(x));
      if (same) { uploads.push({ filename: same.name, dir, exists: true, file_id: same.id }); continue; }

      const finalName = taken.has(filename.toLowerCase()) ? nextFreeName(filename, taken) : filename;
      taken.add(finalName.toLowerCase());
      uploads.push({ filename: finalName, dir, uploadUrl: await driveCreateResumableSession(finalName, String(f.mime ?? "").trim() || "application/octet-stream", target) });
    }

    return NextResponse.json({ folderId, folderLink, uploads, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
