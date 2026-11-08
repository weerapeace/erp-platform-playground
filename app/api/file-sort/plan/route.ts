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
 *
 * สูตรงานสินค้า: body { profile:"product", variant?: "new"|"color"|"edit" (สินค้าใหม่/เพิ่มสี/แก้สี), job_folder:"BSD15", mode?: "replace"|"append", files:[{ path, size? }] }  (สิทธิ์ products.view เพิ่ม)
 * →   { profile:"product", job_name, nas_folder, mode, files, slots, groups, counts, warnings, parents }   (lib/file-sort-product)
 *     files[]  = ไฟล์ละ { rel, erp, dest, slotKey, width, nas, why, note }
 *     slots[]  = ช่องรูปของสินค้า { kind, parentId, skuId, rels (ปกหน้าสุด), coverRel, replaces, remove{attachments,desc}, entity }
 *
 * สูตร Content: body { profile:"content", brand_id, name (ชื่ออัลบั้ม), job_folder, files:[{ path, size? }] }
 * →   { profile:"content", job_name, album_name, brand, album (อัลบั้มชื่อนี้ของแบรนด์นี้ที่มีแล้ว = เติมไฟล์ใส่ ไม่สร้างใหม่), drive_ok,
 *       nas_folder, files, platforms, counts, warnings }   (lib/file-sort-content · ตัวสร้าง/อัปจริงคือ /api/content-albums/*)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi, apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured } from "@/lib/google-drive";
import { findArtworkDriveFolder } from "@/lib/artwork-drive";
import { findProfile, nasFolderFor, nasPatternFor, planFileSort, safeFolderName, type FileSortInput, type ProductVariant } from "@/lib/file-sort";
import { artworkTypeFolderName, brandFolderName, loadFileSortConfig } from "@/lib/file-sort-server";
import { PRODUCT_MAX_FILES, planProductSort, productNasFolder } from "@/lib/file-sort-product";
import { CONTENT_MAX_FILES, contentNasFolder, planContentSort } from "@/lib/file-sort-content";
import { loadAlbumFiles } from "@/lib/content-albums-server";
import { resolveBrandContentFolder } from "@/lib/content-drive";
import { loadImageCatalog, cleanCatalogRequest } from "@/lib/product-image-catalog-server";
import { candidateCodes } from "@/lib/product-image-routing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_FILES = 2000;
const normPath = (s: string | null | undefined) => String(s ?? "").replace(/\//g, "\\").replace(/\\+$/, "").trim().toLowerCase();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  let b: { profile?: string; variant?: string; brand_id?: string; artwork_type?: string; name?: string; job_folder?: string; mode?: string; files?: FileSortInput[] };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (b.profile === "product") return planProduct(request, b);
  if (b.profile === "content") return planContent(b);

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
  const nasPattern = nasPatternFor(profile, artworkType);
  const nasFolder = nasFolderFor(profile, brand.folder, typeFolder, jobName, artworkType);
  const warnings = [...plan.warnings];
  if (!brand.folder && plan.counts.nas && nasPattern.includes("{แบรนด์}")) warnings.push(`แบรนด์ "${brand.name}" ยังไม่ได้ตั้งโฟลเดอร์ (ตั้งที่ ⚙️ โฟลเดอร์มาตรฐาน ในคลังไฟล์) — ส่งลง Z: ไม่ได้ (หรือกด "เลือกที่เก็บเอง" ในโปรแกรม)`);
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

/** สูตรงานสินค้า: โหลดสินค้าตามรหัสในชื่อโฟลเดอร์/ไฟล์ (ตัวโหลดกลางชุดเดียวกับปุ่ม 📂 ในเว็บ) → แผนรายไฟล์/รายช่อง */
async function planProduct(request: NextRequest, b: { job_folder?: string; mode?: string; variant?: string; files?: FileSortInput[] }): Promise<NextResponse> {
  if (!(await apiCan(request, "products.view"))) return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดูสินค้า (products.view)" }, { status: 403 });
  const job = String(b.job_folder ?? "").trim();
  const files = Array.isArray(b.files) ? b.files.filter((f) => f && typeof f.path === "string") : [];
  if (!job) return NextResponse.json({ error: "ไม่รู้ชื่อโฟลเดอร์รุ่น" }, { status: 400 });
  if (!files.length) return NextResponse.json({ error: "โฟลเดอร์นี้ไม่มีไฟล์" }, { status: 400 });
  if (files.length > PRODUCT_MAX_FILES) return NextResponse.json({ error: `โฟลเดอร์ใหญ่เกินไป (เกิน ${PRODUCT_MAX_FILES} ไฟล์)` }, { status: 400 });
  const admin = supabaseAdmin();
  const cfg = (await loadFileSortConfig(admin)).product;
  const jobName = job.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? job;
  const codes = candidateCodes(files.map((f) => `${jobName}/${String(f.path).replace(/\\/g, "/")}`));
  const catalog = await loadImageCatalog(admin, cleanCatalogRequest({ codes }));
  const variant: ProductVariant = b.variant === "color" || b.variant === "edit" ? b.variant : "new";
  const plan = planProductSort(files, catalog.parents, cfg, { jobFolder: jobName, variant, mode: b.mode === "append" ? "append" : b.mode === "replace" ? "replace" : undefined });
  if (catalog.truncated) plan.warnings.push("รหัสในโฟลเดอร์นี้ตรงกับสินค้าเกิน 60 รุ่น — แสดงแค่ 60 รุ่นแรก (แบ่งโฟลเดอร์ให้เล็กลง)");
  return NextResponse.json({ profile: "product", job_name: safeFolderName(jobName), nas_folder: productNasFolder(cfg, jobName, variant), ...plan, error: null });
}

/** สูตร Content: อัลบั้มชื่อเดียวกันของแบรนด์เดียวกันที่มีแล้ว = เติมไฟล์ใส่ (ไฟล์ที่มีแล้วข้าม) · ไม่มี = โปรแกรมสร้างใหม่ตอนส่ง */
async function planContent(b: { brand_id?: string; name?: string; job_folder?: string; files?: FileSortInput[] }): Promise<NextResponse> {
  const brandId = String(b.brand_id ?? "").trim();
  const job = String(b.job_folder ?? "").trim().replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  const albumName = (String(b.name ?? "").trim() || job).slice(0, 120);
  const files = Array.isArray(b.files) ? b.files.filter((f) => f && typeof f.path === "string") : [];
  if (!albumName) return NextResponse.json({ error: "ใส่ชื่ออัลบั้มก่อน" }, { status: 400 });
  if (!brandId) return NextResponse.json({ error: "เลือกแบรนด์ก่อน — อัลบั้มเก็บไฟล์ในโฟลเดอร์ Drive ของแบรนด์" }, { status: 400 });
  if (!files.length) return NextResponse.json({ error: "โฟลเดอร์นี้ไม่มีไฟล์" }, { status: 400 });
  if (files.length > CONTENT_MAX_FILES) return NextResponse.json({ error: `โฟลเดอร์ใหญ่เกินไป (เกิน ${CONTENT_MAX_FILES} ไฟล์) — แบ่งเป็นหลายงาน` }, { status: 400 });
  const admin = supabaseAdmin();
  const [cfgAll, brand, cols] = await Promise.all([
    loadFileSortConfig(admin), brandFolderName(admin, brandId),
    admin.from("asset_collections").select("id, name").eq("name", albumName).limit(20),
  ]);
  if (!brand.name) return NextResponse.json({ error: "ไม่พบแบรนด์นี้ในระบบ" }, { status: 400 });
  const cfg = cfgAll.content;
  const ids = ((cols.data ?? []) as { id: string }[]).map((c) => c.id);
  let album: { id: string; name: string; file_count: number } | null = null;
  let existing: { file_name: string; size_bytes: number | null }[] = [];
  if (ids.length) {
    const { data: al } = await admin.from("content_albums").select("id, created_at").in("id", ids).eq("brand_id", brandId).is("trashed_at", null).order("created_at").limit(1);
    const hit = ((al ?? []) as { id: string }[])[0];
    if (hit) {
      const af = await loadAlbumFiles(admin, hit.id, []);
      existing = af.map((f) => ({ file_name: f.file_name, size_bytes: f.size_bytes }));
      album = { id: hit.id, name: albumName, file_count: af.length };
    }
  }
  const plan = planContentSort(files, cfg, { existing });
  const warnings = [...plan.warnings];
  let driveOk = driveConfigured();
  if (!driveOk) warnings.push("ระบบยังไม่ได้เชื่อม Google Drive — ลงอัลบั้มไม่ได้ (ก๊อปลง Z: ได้อย่างเดียว)");
  else if (plan.counts.album) {
    const t = await resolveBrandContentFolder(admin, brandId, false).catch((e: Error) => ({ ok: false as const, reason: `ติดต่อ Google Drive ไม่ได้: ${e.message}` }));
    if (!t.ok) { driveOk = false; warnings.push(`ลงอัลบั้มไม่ได้: ${t.reason}`); }
  }
  return NextResponse.json({
    profile: "content", job_name: safeFolderName(job || albumName), album_name: albumName,
    brand: { id: brandId, name: brand.name, folder: brand.folder }, album, drive_ok: driveOk,
    nas_folder: plan.counts.nas ? contentNasFolder(cfg, job || albumName, albumName, brand.folder) : null,
    ...plan, warnings, error: null,
  });
}
