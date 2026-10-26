/**
 * 🕘 ประวัติชุดอัปรูป (📂 จัดรูปหลายโฟลเดอร์ รอบ 2) — ของกลาง ฝั่งเซิร์ฟเวอร์
 * ตาราง erp_image_batches (1 แถว/การกดยืนยัน 1 ครั้ง) + erp_image_batch_items (1 แถว/รูปที่อัปสำเร็จ) · migration 202611010400
 *   parseBatchItems / parseUndoInfo / mergeUndoInfo — ตรวจ/รวมค่าที่หน้าจอส่งมา (pure + test)
 *   findSeenImages  — ลายนิ้วมือไฟล์ → เคยอัปที่ไหน เมื่อไร โดยใคร (เฉพาะที่ยังอยู่จริง + ชุดยังไม่ถูกย้อน)
 *   undoImageBatch  — ย้อนทั้งชุด: เอารูปใหม่ออก (เก็บเป็นเวอร์ชันเหมือนลบปกติ) · คืนรูปเดิมที่ถูกแทน · คืนปกเดิม
 *                     · เอารูป Description ออก · คืน PNG เดิม · คืนรูปบนเว็บ/Hero — ส่วนที่มีคนแก้ต่อแล้ว = ข้าม ไม่ทับ
 */
import { writeAudit } from "@/lib/audit";
import { afterAttachmentRemoved, type RemovedAttachment } from "@/lib/attachment-remove";
import { removeDescriptionImage, DESCRIPTION_MODULE } from "@/lib/description-images";
import { restoreVersion } from "@/lib/record-versions";
import { parseListingChanges, undoListingChanges, type ListingChange } from "@/lib/website-listing-undo";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
/** client ที่ถือสิทธิ์ของผู้ใช้ (supabaseFromRequest) — ใช้กับ RPC ที่เช็กสิทธิ์ใน DB */
type UserDb = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> };

export const BATCH_DESTS = ["skuMain", "sku", "parent", "desc", "png", "webColor", "heroD", "heroM"] as const;
export type BatchDest = (typeof BATCH_DESTS)[number];
const GALLERY_DESTS: BatchDest[] = ["skuMain", "sku", "parent"];
const WEB_DESTS: BatchDest[] = ["webColor", "heroD", "heroM"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** ลายนิ้วมือ = ขนาดไฟล์ : SHA-256 (hex) ของต้น+ท้ายไฟล์ — คำนวณที่เบราว์เซอร์ */
export const SIG_RE = /^\d{1,12}:[0-9a-f]{24,64}$/;
const KEY_RE = /^[\w\-./%()]{1,300}$/;
const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

export interface BatchItemIn {
  source_sig: string;
  source_name: string | null;
  source_bytes: number | null;
  parent_id: string;
  sku_id: string | null;
  dest: BatchDest;
  attachment_id: string | null;
  asset_id: string | null;
  r2_key: string | null;
}
export function parseBatchItems(raw: unknown): BatchItemIn[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 300).flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const parent = uuidOrNull(o.parent_id);
    const dest = BATCH_DESTS.find((d) => d === o.dest);
    if (typeof o.source_sig !== "string" || !SIG_RE.test(o.source_sig) || !parent || !dest) return [];
    const key = typeof o.r2_key === "string" && KEY_RE.test(o.r2_key) ? o.r2_key : null;
    const bytes = typeof o.source_bytes === "number" && Number.isFinite(o.source_bytes) ? Math.max(0, Math.round(o.source_bytes)) : null;
    return [{ source_sig: o.source_sig, source_name: str(o.source_name, 240), source_bytes: bytes, parent_id: parent, sku_id: uuidOrNull(o.sku_id), dest, attachment_id: uuidOrNull(o.attachment_id), asset_id: uuidOrNull(o.asset_id), r2_key: key }];
  });
}

export interface UndoInfo {
  /** SKU/Parent → id แถวรูปที่เป็นปกก่อนอัป (คืนตอนย้อน) */
  prevPrimary: Record<string, string>;
  /** รูปตัด PNG: ก่อน/หลัง (คืนเฉพาะเมื่อยังเป็นค่าหลัง) */
  png: { parentId: string; before: string | null; after: string }[];
  /** รูปบนเว็บ/Hero ก่อน/หลัง ต่อร้าน (lib/website-listing-undo) */
  web: ListingChange[];
  /** โหมดแทนที่: รูปเดิมที่ถูกเอาออก (คืนจาก 🕘 เวอร์ชัน) */
  replaced: { table: "skus_v2" | "parent_skus_v2"; entityId: string; key: string }[];
}
export const emptyUndoInfo = (): UndoInfo => ({ prevPrimary: {}, png: [], web: [], replaced: [] });

