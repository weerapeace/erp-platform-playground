/**
 * /api/assets/[id]/print-file — ช่อง "ไฟล์พิมพ์ (PNG ตัวจริง)" บนการ์ดลายในคลัง
 *   GET  [?drive=1]                    → { file, exists, get_url, jobs, has_folder, drive? }  — assets.view หรือ nesting.view
 *                                         drive = PNG ในโฟลเดอร์ Drive ของการ์ด (+ sha ไว้เทียบว่าเป็นไฟล์เดียวกับในคลังไหม)
 *   POST multipart { file }            → อัปผ่านเว็บ (ไฟล์เล็ก ≤ 4 MB)
 *   POST { action:"open", sha }        → { exists, put_url } ไฟล์ใหญ่: เบราว์เซอร์ส่งตรงเข้า R2
 *   POST { action:"confirm", sha, name } → ตรวจว่าเป็น PNG จริงแล้วผูกกับการ์ด
 *   POST { action:"from_drive", file_id } → เซิร์ฟเวอร์คัดลอก PNG จากโฟลเดอร์ Drive ของการ์ดเข้าคลัง (ไม่ต้องอัปซ้ำ)
 *   เขียน = assets.edit หรือ nesting.run · audit ทุกครั้ง
 * ที่เก็บ = ของกลาง lib/print-store (ไฟล์เดียวกับที่หน้าจัดเรียงใช้) · PNG เท่านั้น — PDF งานพิมพ์อยู่ Drive (lib/print-file-policy)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2PresignGet, r2PresignPut } from "@/lib/r2";
import { SMALL_UPLOAD_BYTES } from "@/lib/media-upload-limits";
import { driveConfigured, driveDownloadFile, driveListFiles, parseDriveFolderId } from "@/lib/google-drive";
import {
  PRINT_SHA, cleanPrintName, linkPrintToAsset, printKey, printSize, storePrintBytes, verifyPrint, type PrintFile,
} from "@/lib/print-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
export type DrivePng = { id: string; name: string; size: number | null; modified: string | null; sha: string | null };
export type AssetPrintInfo = {
  file: PrintFile | null; exists: boolean; get_url: string | null; jobs: number; has_folder: boolean;
  drive?: { configured: boolean; files: DrivePng[] };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** ผ่านด่านถ้ามีสิทธิ์ข้อใดข้อหนึ่ง (คนคลังไฟล์ หรือ คนจัดเรียงงานพิมพ์) */
async function guardAny(request: Request, perms: string[]): Promise<NextResponse | null> {
  let denied: NextResponse | null = null;
  for (const p of perms) { denied = await guardApi(request, p); if (!denied) return null; }
  return denied;
}

function cleanPrint(v: unknown): PrintFile | null {
  const o = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!o || typeof o.sha !== "string" || !PRINT_SHA.test(o.sha)) return null;
  return { sha: o.sha, name: String(o.name ?? ""), size: Number(o.size) || 0, saved_at: String(o.saved_at ?? "") };
}

const isPng = (f: { name: string; mimeType: string }) => f.mimeType === "image/png" || /\.png$/i.test(f.name);

async function loadAsset(id: string) {
  const { data } = await supabaseAdmin().from("assets").select("id, nest_print_file, master_url").eq("id", id).maybeSingle();
  return data as { id: string; nest_print_file: unknown; master_url: string | null } | null;
}

