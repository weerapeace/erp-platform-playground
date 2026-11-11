/**
 * อ่าน "รายการที่ผูกกับรุ่นสินค้า" ตามทะเบียนกลาง lib/parent-links-registry (server เท่านั้น)
 *   ทุกแหล่งยิงขนานกัน · แต่ละวิธีผูก (match) = 1 คำสั่ง แล้วรวม + ตัดซ้ำด้วย id
 *   แหล่งไหนพัง (ตารางถูกเปลี่ยน/ไม่มีสิทธิ์) → ข้ามแหล่งนั้น + บอก error ไม่ทำให้ทั้งหน้าพัง
 * ใช้ที่ GET /api/parent-skus/[id]/links
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINK_GROUPS, PARENT_LINK_SOURCES, type LinkItem, type LinkMatch, type ParentLinkSource } from "@/lib/parent-links-registry";

type Row = Record<string, unknown>;
/** เอามาโชว์ต่อแหล่งสูงสุดกี่แถว (นับเกินได้ถึง LIMIT → โชว์ "LIMIT+") */
export const PARENT_LINK_LIMIT = 60;

export type ParentLinkCtx = { parentId: string; parentCode: string; skuIds: string[]; skuCodes: string[] };
export type ParentLinkResult = {
  key: string; group: string; label: string; icon: string; thumbnails: boolean; hint: string | null; listHref: string | null;
  total: number; more: boolean; items: LinkItem[]; error: string | null;
  /** แหล่งค้นช้า ยังไม่ได้โหลด (หน้าจอโชว์ปุ่มให้กดค้น) */
  lazy: boolean;
};

/** เวลาสูงสุดต่อแหล่ง — แหล่งไหนช้ากว่านี้ = ตัดทิ้ง แจ้ง "ช้าเกินไป" (หน้าไม่ต้องรอทั้งก้อน) */
export const PARENT_LINK_TIMEOUT_MS = 8000;

async function idsVia(a: SupabaseClient, m: Extract<LinkMatch, { by: "via" }>, parentId: string): Promise<string[]> {
  const { data, error } = await a.from(m.table).select(m.idColumn).eq(m.parentColumn, parentId).limit(PARENT_LINK_LIMIT);
  if (error) throw new Error(error.message);
  return [...new Set(((data ?? []) as unknown as Row[]).map((r) => String(r[m.idColumn] ?? "")).filter(Boolean))];
}

/** บรรทัดเอกสารที่มี SKU ลูก → id หัวเอกสาร (ทีละ 100 รหัส · ตัดซ้ำ · สูงสุด PARENT_LINK_LIMIT×5 บรรทัด) */
async function idsViaSku(a: SupabaseClient, m: Extract<LinkMatch, { by: "via_sku" }>, ctx: ParentLinkCtx): Promise<string[]> {
  const keys = m.skuKind === "code" ? ctx.skuCodes : ctx.skuIds;
  if (keys.length === 0) return [];
  const out = new Set<string>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await a.from(m.table).select(m.idColumn).in(m.skuColumn, keys.slice(i, i + 100)).limit(PARENT_LINK_LIMIT * 5);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as unknown as Row[]) { const id = String(r[m.idColumn] ?? ""); if (id) out.add(id); }
  }
  return [...out];
}

