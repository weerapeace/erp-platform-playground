/**
 * GET  /api/assets   — รายการไฟล์ในคลัง (ค้น/ฟิลเตอร์ชนิด/อัลบั้ม/แท็ก/สถานะ)
 * POST /api/assets   — อัปโหลดไฟล์เข้าคลัง (multipart) + กันไฟล์ซ้ำด้วย checksum
 *
 * ใช้ของกลาง: guardApi (สิทธิ์) · supabaseAdmin · r2PutObject · writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { r2PutObject, isR2Configured } from "@/lib/r2";
import { detectAssetType, extOf, sha256Hex, ASSET_MAX_BYTES } from "@/lib/assets";
import {
  type AssetRow, buildRow, sanitizeToken, loadTags, loadUsageCounts, attachTags, rowOf, actorId,
} from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type AssetListResponse = { data: AssetRow[]; total: number; error: string | null };

// ---- GET ----
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const search       = (sp.get("search") ?? "").trim();
  const type         = sp.get("type");
  const collectionId = sp.get("collection_id");
  const tag          = sp.get("tag");
  const status       = sp.get("status") ?? "active";
  const source       = sp.get("source") ?? "upload";   // upload | odoo_product | artwork | all
  const artworkType  = sp.get("artwork_type");
  const limit  = Math.min(Number(sp.get("limit") ?? 60) || 60, 200);
  const offset = Number(sp.get("offset") ?? 0) || 0;

  const admin = supabaseAdmin();

  // ฟิลเตอร์ตามแท็ก → หาว่ามี asset ไหนติดแท็กนี้
  let tagAssetIds: string[] | null = null;
  if (tag) {
    const { data: tg } = await admin.from("asset_tags").select("id").or(`id.eq.${tag},name.eq.${tag}`).maybeSingle();
    const tagId = (tg?.id as string) ?? tag;
    const { data: maps } = await admin.from("asset_tag_map").select("asset_id").eq("tag_id", tagId);
    tagAssetIds = (maps ?? []).map((m) => (m as { asset_id: string }).asset_id);
    if (tagAssetIds.length === 0)
      return NextResponse.json({ data: [], total: 0, error: null } satisfies AssetListResponse);
  }

  // ฟิลเตอร์ตามอัลบั้ม → asset อยู่ได้หลายอัลบั้ม (ผ่าน asset_collection_map)
  let collAssetIds: string[] | null = null;
  if (collectionId && collectionId !== "none") {
    const { data: cm } = await admin.from("asset_collection_map").select("asset_id").eq("collection_id", collectionId);
    collAssetIds = (cm ?? []).map((m) => (m as { asset_id: string }).asset_id);
    if (collAssetIds.length === 0)
      return NextResponse.json({ data: [], total: 0, error: null } satisfies AssetListResponse);
  }

  let q = admin.from("assets").select("*", { count: "exact" }).eq("status", status);
  if (source !== "all") q = q.eq("source", source);
  if (artworkType) q = q.eq("artwork_type", artworkType);
  if (type) q = q.eq("asset_type", type);
  if (collectionId === "none") q = q.is("collection_id", null);
  if (collAssetIds) q = q.in("id", collAssetIds);
  if (tagAssetIds) q = q.in("id", tagAssetIds);
  if (search) {
    for (const raw of search.split(/\s+/)) {
      const t = sanitizeToken(raw);
      if (t) q = q.or(`title.ilike.%${t}%,file_name.ilike.%${t}%,description.ilike.%${t}%`);
    }
  }
  q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error)
    return NextResponse.json({ data: [], total: 0, error: error.message } satisfies AssetListResponse, { status: 500 });

  const rows = (data ?? []) as Parameters<typeof buildRow>[0][];
  const ids = rows.map((r) => r.id);
  const tagsByAsset  = await loadTags(admin, ids);
  const usageByAsset = await loadUsageCounts(admin, ids);
  const out = rows.map((r) => buildRow(r, tagsByAsset.get(r.id) ?? [], usageByAsset.get(r.id) ?? 0));

  return NextResponse.json({ data: out, total: count ?? out.length, error: null } satisfies AssetListResponse);
}

// ---- POST (upload) ----
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.upload");
  if (denied) return denied;
  if (!(await isR2Configured()))
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (R2)" }, { status: 503 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "ต้องเป็น multipart/form-data" }, { status: 400 }); }

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "ต้องแนบไฟล์" }, { status: 400 });
  if (file.size > ASSET_MAX_BYTES)
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${Math.round(ASSET_MAX_BYTES / 1024 / 1024)}MB` }, { status: 400 });

  const title        = String(form.get("title") ?? "").trim() || file.name;
  const collectionId = form.get("collection_id") ? String(form.get("collection_id")) : null;
  const actor        = form.get("actor") ? String(form.get("actor")) : null;
  const widthRaw     = form.get("width")  ? Number(form.get("width"))  : NaN;
  const heightRaw    = form.get("height") ? Number(form.get("height")) : NaN;
  const tagsRaw      = String(form.get("tags") ?? "").trim();
  const tagNames     = tagsRaw ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const source       = String(form.get("source") ?? "upload").trim() || "upload";
  const artworkType  = form.get("artwork_type") ? String(form.get("artwork_type")) : null;
  const masterPath   = form.get("master_path") ? String(form.get("master_path")) : null;
  const masterUrl    = form.get("master_url")  ? String(form.get("master_url"))  : null;

  const admin  = supabaseAdmin();
  const buffer = await file.arrayBuffer();
  const checksum = await sha256Hex(buffer);

  // กันไฟล์ซ้ำ — ถ้าไฟล์เดิม (เนื้อหาเดียวกัน) ยังอยู่ในคลัง ใช้ตัวเดิม ไม่เก็บซ้ำ
  // (ยกเว้น artwork = บัตรแยกเสมอ แม้รูปตัวอย่างซ้ำ เพราะ path/ชนิดต่างกัน)
  const dupRes = source === "artwork"
    ? { data: null as Record<string, unknown> | null }
    : await admin.from("assets").select("*").eq("checksum", checksum).eq("status", "active").limit(1).maybeSingle();
  const dup = dupRes.data;
  if (dup) {
    if (tagNames.length) await attachTags(admin, dup.id as string, tagNames);
    if (collectionId) await admin.from("asset_collection_map").upsert({ asset_id: dup.id as string, collection_id: collectionId }, { onConflict: "asset_id,collection_id", ignoreDuplicates: true });
    return NextResponse.json({ data: await rowOf(admin, dup as Parameters<typeof rowOf>[1]), duplicate: true, error: null });
  }

  const ext       = extOf(file.name);
  const assetType = detectAssetType(file.type, file.name);
  const rand      = Math.random().toString(36).slice(2, 8);
  const r2Key     = `library/${Date.now()}-${rand}${ext ? "." + ext : ""}`;

  try {
    await r2PutObject(r2Key, new Uint8Array(buffer), file.type || "application/octet-stream");
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "อัปโหลดไฟล์ไม่สำเร็จ: " + (err instanceof Error ? err.message : "") }, { status: 500 });
  }

  const { data: ins, error } = await admin.from("assets").insert({
    title, file_name: file.name, r2_key: r2Key, asset_type: assetType,
    content_type: file.type || null, ext: ext || null, size_bytes: file.size,
    width:  Number.isFinite(widthRaw)  ? widthRaw  : null,
    height: Number.isFinite(heightRaw) ? heightRaw : null,
    checksum, collection_id: collectionId, uploaded_by: actor, status: "active",
    source, artwork_type: artworkType, master_path: masterPath, master_url: masterUrl,
  }).select("*").single();
  if (error || !ins)
    return NextResponse.json({ error: "บันทึกข้อมูลไฟล์ไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });

  if (tagNames.length) await attachTags(admin, ins.id as string, tagNames);
  if (collectionId) await admin.from("asset_collection_map").upsert({ asset_id: ins.id as string, collection_id: collectionId }, { onConflict: "asset_id,collection_id", ignoreDuplicates: true });

  await writeAudit(admin, {
    action: "create", entityType: "asset", entityId: ins.id as string,
    actorId: await actorId(request), actorName: actor,
    metadata: { file_name: file.name, asset_type: assetType, size_bytes: file.size },
  });

  return NextResponse.json({ data: await rowOf(admin, ins as Parameters<typeof rowOf>[1]), duplicate: false, error: null });
}
