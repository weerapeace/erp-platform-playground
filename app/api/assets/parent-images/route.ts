/**
 * 📦 รูปจาก Parent SKU ที่ตรงคำค้น — ให้ตัวเลือกรูปกลาง (AssetPicker) ค้นเจอรูปสินค้าทั้งชุด แม้ชื่อไฟล์ไม่มีรหัส
 *
 * GET  /api/assets/parent-images?search=pix22&type=image&limit=5
 *      → { parents: [{ id, code, name, is_active, items: [{ asset, group, owner }] }] }
 *      ค้นรหัส/ชื่อ Parent (+ รหัส SKU ลูก) แบบเป๊ะ-first · รวมรูป Parent + SKU ลูก + Description (lib/parent-sku-images)
 * POST /api/assets/parent-images  { attachment_ids: string[] }
 *      → { data: { [attachment_id]: AssetRow } } — ลงคลังให้รูปแกลเลอรีที่ยังไม่อยู่ในคลัง (ไม่ย้าย/ไม่ก๊อปไฟล์ · มีแล้ว = คืนตัวเดิม)
 *
 * ของกลาง: guardApi · supabaseAdmin · lib/search-score · buildRow · writeAuditMany
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAuditMany } from "@/lib/audit";
import { detectAssetType, extOf } from "@/lib/assets";
import { ilikeOr, tokenize } from "@/lib/search-score";
import {
  assembleParentImages, rankParentHits, type GalleryAtt, type ParentCandidate, type ParentImageHit, type UsageImg,
} from "@/lib/parent-sku-images";
import { buildRow, loadTags, loadUsageCounts, rowOf, type AssetDbRow, type AssetRow, type Db } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CANDIDATES = 200;   // ดึงผู้สมัครมาจัดอันดับก่อนตัด (มาตรฐาน search-score)
const ATT_COLS = "id, entity_type, entity_id, file_name, file_path, public_url, content_type, size_bytes, created_at";
const USAGE_MODULES = ["parent_sku", "product_sku", "parent_sku_description"];

/** แถวในคลัง → AssetRow (พร้อมแท็ก + จำนวนที่ใช้) */
async function assetRows(admin: Db, rows: AssetDbRow[]): Promise<AssetRow[]> {
  const ids = rows.map((r) => r.id);
  const [tagsBy, useBy] = await Promise.all([loadTags(admin, ids), loadUsageCounts(admin, ids)]);
  return rows.map((r) => buildRow(r, tagsBy.get(r.id) ?? [], useBy.get(r.id) ?? 0));
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const search = (sp.get("search") ?? "").trim();
  const type = sp.get("type") || null;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 5) || 5, 1), 10);
  const tokens = tokenize(search);
  if (tokens.length === 0) return NextResponse.json({ parents: [], error: null });

  const admin = supabaseAdmin();

  // 1) ผู้สมัคร: Parent ที่รหัส/ชื่อตรงทุกคำ + Parent ของ SKU ลูกที่รหัสตรงทุกคำ (ค้น "PIX22-03" ก็เจอ PIX22)
  let pq = admin.from("parent_skus_v2").select("id, code, name_th, is_active");
  for (const t of tokens) pq = pq.or(ilikeOr(["code", "name_th", "name_en"], t));
  let sq = admin.from("skus_v2").select("code, parent_sku_id").not("parent_sku_id", "is", null);
  for (const t of tokens) sq = sq.ilike("code", `%${t}%`);
  const [pRes, sRes] = await Promise.all([pq.limit(CANDIDATES), sq.limit(CANDIDATES)]);
  if (pRes.error) return NextResponse.json({ parents: [], error: pRes.error.message }, { status: 500 });

  type PRow = { id: string; code: string | null; name_th: string | null; is_active: boolean | null };
  const cand = new Map<string, ParentCandidate>();
  const addCand = (p: PRow) => { if (!cand.has(p.id)) cand.set(p.id, { id: p.id, code: p.code ?? "", name: p.name_th ?? "", is_active: p.is_active !== false, sku_codes: [] }); };
  for (const p of (pRes.data ?? []) as PRow[]) addCand(p);
  const skuHits = (sRes.data ?? []) as { code: string; parent_sku_id: string }[];
  const missing = [...new Set(skuHits.map((s) => s.parent_sku_id))].filter((id) => !cand.has(id));
  if (missing.length) {
    const { data } = await admin.from("parent_skus_v2").select("id, code, name_th, is_active").in("id", missing.slice(0, CANDIDATES));
    for (const p of (data ?? []) as PRow[]) addCand(p);
  }
  for (const s of skuHits) cand.get(s.parent_sku_id)?.sku_codes?.push(s.code);

  const top = rankParentHits(search, [...cand.values()], limit);
  if (top.length === 0) return NextResponse.json({ parents: [], error: null });

  // 2) รูปของ Parent ที่ติดอันดับ: SKU ลูก → แกลเลอรี + การผูกในคลัง (ดึงรวดเดียวทุกตัว)
  const parentIds = top.map((p) => p.id);
  const { data: skuData } = await admin.from("skus_v2").select("id, code, parent_sku_id").in("parent_sku_id", parentIds).order("code");
  const skus = (skuData ?? []) as { id: string; code: string; parent_sku_id: string }[];
  const entityIds = [...parentIds, ...skus.map((s) => s.id)];

  const [attRes, useRes] = await Promise.all([
    admin.from("erp_playground_attachments").select(ATT_COLS)
      .in("entity_type", ["parent_skus_v2", "skus_v2"]).in("entity_id", entityIds)
      .order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).order("created_at", { ascending: true })
      .limit(1000),
    admin.from("asset_usages").select("module, record_id, asset_id, sort_order, created_at")
      .in("module", USAGE_MODULES).in("record_id", entityIds)
      .order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true })
      .limit(1000),
  ]);
  const atts = (attRes.data ?? []) as GalleryAtt[];
  const uses = (useRes.data ?? []) as { module: string; record_id: string; asset_id: string }[];

  // 3) รูปในคลัง: ตัวที่ผูกไว้ + ตัวที่ r2_key ตรงกับรูปแกลเลอรี (รูปแกลเลอรีที่อยู่ในคลังแล้ว → ใช้ id จริง)
  const useIds = [...new Set(uses.map((u) => u.asset_id))];
  const attKeys = [...new Set(atts.map((a) => a.file_path))];
  const [byIdRes, byKeyRes] = await Promise.all([
    useIds.length ? admin.from("assets").select("*").eq("status", "active").in("id", useIds) : Promise.resolve({ data: [] }),
    attKeys.length ? admin.from("assets").select("*").eq("status", "active").in("r2_key", attKeys) : Promise.resolve({ data: [] }),
  ]);
  const dbRows = new Map<string, AssetDbRow>();
  for (const r of [...((byIdRes.data ?? []) as AssetDbRow[]), ...((byKeyRes.data ?? []) as AssetDbRow[])]) dbRows.set(r.id, r);
  const rows = await assetRows(admin, [...dbRows.values()]);
  const assetById = new Map(rows.map((r) => [r.id, r]));
  const assetByKey = new Map<string, AssetRow>();
  for (const r of rows) if (!assetByKey.has(r.r2_key)) assetByKey.set(r.r2_key, r);
  const usages: UsageImg[] = uses.flatMap((u) => { const a = assetById.get(u.asset_id); return a ? [{ module: u.module, record_id: u.record_id, asset: a }] : []; });

  const parents: ParentImageHit[] = top.map((p) => ({
    id: p.id, code: p.code, name: p.name, is_active: p.is_active,
    items: assembleParentImages({ parent: p, skus: skus.filter((s) => s.parent_sku_id === p.id), atts, usages, assetByKey, type }),
  })).filter((p) => p.items.length > 0);

  return NextResponse.json({ parents, error: null });
}