async function runMatch(a: SupabaseClient, src: ParentLinkSource, m: LinkMatch, ctx: ParentLinkCtx): Promise<Row[]> {
  let q = a.from(src.table).select(src.select);
  switch (m.by) {
    case "parent_id": q = q.eq(m.column, ctx.parentId); break;
    case "parent_code": if (!ctx.parentCode) return []; q = q.eq(m.column, ctx.parentCode); break;
    // คอลัมน์ jsonb array (["WK46", ...]) — ต้องส่งเป็น JSON ไม่ใช่ array ของ Postgres ({...}) ไม่งั้น PostgREST ตอบ error
    case "parent_codes": if (!ctx.parentCode) return []; q = q.filter(m.column, "cs", JSON.stringify([ctx.parentCode])); break;
    case "sku_ids": if (ctx.skuIds.length === 0) return []; q = q.in(m.column, ctx.skuIds); break;
    case "sku_codes": if (ctx.skuCodes.length === 0) return []; q = q.in(m.column, ctx.skuCodes); break;
    case "via": { const ids = await idsVia(a, m, ctx.parentId); if (ids.length === 0) return []; q = q.in("id", ids); break; }
    case "via_sku": { const ids = await idsViaSku(a, m, ctx); if (ids.length === 0) return []; q = q.in("id", ids.slice(0, 300)); break; }
  }
  if (src.notFalse) q = q.not(src.notFalse, "is", false);
  if (src.mustBeNull) q = q.is(src.mustBeNull, null);
  if (src.order) q = q.order(src.order.column, { ascending: !!src.order.ascending, nullsFirst: false });
  const { data, error } = await q.limit(PARENT_LINK_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Row[];
}

/** อัลบั้ม: รูปปก = ไฟล์แรกที่เลือกไว้ใน assets */
async function enrichAlbums(a: SupabaseClient, rows: Row[]): Promise<void> {
  const first = rows.map((r) => (Array.isArray(r.picked_asset_ids) && r.picked_asset_ids.length ? String(r.picked_asset_ids[0]) : "")).filter(Boolean);
  if (first.length === 0) return;
  const { data } = await a.from("assets").select("id, r2_key").in("id", first.slice(0, PARENT_LINK_LIMIT));
  const key = new Map(((data ?? []) as Row[]).map((x) => [String(x.id), String(x.r2_key ?? "")]));
  for (const r of rows) if (Array.isArray(r.picked_asset_ids) && r.picked_asset_ids.length) r._cover_key = key.get(String(r.picked_asset_ids[0])) ?? null;
}

async function loadSource(a: SupabaseClient, src: ParentLinkSource, ctx: ParentLinkCtx, skip: boolean): Promise<ParentLinkResult> {
  const base = {
    key: src.key, group: src.group, label: src.label, icon: src.icon, thumbnails: !!src.thumbnails, hint: src.hint ?? null, lazy: skip,
    listHref: src.listHref?.({ parentId: ctx.parentId, parentCode: ctx.parentCode }) ?? null,
  };
  if (skip) return { ...base, total: 0, more: false, items: [], error: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("ค้นช้าเกินไป ลองใหม่อีกครั้ง")), PARENT_LINK_TIMEOUT_MS); });
    const parts = await Promise.race([Promise.all(src.match.map((m) => runMatch(a, src, m, ctx))), timeout]);
    const seen = new Set<string>(); const rows: Row[] = [];
    for (const r of parts.flat()) { const id = String(r.id ?? ""); if (id && !seen.has(id)) { seen.add(id); rows.push(r); } }
    if (src.order) {
      const col = src.order.column; const asc = !!src.order.ascending;
      rows.sort((x, y) => String(x[col] ?? "").localeCompare(String(y[col] ?? "")) * (asc ? 1 : -1));
    }
    if (src.key === "content_albums") await enrichAlbums(a, rows);
    const more = parts.some((p) => p.length >= PARENT_LINK_LIMIT);
    return { ...base, total: rows.length, more, items: rows.slice(0, PARENT_LINK_LIMIT).map(src.toItem), error: null };
  } catch (e) {
    return { ...base, total: 0, more: false, items: [], error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
  } finally { if (timer) clearTimeout(timer); }
}

/** only = โหลดเฉพาะแหล่งเหล่านี้ (ใช้กดค้นแหล่งช้า) · ไม่ส่ง = ทุกแหล่ง ยกเว้นแหล่งช้า (lazy) ที่คืนเป็นปุ่มให้กด */
export async function loadParentLinks(a: SupabaseClient, ctx: ParentLinkCtx, opts: { only?: string[] } = {}): Promise<{ groups: typeof LINK_GROUPS; sources: ParentLinkResult[] }> {
  const list = opts.only?.length ? PARENT_LINK_SOURCES.filter((s) => opts.only!.includes(s.key)) : PARENT_LINK_SOURCES;
  const sources = await Promise.all(list.map((src) => loadSource(a, src, ctx, !opts.only?.length && !!src.lazy)));
  return { groups: LINK_GROUPS, sources };
}