export async function GET(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardAny(request, ["assets.view", "nesting.view"]); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return bad("ไม่พบลายนี้", 404);
  const a = await loadAsset(id);
  if (!a) return bad("ไม่พบลายนี้", 404);
  const file = cleanPrint(a.nest_print_file);
  const folderId = a.master_url ? parseDriveFolderId(a.master_url) : null;
  try {
    const { count } = await supabaseAdmin().from("erp_nesting_jobs").select("id", { count: "exact", head: true })
      .eq("is_active", true).contains("items", JSON.stringify([{ asset_id: id }]));
    const exists = !!file && (await printSize(file.sha)) != null;
    const out: AssetPrintInfo = {
      file, exists, get_url: exists ? await r2PresignGet(printKey(file!.sha), 1800) : null, jobs: count ?? 0, has_folder: !!folderId,
    };
    if (request.nextUrl.searchParams.get("drive")) {
      const configured = driveConfigured();
      const files = configured && folderId ? (await driveListFiles(folderId)).filter(isPng) : [];
      out.drive = {
        configured,
        files: files.map((f) => ({ id: f.id, name: f.name, size: f.size ?? null, modified: f.modifiedTime ?? null, sha: f.sha256 ? f.sha256.slice(0, 16) : null })),
      };
    }
    return NextResponse.json({ data: out, error: null });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "อ่านข้อมูลไม่สำเร็จ", 500);
  }
}

export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardAny(request, ["assets.edit", "nesting.run"]); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return bad("ไม่พบลายนี้", 404);
  const a = await loadAsset(id);
  if (!a) return bad("ไม่พบลายนี้", 404);
  const done = async (f: { sha: string; name: string; size: number }, via: string) => {
    const file = await linkPrintToAsset(request, id, f, via);
    return NextResponse.json({ data: { file }, error: null });
  };

  try {
    // ไฟล์เล็ก: อัปผ่านเว็บ
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const file = (await request.formData()).get("file") as File | null;
      if (!file) return bad("ต้องแนบไฟล์");
      if (file.size > SMALL_UPLOAD_BYTES) return bad("ไฟล์ใหญ่ — ใช้ทางส่งตรงเข้าคลัง");
      const stored = await storePrintBytes(await file.arrayBuffer());
      return await done({ ...stored, name: cleanPrintName(file.name, stored.sha) }, "upload");
    }

    const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const action = String(b?.action ?? "");
    if (action === "open" || action === "confirm") {
      const sha = String(b?.sha ?? "");
      if (!PRINT_SHA.test(sha)) return bad("รหัสไฟล์ไม่ถูกต้อง");
      if (action === "open") {
        if ((await printSize(sha)) != null) return NextResponse.json({ data: { exists: true, put_url: null }, error: null });
        const put_url = await r2PresignPut(printKey(sha), 1800);
        if (!put_url) return bad("ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (R2)", 503);
        return NextResponse.json({ data: { exists: false, put_url }, error: null });
      }
      const v = await verifyPrint(sha);
      if ("error" in v) return bad(v.error, v.status);
      return await done({ sha, name: cleanPrintName(b?.name, sha), size: v.size }, "upload");
    }

    if (action === "from_drive") {
      if (!driveConfigured()) return bad("ยังไม่ได้ตั้งค่า Google Drive", 503);
      const folderId = a.master_url ? parseDriveFolderId(a.master_url) : null;
      if (!folderId) return bad("การ์ดนี้ยังไม่มีโฟลเดอร์ Drive");
      // ยอมเฉพาะไฟล์ PNG ที่อยู่ในโฟลเดอร์ของการ์ดนี้จริง (กันคัดลอกไฟล์อื่นใน Drive)
      const f = (await driveListFiles(folderId)).find((x) => x.id === String(b?.file_id ?? ""));
      if (!f || !isPng(f)) return bad("ไม่พบไฟล์ PNG นี้ในโฟลเดอร์ Drive ของการ์ด");
      const dl = await driveDownloadFile(f.id);
      if (!dl) return bad("โหลดไฟล์จาก Drive ไม่สำเร็จ ลองใหม่อีกครั้ง", 502);
      const stored = await storePrintBytes(dl.bytes.buffer.slice(dl.bytes.byteOffset, dl.bytes.byteOffset + dl.bytes.byteLength) as ArrayBuffer);
      return await done({ ...stored, name: cleanPrintName(f.name, stored.sha) }, "drive");
    }
    return bad("ไม่รู้จักคำสั่งนี้");
  } catch (e) {
    return bad(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", 500);
  }
}