export function parseUndoInfo(raw: unknown): UndoInfo {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const prevPrimary: Record<string, string> = {};
  if (o.prevPrimary && typeof o.prevPrimary === "object") {
    for (const [k, v] of Object.entries(o.prevPrimary as Record<string, unknown>).slice(0, 300)) if (UUID.test(k) && uuidOrNull(v)) prevPrimary[k] = v as string;
  }
  const png = (Array.isArray(o.png) ? o.png : []).slice(0, 100).flatMap((x) => {
    const p = (x ?? {}) as Record<string, unknown>;
    const parentId = uuidOrNull(p.parentId);
    const after = typeof p.after === "string" && KEY_RE.test(p.after) ? p.after : null;
    const before = typeof p.before === "string" && KEY_RE.test(p.before) ? p.before : null;
    return parentId && after ? [{ parentId, before, after }] : [];
  });
  const replaced = (Array.isArray(o.replaced) ? o.replaced : []).slice(0, 600).flatMap((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const table: "skus_v2" | "parent_skus_v2" | null = r.table === "parent_skus_v2" ? "parent_skus_v2" : r.table === "skus_v2" ? "skus_v2" : null;
    const entityId = uuidOrNull(r.entityId);
    const key = typeof r.key === "string" && KEY_RE.test(r.key) ? r.key : null;
    return table && entityId && key ? [{ table, entityId, key }] : [];
  });
  return { prevPrimary, png, web: parseListingChanges(o.web), replaced };
}

/** รวมข้อมูลย้อนของรอบแรก + รอบอัปซ้ำ (ปกเดิม = ของรอบแรก · ที่เหลือต่อท้าย) */
export function mergeUndoInfo(a: UndoInfo, b: UndoInfo): UndoInfo {
  return { prevPrimary: { ...b.prevPrimary, ...a.prevPrimary }, png: [...a.png, ...b.png], web: [...a.web, ...b.web], replaced: [...a.replaced, ...b.replaced] };
}

// ───────────── เคยอัปแล้ว ─────────────

export interface SeenEntry {
  batchId: string;
  at: string;
  by: string | null;
  parentId: string;
  skuId: string | null;
  dest: BatchDest;
}
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function findSeenImages(admin: Admin, sigs: string[]): Promise<Record<string, SeenEntry[]>> {
  const list = [...new Set(sigs.filter((s) => SIG_RE.test(s)))].slice(0, 600);
  type Row = { source_sig: string; batch_id: string; parent_id: string; sku_id: string | null; dest: BatchDest; attachment_id: string | null; asset_id: string | null; r2_key: string | null; created_at: string };
  const rows: Row[] = [];
  for (const part of chunk(list, 150)) {
    const { data } = await admin.from("erp_image_batch_items").select("source_sig, batch_id, parent_id, sku_id, dest, attachment_id, asset_id, r2_key, created_at").in("source_sig", part).order("created_at", { ascending: false }).limit(3000);
    rows.push(...((data ?? []) as Row[]));
  }
  if (!rows.length) return {};
  // ชุดที่ยังไม่ถูกย้อน
  const batchIds = [...new Set(rows.map((r) => r.batch_id))];
  const live = new Map<string, { by: string | null }>();
  for (const part of chunk(batchIds, 150)) {
    const { data } = await admin.from("erp_image_batches").select("id, actor_name, status").in("id", part);
    for (const b of (data ?? []) as { id: string; actor_name: string | null; status: string }[]) if (b.status === "done") live.set(b.id, { by: b.actor_name });
  }
  const alive = rows.filter((r) => live.has(r.batch_id));
  // ยังอยู่จริงไหม (คนลบออกไปแล้ว = ไม่นับว่าเคยอัป)
  const attIds = alive.filter((r) => GALLERY_DESTS.includes(r.dest) && r.attachment_id).map((r) => r.attachment_id as string);
  const attOk = new Set<string>();
  for (const part of chunk([...new Set(attIds)], 150)) {
    const { data } = await admin.from("erp_playground_attachments").select("id").in("id", part);
    for (const a of (data ?? []) as { id: string }[]) attOk.add(a.id);
  }
  const descRows = alive.filter((r) => r.dest === "desc" && r.asset_id);
  const descOk = new Set<string>();
  for (const part of chunk([...new Set(descRows.map((r) => r.asset_id as string))], 150)) {
    const { data } = await admin.from("asset_usages").select("record_id, asset_id").eq("module", DESCRIPTION_MODULE).in("asset_id", part);
    for (const u of (data ?? []) as { record_id: string; asset_id: string }[]) descOk.add(`${u.record_id}|${u.asset_id}`);
  }
  const keyParents = [...new Set(alive.filter((r) => (r.dest === "png" || WEB_DESTS.includes(r.dest)) && r.r2_key).map((r) => r.parent_id))];
  const pngOf = new Map<string, string | null>();
  const webText = new Map<string, string>();
  for (const part of chunk(keyParents, 150)) {
    const [{ data: ps }, { data: ls }] = await Promise.all([
      admin.from("parent_skus_v2").select("id, png_image_r2_key").in("id", part),
      admin.from("store_listings").select("parent_sku_id, web_sku_images, web_hero").in("parent_sku_id", part),
    ]);
    for (const p of (ps ?? []) as { id: string; png_image_r2_key: string | null }[]) pngOf.set(p.id, p.png_image_r2_key);
    for (const l of (ls ?? []) as { parent_sku_id: string; web_sku_images: unknown; web_hero: unknown }[]) webText.set(l.parent_sku_id, (webText.get(l.parent_sku_id) ?? "") + JSON.stringify([l.web_sku_images, l.web_hero]));
  }
  const out: Record<string, SeenEntry[]> = {};
  for (const r of alive) {
    const exists = GALLERY_DESTS.includes(r.dest)
      ? !!r.attachment_id && attOk.has(r.attachment_id)
      : r.dest === "desc"
        ? !!r.asset_id && descOk.has(`${r.parent_id}|${r.asset_id}`)
        : r.dest === "png"
          ? !!r.r2_key && pngOf.get(r.parent_id) === r.r2_key
          : !!r.r2_key && (webText.get(r.parent_id) ?? "").includes(JSON.stringify(r.r2_key).slice(1, -1));
    if (!exists) continue;
    (out[r.source_sig] ??= []).push({ batchId: r.batch_id, at: r.created_at, by: live.get(r.batch_id)?.by ?? null, parentId: r.parent_id, skuId: r.sku_id, dest: r.dest });
  }
  return out;
}

