/**
 * 🗂️ วางแผนแยกไฟล์ 1 งาน (ตัวแยกไฟล์ ERP) — POST /api/file-sort/plan   (สิทธิ์ assets.upload)
 *
 * body { profile?, brand_id, artwork_type?, name, job_folder?, files:[{ path, size? }] }  (ไม่เกิน 2000 ไฟล์)
 * →   { job_name, brand, artwork_type, nas_folder, drive_path, preview, files, counts, warnings, existing }
 *     job_name   = ชื่องานที่ Windows/Drive รับได้ (ใช้ชื่อนี้ทั้ง Z: และ Drive)
 *     nas_folder = โฟลเดอร์งานบน Z: (null = ส่งลง Z: ไม่ได้ ดู warnings)
 *     files[]    = ไฟล์ละ { rel, dir, preview, drive, nas, skip } ตามสูตร (lib/file-sort planFileSort)
 *     existing   = การ์ด Artwork ของงานนี้ที่มีอยู่แล้ว (โฟลเดอร์ Drive เดียวกัน หรือ path Z: เดียวกัน) → โปรแกรมแก้การ์ดเดิม ไม่สร้างซ้ำ
 * ไม่สร้าง/ไม่แก้อะไร — แค่คิดให้ (กฎอยู่ที่เดียว โปรแกรมบนเครื่องไม่ต้องคิดเอง)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured } from "@/lib/google-drive";
import { findArtworkDriveFolder } from "@/lib/artwork-drive";
import { findProfile, nasFolderFor, planFileSort, safeFolderName, type FileSortInput } from "@/lib/file-sort";
import { artworkTypeFolderName, brandFolderName, loadFileSortConfig } from "@/lib/file-sort-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_FILES = 2000;
const normPath = (s: string | null | undefined) => String(s ?? "").replace(/\//g, "\\").replace(/\\+$/, "").trim().toLowerCase();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  let b: { profile?: string; brand_id?: string; artwork_type?: string; name?: string; job_folder?: string; files?: FileSortInput[] };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const brandId = String(b.brand_id ?? "").trim();
  const rawName = String(b.name ?? "").trim();
  const files = Array.isArray(b.files) ? b.files.filter((f) => f && typeof f.path === "string") : [];
  if (!rawName) return NextResponse.json({ error: "ใส่ชื่องานก่อน" }, { status: 400 });
  if (!brandId) return NextResponse.json({ error: "เลือกแบรนด์ก่อน" }, { status: 400 });
  if (!files.length) return NextResponse.json({ error: "โฟลเดอร์นี้ไม่มีไฟล์" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `โฟลเดอร์ใหญ่เกินไป (เกิน ${MAX_FILES} ไฟล์) — แบ่งเป็นหลายงาน` }, { status: 400 });

  const admin = supabaseAdmin();
  const artworkType = String(b.artwork_type ?? "").trim();
  const [cfg, brand, typeFolder] = await Promise.all([loadFileSortConfig(admin), brandFolderName(admin, brandId), artworkTypeFolderName(admin, artworkType)]);
  if (!brand.name) return NextResponse.json({ error: "ไม่พบแบรนด์นี้ในระบบ" }, { status: 400 });

  const profile = findProfile(cfg, b.profile);
  const jobName = safeFolderName(rawName);
  const plan = planFileSort(profile, files, { jobFolder: b.job_folder });
  const nasFolder = nasFolderFor(profile, brand.folder, typeFolder, jobName);
  const warnings = [...plan.warnings];
  if (!brand.folder && plan.counts.nas) warnings.push(`แบรนด์ "${brand.name}" ยังไม่ได้ตั้งโฟลเดอร์ (ตั้งที่ ⚙️ โฟลเดอร์มาตรฐาน ในคลังไฟล์) — ส่งลง Z: ไม่ได้`);
  const driveOn = driveConfigured();
  if (!driveOn && plan.counts.drive) warnings.push("ระบบยังไม่ได้ต่อ Google Drive — ไฟล์จะไม่ขึ้น Drive");

  // การ์ดเดิมของงานนี้: โฟลเดอร์ Drive เดียวกัน (หาอย่างเดียว ไม่สร้าง) หรือ path Z: เดียวกัน
  let existing: { id: string; title: string; master_path: string | null; master_url: string | null } | null = null;
  try {
    const folderId = driveOn ? await findArtworkDriveFolder(admin, { brandId, artworkType, name: jobName }) : null;
    const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
    const base = () => admin.from("assets").select("id, title, master_path, master_url").eq("source", "artwork").eq("status", "active").limit(50);
    // แยก 2 คำขอ (ไม่ใช้ .or) — ชื่องานมีจุลภาค/วงเล็บได้ จะทำให้ตัวกรอง or พัง
    const [byFolder, byTitle] = await Promise.all([
      folderId ? base().like("master_url", `%/folders/${folderId}%`) : Promise.resolve({ data: [] }),
      base().ilike("title", esc(jobName)),
    ]);
    const rows = [...(byFolder.data ?? []), ...(byTitle.data ?? [])] as { id: string; title: string; master_path: string | null; master_url: string | null }[];
    existing = rows.find((r) => folderId && (r.master_url ?? "").includes(`/folders/${folderId}`))
      ?? rows.find((r) => nasFolder && normPath(r.master_path) === normPath(nasFolder))
      ?? null;
  } catch { existing = null; }   // หาไม่เจอ/Drive สะดุด = ถือว่ายังไม่มี (โปรแกรมสร้างการ์ดใหม่)

  return NextResponse.json({
    job_name: jobName,
    brand: { id: brandId, name: brand.name, folder: brand.folder },
    artwork_type: artworkType || null,
    nas_folder: plan.counts.nas ? nasFolder : null,
    drive_path: driveOn && plan.counts.drive ? [brand.folder ?? "งาน ERP", typeFolder, jobName].filter(Boolean).join(" / ") : null,
    preview: plan.preview,
    files: plan.files,
    counts: plan.counts,
    warnings,
    existing,
    error: null,
  });
}