// ---- POST: ลงคลังให้รูปแกลเลอรีสินค้าที่ยังไม่อยู่ในคลัง (ตอนกด "ใช้รูปที่เลือก" ในป๊อปเลือกรูป) ----
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.upload");
  if (denied) return denied;

  let body: { attachment_ids?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.attachment_ids)
    ? [...new Set(body.attachment_ids.map((x) => String(x ?? "").trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 50)
    : [];
  if (ids.length === 0) return NextResponse.json({ error: "ยังไม่ได้เลือกรูป" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: attData, error: attErr } = await admin.from("erp_playground_attachments").select(ATT_COLS)
    .in("id", ids).in("entity_type", ["parent_skus_v2", "skus_v2"]);
  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });
  const atts = (attData ?? []) as GalleryAtt[];
  if (atts.length === 0) return NextResponse.json({ error: "ไม่พบรูปนี้ในแกลเลอรีสินค้าแล้ว — ลองค้นใหม่อีกครั้ง" }, { status: 404 });

  // รหัสเจ้าของรูป (Parent / SKU) → ใช้ตั้งชื่อ + คำค้น ให้ค้นในคลังด้วยรหัสได้ทีหลัง
  const parentIds = atts.filter((a) => a.entity_type === "parent_skus_v2").map((a) => a.entity_id);
  const skuIds = atts.filter((a) => a.entity_type === "skus_v2").map((a) => a.entity_id);
  const { data: sData } = skuIds.length ? await admin.from("skus_v2").select("id, code, parent_sku_id").in("id", skuIds) : { data: [] };
  const skuRows = (sData ?? []) as { id: string; code: string; parent_sku_id: string | null }[];
  const allParentIds = [...new Set([...parentIds, ...skuRows.map((s) => s.parent_sku_id).filter((x): x is string => !!x)])];
  const { data: pData } = allParentIds.length ? await admin.from("parent_skus_v2").select("id, code").in("id", allParentIds) : { data: [] };
  const parentCode = new Map(((pData ?? []) as { id: string; code: string }[]).map((p) => [p.id, p.code]));
  const codeOf = new Map<string, string[]>();
  for (const id of parentIds) codeOf.set(id, [parentCode.get(id) ?? ""].filter(Boolean));
  for (const s of skuRows) codeOf.set(s.id, [s.code, s.parent_sku_id ? parentCode.get(s.parent_sku_id) : ""].filter((x): x is string => !!x));

  const { data: exData } = await admin.from("assets").select("*").eq("status", "active").in("r2_key", atts.map((a) => a.file_path));
  const existing = new Map<string, AssetDbRow>();
  for (const r of (exData ?? []) as AssetDbRow[]) if (!existing.has(r.r2_key)) existing.set(r.r2_key, r);

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = user?.email ?? user?.id ?? null;
  const out: Record<string, AssetRow> = {};
  const created: { id: string; key: string; attId: string }[] = [];
  for (const a of atts) {
    const ex = existing.get(a.file_path);
    if (ex) { out[a.id] = await rowOf(admin, ex); continue; }
    const codes = codeOf.get(a.entity_id) ?? [];
    const name = a.file_name?.trim() || a.file_path.split("/").pop() || "image";
    const { data: ins, error } = await admin.from("assets").insert({
      title: `${codes[0] ?? ""} ${name}`.trim(), file_name: name, r2_key: a.file_path,
      asset_type: detectAssetType(a.content_type, name), content_type: a.content_type, ext: extOf(name) || null,
      size_bytes: a.size_bytes, status: "active", source: "odoo_product", keywords: codes.join(" ") || null, uploaded_by: actor,
    }).select("*").maybeSingle();
    if (error || !ins) return NextResponse.json({ error: `ลงคลังไม่สำเร็จ: ${error?.message ?? "unknown"}` }, { status: 500 });
    existing.set(a.file_path, ins as AssetDbRow);
    out[a.id] = await rowOf(admin, ins as AssetDbRow);
    created.push({ id: ins.id as string, key: a.file_path, attId: a.id });
  }

  await writeAuditMany(admin, created.map((c) => ({
    action: "create", entityType: "asset", entityId: c.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { r2_key: c.key, attachment_id: c.attId, via: "asset-picker-parent-sku" },
  })));
  return NextResponse.json({ data: out, created: created.length, error: null });
}