// ───────────── ย้อนทั้งชุด ─────────────

export interface UndoResult {
  removed: number;
  alreadyGone: number;
  restoredOld: number;
  restoreFailed: number;
  covers: number;
  desc: number;
  png: number;
  pngChanged: number;
  web: number;
  webChanged: number;
  errors: string[];
}

export async function undoImageBatch(admin: Admin, userDb: UserDb, batchId: string, actor: { id: string | null; name: string | null }): Promise<{ ok: true; result: UndoResult } | { ok: false; error: string; status: number }> {
  const { data: bd } = await admin.from("erp_image_batches").select("id, created_at, status, undo_info, parent_ids").eq("id", batchId).maybeSingle();
  const b = bd as { id: string; created_at: string; status: string; undo_info: unknown; parent_ids: string[] } | null;
  if (!b) return { ok: false, error: "ไม่พบชุดอัปนี้", status: 404 };
  if (b.status === "undone") return { ok: false, error: "ชุดนี้ย้อนไปแล้ว", status: 409 };
  const info = parseUndoInfo(b.undo_info);
  const { data: itemRows } = await admin.from("erp_image_batch_items").select("dest, parent_id, attachment_id, asset_id, r2_key, created_at").eq("batch_id", batchId).order("created_at", { ascending: false });
  const items = (itemRows ?? []) as { dest: BatchDest; parent_id: string; attachment_id: string | null; asset_id: string | null; r2_key: string | null }[];
  const res: UndoResult = { removed: 0, alreadyGone: 0, restoredOld: 0, restoreFailed: 0, covers: 0, desc: 0, png: 0, pngChanged: 0, web: 0, webChanged: 0, errors: [] };
  const meta = { via: "image_batch_undo", batch_id: batchId };

  // 1) รูปใหม่ในแกลเลอรี (ใหม่สุดก่อน) — ลบแบบเดียวกับลบทีละรูป: audit "detach" + เก็บเป็นเวอร์ชัน
  for (const it of items.filter((x) => GALLERY_DESTS.includes(x.dest) && x.attachment_id)) {
    const id = it.attachment_id as string;
    const { data: row } = await admin.from("erp_playground_attachments").select("entity_type, entity_id, file_name, file_path, content_type, sort_order, is_primary").eq("id", id).maybeSingle();
    if (!row) {
      res.alreadyGone++;
      continue;
    }
    const { error } = await admin.from("erp_playground_attachments").delete().eq("id", id);
    if (error) {
      res.errors.push(`ลบรูปไม่สำเร็จ: ${error.message}`);
      continue;
    }
    const r = row as RemovedAttachment & { file_path: string | null };
    await admin.from("audit_logs").insert({ action: "detach", entity_type: r.entity_type, entity_id: r.entity_id, actor_user_id: actor.id, metadata: { file_name: r.file_name, actor: actor.name, ...meta } });
    await afterAttachmentRemoved(admin, { id, row: r, filePath: r.file_path, actorId: actor.id, actorName: actor.name });
    res.removed++;
  }

  // 2) โหมดแทนที่: คืนรูปเดิมจาก 🕘 เวอร์ชันที่จดไว้ตอนถูกเอาออก (หลังเอารูปใหม่ออกแล้ว = มีที่ว่างในแกลเลอรี)
  for (const rp of info.replaced) {
    const { data: v } = await admin
      .from("entity_field_history")
      .select("id")
      .eq("entity_type", rp.table)
      .eq("entity_id", rp.entityId)
      .eq("field_key", "gallery")
      .eq("kind", "image")
      .eq("r2_key", rp.key)
      .gte("changed_at", b.created_at)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!v) {
      res.restoreFailed++;
      continue;
    }
    const r = await restoreVersion(admin, (v as { id: string }).id, { actorId: actor.id, actorName: actor.name });
    if (r.ok) res.restoredOld++;
    else res.restoreFailed++;
  }

  // 3) ปกเดิม (ผ่าน RPC กลางด้วยสิทธิ์ผู้ใช้ — trigger ปกตามดาว)
  for (const attId of Object.values(info.prevPrimary)) {
    const { data: exists } = await admin.from("erp_playground_attachments").select("id").eq("id", attId).maybeSingle();
    if (!exists) continue;
    const { error } = await userDb.rpc("erp_playground_attachments_set_primary", { p_id: attId });
    if (error) res.errors.push(`คืนปกเดิมไม่สำเร็จ: ${error.message}`);
    else res.covers++;
  }

  // 4) รูป Description
  for (const it of items.filter((x) => x.dest === "desc" && x.asset_id)) {
    const r = await removeDescriptionImage(admin, { parentId: it.parent_id, assetId: it.asset_id as string, actorId: actor.id, actorName: actor.name, auditMeta: meta });
    if (!r.ok) res.errors.push(`เอารูป Description ออกไม่สำเร็จ: ${r.error}`);
    else if (r.removed) res.desc++;
  }

  // 5) รูปตัด PNG (ใหม่สุดก่อน) — คืนเฉพาะเมื่อยังเป็นรูปที่ชุดนี้ใส่
  for (const p of [...info.png].reverse()) {
    const { data: cur } = await admin.from("parent_skus_v2").select("code, png_image_r2_key").eq("id", p.parentId).maybeSingle();
    const c = cur as { code: string | null; png_image_r2_key: string | null } | null;
    if (!c || c.png_image_r2_key !== p.after) {
      res.pngChanged++;
      continue;
    }
    const { error } = await admin.from("parent_skus_v2").update({ png_image_r2_key: p.before }).eq("id", p.parentId);
    if (error) {
      res.errors.push(`คืนรูปตัด PNG ไม่สำเร็จ: ${error.message}`);
      continue;
    }
    await writeAudit(admin, { action: "update", entityType: "parent_skus_v2", entityId: p.parentId, actorId: actor.id, actorName: actor.name, metadata: { code: c.code, field: "png_image_r2_key", old_value: p.after, new_value: p.before, ...meta } });
    res.png++;
  }
  if (res.png) {
    const { data: shops } = await admin.from("shops").select("id").eq("status", "active");
    await Promise.all(((shops ?? []) as { id: string }[]).map((s) => purgeStorefrontCache(admin, s.id)));
  }

  // 6) รูปบนเว็บ / Hero (เทียบค่าก่อนคืน — มีคนแก้ต่อ = ข้าม)
  if (info.web.length) {
    const w = await undoListingChanges(admin, info.web, actor, meta);
    res.web = w.restored;
    res.webChanged = w.changed.length;
  }

  await admin.from("erp_image_batches").update({ status: "undone", undone_at: new Date().toISOString(), undone_by: actor.id, undone_by_name: actor.name, undo_result: res }).eq("id", batchId);
  await writeAudit(admin, { action: "product_images:undo", entityType: "product_images", entityId: batchId, actorId: actor.id, actorName: actor.name, metadata: { ...meta, parentIds: b.parent_ids, ...res } });
  return { ok: true, result: res };
}
