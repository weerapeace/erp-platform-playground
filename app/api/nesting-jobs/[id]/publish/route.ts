/**
 * POST /api/nesting-jobs/[id]/publish (multipart) — ปิดท้าย "ส่งเข้าคลังงานพิมพ์" หลังตัวช่วยส่งไฟล์ขึ้น Drive ครบแล้ว
 *   file = รูปตัวอย่างแผ่น (ย่อแล้ว ≤4 MB) · meta = JSON { print_type_code, group?, file_ids[], sizes[], print_items[], width?, height? }
 *   1) ทับของเดิม: ไฟล์ชื่อเดียวกับไฟล์ใหม่ (รอบก่อน) ในโฟลเดอร์ → ถังขยะ Drive (กู้คืนได้ 30 วัน)
 *   2) การ์ดในคลังไฟล์ หมวดงานพิมพ์ (assets.source='print') — ส่งครั้งแรก = สร้าง · ส่งซ้ำ = อัปเดตการ์ดเดิม (รูปเก่าลงถัง R2)
 *   3) จำไว้ในงาน (asset_id / drive_folder_url / published_at) + ฉบับร่าง → "เสร็จ"
 *   — nesting.run (คนที่จัดเรียงได้ ส่งเข้าคลังได้เลย) · audit ทั้งการ์ดและงาน
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveListFiles, driveTrashFile } from "@/lib/google-drive";
import { isR2Configured, r2MoveToTrash, r2PutObject } from "@/lib/r2";
import { ASSET_MAX_BYTES, extOf, sha256Hex } from "@/lib/assets";
import { printPreviewProblem } from "@/lib/print-file-policy";
import { normalizePrintItems, normalizeSizes } from "@/app/api/assets/shared";
import { SELECT, actorOf, cleanUuid, toJob } from "../../shared";
import { printTypeByCode, resolveJobFolder, safeName } from "../../publish-shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const intOrNull = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);

export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.run"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });
  if (!(await isR2Configured())) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (R2)" }, { status: 503 });
  const id = cleanUuid((await params).id);
  if (!id) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "ต้องเป็น multipart/form-data" }, { status: 400 }); }
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "ต้องแนบรูปตัวอย่างแผ่น" }, { status: 400 });
  // ไฟล์นี้ลง R2 (รูปการ์ด) → ต้องเป็นรูปจริง · PDF/EPS ส่งเข้า Drive ทางตัวช่วยเท่านั้น (lib/print-file-policy)
  const bad = printPreviewProblem(file.name, file.type, new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (bad) return NextResponse.json({ error: bad.th }, { status: 400 });
  if (file.size > ASSET_MAX_BYTES) return NextResponse.json({ error: `รูปตัวอย่างใหญ่เกิน ${Math.round(ASSET_MAX_BYTES / 1024 / 1024)}MB` }, { status: 400 });
  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(String(form.get("meta") ?? "{}")) ?? {}; } catch { return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: job } = await admin.from("erp_nesting_jobs").select("id, name, status, asset_id").eq("id", id).eq("is_active", true).maybeSingle();
  if (!job) return NextResponse.json({ error: "ไม่พบงานนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const pt = await printTypeByCode(admin, meta.print_type_code);
  if (!pt) return NextResponse.json({ error: "เลือกประเภทงานพิมพ์ (DTF/UV) ก่อน" }, { status: 400 });
  const newIds = new Set((Array.isArray(meta.file_ids) ? meta.file_ids : []).map(String).filter(Boolean));

  let folder;
  try { folder = await resolveJobFolder(admin, job.name as string, pt, safeName(meta.group, 80)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 }); }

  // 1) ทับของเดิม — เฉพาะไฟล์ที่ชื่อชนกับไฟล์ที่เพิ่งขึ้น (ไฟล์อื่นในโฟลเดอร์ไม่แตะ)
  let replaced = 0;
  if (newIds.size) {
    try {
      const files = await driveListFiles(folder.folderId);
      const newNames = new Set(files.filter((f) => newIds.has(f.id)).map((f) => f.name));
      for (const f of files) if (newNames.has(f.name) && !newIds.has(f.id) && (await driveTrashFile(f.id))) replaced++;
    } catch { /* ลบของเก่าไม่ทัน = มีไฟล์ชื่อซ้ำในโฟลเดอร์ ไม่ทำให้การส่งพัง */ }
  }

  // 2) การ์ดในคลังไฟล์
  const buffer = await file.arrayBuffer();
  const ext = extOf(file.name) || "png";
  const r2Key = `library/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try { await r2PutObject(r2Key, new Uint8Array(buffer), file.type); }
  catch (e) { return NextResponse.json({ error: "อัปรูปตัวอย่างไม่สำเร็จ: " + (e instanceof Error ? e.message : "") }, { status: 500 }); }

  const actor = await actorOf(request, admin);
  const fields = {
    title: job.name as string, file_name: `${folder.folderName}.${ext}`, r2_key: r2Key, asset_type: "image",
    content_type: file.type, ext, size_bytes: file.size, width: intOrNull(meta.width), height: intOrNull(meta.height),
    checksum: await sha256Hex(buffer), source: "print", print_type: pt.code,
    sizes: normalizeSizes(meta.sizes), print_items: normalizePrintItems(meta.print_items),
    master_url: folder.folderUrl, master_path: folder.localPath || null, status: "active",
  };
  let assetId: string | null = null, oldKey: string | null = null;
  if (job.asset_id) {
    const { data: cur } = await admin.from("assets").select("id, r2_key, status").eq("id", job.asset_id).maybeSingle();
    if (cur && cur.status === "active") {
      const { error } = await admin.from("assets").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", cur.id);
      if (error) return NextResponse.json({ error: "อัปเดตการ์ดในคลังไม่สำเร็จ: " + error.message }, { status: 500 });
      assetId = cur.id as string; oldKey = (cur.r2_key as string | null) ?? null;
    }
  }
  const created = !assetId;
  if (!assetId) {   // ส่งครั้งแรก หรือการ์ดเดิมถูกลบไปแล้ว → การ์ดใหม่
    const { data: ins, error } = await admin.from("assets").insert({ ...fields, uploaded_by: actor.name }).select("id").single();
    if (error || !ins) return NextResponse.json({ error: "สร้างการ์ดในคลังไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });
    assetId = ins.id as string;
  }
  if (oldKey && oldKey !== r2Key) { try { await r2MoveToTrash(oldKey); } catch { /* รูปเก่าค้างใน R2 ไม่เป็นไร */ } }
  await writeAuditFor(request, admin, { action: created ? "create" : "update", entityType: "asset", entityId: assetId,
    metadata: { source: "print", from: "nesting", nesting_job_id: id, print_type: pt.code } });

  // 3) จำไว้ในงาน
  const { data: row, error: upErr } = await admin.from("erp_nesting_jobs").update({
    asset_id: assetId, drive_folder_url: folder.folderUrl, published_at: new Date().toISOString(),
    status: job.status === "draft" ? "done" : job.status,
    updated_by: actor.id, updated_by_name: actor.name, updated_at: new Date().toISOString(),
  }).eq("id", id).select(SELECT).single();
  if (upErr || !row) return NextResponse.json({ error: "ส่งแล้ว แต่บันทึกลงงานไม่สำเร็จ: " + (upErr?.message ?? "") }, { status: 500 });
  await writeAuditFor(request, admin, { action: "publish", entityType: "erp_nesting_jobs", entityId: id,
    metadata: { asset_id: assetId, created, folder_url: folder.folderUrl, files: newIds.size, replaced } });

  return NextResponse.json({ data: { job: toJob(row as Record<string, unknown>), asset_id: assetId, created, replaced, local_path: folder.localPath }, error: null });
}
