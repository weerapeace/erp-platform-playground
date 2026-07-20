/**
 * /api/record-files — ไฟล์แนบราย record (ของกลาง) เก็บใน Supabase Storage bucket 'record-files'
 *   GET  ?entity_type=&entity_id=  → รายการไฟล์ + signed URL ต่อไฟล์ (bucket private)
 *   POST (multipart: file, entity_type, entity_id, actor) → อัปขึ้น Storage + บันทึกทะเบียน
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { RECORD_FILES_BUCKET, RECORD_FILES_SIGNED_TTL, RECORD_FILES_MAX, type RecordFileRow } from "@/lib/record-files";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const entityType = (sp.get("entity_type") ?? "").trim();
  const entityId = (sp.get("entity_id") ?? "").trim();
  if (!entityType || !UUID_RE.test(entityId)) return NextResponse.json({ data: [], error: null });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_record_files")
    .select("*").eq("entity_type", entityType).eq("entity_id", entityId)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as RecordFileRow[];

  // signed URL ต่อไฟล์ (bucket เป็น private) — จัดกลุ่มตาม bucket
  const byBucket = new Map<string, string[]>();
  for (const r of rows) { const a = byBucket.get(r.bucket) ?? []; a.push(r.storage_path); byBucket.set(r.bucket, a); }
  const urlByPath: Record<string, string> = {};
  for (const [bucket, paths] of byBucket) {
    if (!paths.length) continue;
    const { data: signed } = await admin.storage.from(bucket).createSignedUrls(paths, RECORD_FILES_SIGNED_TTL);
    (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) urlByPath[s.path] = s.signedUrl; });
  }
  return NextResponse.json({ data: rows.map((r) => ({ ...r, url: urlByPath[r.storage_path] ?? null })), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let form: FormData; try { form = await request.formData(); } catch { return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const file = form.get("file");
  const entityType = String(form.get("entity_type") ?? "").trim();
  const entityId = String(form.get("entity_id") ?? "").trim();
  const actor = String(form.get("actor") ?? "").trim() || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์" }, { status: 400 });
  if (!entityType || !UUID_RE.test(entityId)) return NextResponse.json({ error: "ระบุ record ไม่ถูกต้อง" }, { status: 400 });
  if (file.size > RECORD_FILES_MAX) return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${Math.round(RECORD_FILES_MAX / 1024 / 1024)}MB` }, { status: 400 });

  const admin = supabaseAdmin();
  const ext = (file.name.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${entityType}/${entityId}/${Date.now()}-${rand}${ext}`;
  const buf = await file.arrayBuffer();
  const { error: upErr } = await admin.storage.from(RECORD_FILES_BUCKET)
    .upload(path, buf, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (upErr) return NextResponse.json({ error: `อัปโหลดไม่สำเร็จ: ${upErr.message}` }, { status: 500 });

  // sort_order = max+1 ต่อ record
  const { data: mx } = await admin.from("erp_record_files").select("sort_order")
    .eq("entity_type", entityType).eq("entity_id", entityId)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((mx?.sort_order as number | undefined) ?? -1) + 1;

  const { data: ins, error } = await admin.from("erp_record_files").insert({
    entity_type: entityType, entity_id: entityId, bucket: RECORD_FILES_BUCKET, storage_path: path,
    file_name: file.name || "file", content_type: file.type || null, size_bytes: file.size,
    sort_order: nextOrder, uploaded_by: actor,
  }).select("*").single();
  if (error || !ins) {
    try { await admin.storage.from(RECORD_FILES_BUCKET).remove([path]); } catch { /* rollback storage */ }
    return NextResponse.json({ error: error?.message || "บันทึกไม่สำเร็จ" }, { status: 500 });
  }

  await writeAudit(admin, { action: "create", entityType: "record_file", entityId: ins.id as string, actorId: actor, metadata: { entity_type: entityType, entity_id: entityId, file_name: file.name } });
  const { data: signed } = await admin.storage.from(RECORD_FILES_BUCKET).createSignedUrl(path, RECORD_FILES_SIGNED_TTL);
  return NextResponse.json({ data: { ...ins, url: signed?.signedUrl ?? null }, error: null });
}
