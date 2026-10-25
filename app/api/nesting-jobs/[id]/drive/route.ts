/**
 * POST /api/nesting-jobs/[id]/drive — เปิด "ช่องอัปโหลด" บน Drive ให้ตัวช่วยในเครื่องส่งไฟล์ตรง (ไฟล์ใหญ่ได้)
 *   body { print_type_code, group?, files: ["sheet_01.pdf", "preview_01.png", …] }   (ชื่อไฟล์ผลลัพธ์ของตัวช่วย)
 *   → หา/สร้างโฟลเดอร์ [แม่งานพิมพ์]/Printed/DTF/[group]/[ชื่องาน] + resumable session ต่อไฟล์
 *   → { folder_url, local_path, uploads: [{ key, filename, upload_url }] }  — nesting.run
 * ไฟล์ชื่อเดียวกันของรอบก่อนยังไม่ลบตรงนี้ — ลบ (ลงถังขยะ Drive) ตอน /publish หลังไฟล์ใหม่ขึ้นครบแล้ว
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveCreateResumableSession } from "@/lib/google-drive";
import { cleanUuid } from "../../shared";
import { driveFileName, printTypeByCode, resolveJobFolder, safeName, sheetCount } from "../../publish-shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.run"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });
  const id = cleanUuid((await params).id);
  if (!id) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: job } = await admin.from("erp_nesting_jobs").select("id, name").eq("id", id).eq("is_active", true).maybeSingle();
  if (!job) return NextResponse.json({ error: "ไม่พบงานนี้ (อาจถูกลบไปแล้ว) — บันทึกงานก่อนส่ง" }, { status: 404 });
  const pt = await printTypeByCode(admin, b.print_type_code);
  if (!pt) return NextResponse.json({ error: "เลือกประเภทงานพิมพ์ (DTF/UV) ก่อน" }, { status: 400 });

  const keys = [...new Set((Array.isArray(b.files) ? b.files : []).map(String))].slice(0, 40);
  const sheets = sheetCount(keys);
  const folderName = safeName(job.name) || "งานพิมพ์";
  const named = keys.map((key) => ({ key, ...driveFileName(folderName, key, sheets) }));
  if (!named.length || named.some((n) => !n.name)) return NextResponse.json({ error: "รายการไฟล์ที่จะส่งไม่ถูกต้อง" }, { status: 400 });

  try {
    const folder = await resolveJobFolder(admin, job.name as string, pt, safeName(b.group, 80));
    const uploads: { key: string; filename: string; upload_url: string }[] = [];
    for (const n of named) uploads.push({ key: n.key, filename: n.name!, upload_url: await driveCreateResumableSession(n.name!, n.mime!, folder.folderId) });
    return NextResponse.json({ data: { folder_url: folder.folderUrl, local_path: folder.localPath, uploads }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
