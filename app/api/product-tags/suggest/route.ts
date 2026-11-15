/**
 * 🏷️ ระบบช่วยเดาแท็ก — /api/product-tags/suggest (เจ้าของเลือก 2026-11-15 · กฎกลาง lib/tag-suggest-rules)
 *   GET  ?entity=skus|parent-skus → กลุ่มแท็กที่ระบบเดาให้ (จำนวนทั้งหมด + ตัวอย่างไม่เกิน 200 ต่อกลุ่ม)
 *        SKU    : แบรนด์จาก Parent (แน่นอน) + ชนิดวัตถุดิบจากรหัส/ชื่อ (เฉพาะตัวที่ยังไม่มีแท็กวัตถุดิบ/หมวดหมู่สินค้า)
 *        Parent : หมวดหมู่ / แบรนด์ จากช่องของ Parent เอง (เฉพาะตัวที่ยังไม่มีแท็กกลุ่มนั้น)
 *   POST { entity, picks: [{ key, mode: "all"|"only", exclude?, include? }] }
 *        → คำนวณใหม่ฝั่งเซิร์ฟเวอร์ (ไม่เชื่อรายการจากหน้าเว็บ) · กลุ่ม "ควรเช็ก" ใส่ได้เฉพาะตัวที่ติ๊ก · กลุ่มที่ยังไม่มีแท็ก ใส่ไม่ได้
 *        → เคารพกลุ่ม "เลือกได้ 1" · ไม่ลบแท็กเดิม · trigger roll-up ใส่แท็กแม่ให้เอง · audit 1 แถว
 * สิทธิ์: ดู products.view · บันทึก products.edit · ไม่ใช้ AI (ไม่มีค่าใช้จ่าย)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { fetchAllPages, FetchAllError } from "@/lib/fetch-all";
import { CATEGORY_TAG_ALIASES, MATERIAL_RULES, matchTagByName, normName, suggestMaterial, type SuggestConf } from "@/lib/tag-suggest-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Entity = "skus" | "parent-skus";
const JUNCTION: Record<Entity, string> = { skus: "skus_v2_product_family_m2m", "parent-skus": "parent_skus_v2_product_family_m2m" };
const ITEM_CAP = 200;
const UUID = /^[0-9a-f-]{36}$/i;

type Admin = ReturnType<typeof supabaseAdmin>;
type Fam = { id: string; name: string; group_id: string | null; is_active: boolean | null };
type Grp = { id: string; name: string; parent_group_id: string | null; single_select: boolean | null };
type SuggestItem = { id: string; code: string; name: string; image: string | null; tag_id: string; tag: string; reason: string };
type SuggestGroup = { key: string; label: string; tag: string; conf: SuggestConf; count: number; items: SuggestItem[]; missing_tag: boolean };
type Built = { groups: SuggestGroup[]; scanned: number; unmatched: { kind: string; name: string; count: number }[]; current: Map<string, Set<string>>; fams: Fam[]; grps: Grp[] };

const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });
const parseEntity = (v: unknown): Entity | null => (v === "skus" || v === "parent-skus" ? v : null);

/** กลุ่มชื่อนี้ (ชั้นบนสุด) + กลุ่มย่อยทั้งหมด */
function subtree(grps: Grp[], rootName: string): Set<string> {
  const want = normName(rootName);
  const out = new Set(grps.filter((g) => !g.parent_group_id && normName(g.name) === want).map((g) => g.id));
  for (let grew = true; grew;) { grew = false; for (const g of grps) if (g.parent_group_id && out.has(g.parent_group_id) && !out.has(g.id)) { out.add(g.id); grew = true; } }
  return out;
}

async function loadAll<T>(admin: Admin, table: string, select: string, activeOnly: boolean): Promise<T[]> {
  return fetchAllPages<T>((from, to) => {
    let q = admin.from(table).select(select);
    if (activeOnly) q = q.not("is_active", "is", false);
    return q.order("id").range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>;
  }, { strict: true, retries: 2 });
}

function countUnmatched(m: Map<string, number>, kind: string) {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ kind, name, count }));
}

async function build(admin: Admin, entity: Entity): Promise<Built> {
  const [{ data: famRows, error: fe }, { data: grpRows, error: ge }] = await Promise.all([
    admin.from("product_families").select("id, name, group_id, is_active"),
    admin.from("product_family_groups").select("id, name, parent_group_id, single_select"),
  ]);
  if (fe || ge) throw new Error("load tags");
  const fams = (famRows ?? []) as Fam[], grps = (grpRows ?? []) as Grp[];
  const active = fams.filter((f) => f.is_active !== false);
  const inGroups = (ids: Set<string>) => new Set(fams.filter((f) => f.group_id && ids.has(f.group_id)).map((f) => f.id));
  const matG = subtree(grps, "วัตถุดิบ"), catG = subtree(grps, "หมวดหมู่สินค้า"), brandG = subtree(grps, "Brands");
  const matFam = inGroups(matG), catFam = inGroups(catG), brandFam = inGroups(brandG);
  const brandTags = active.filter((f) => brandFam.has(f.id));
  const catTags = active.filter((f) => catFam.has(f.id));

  const links = await loadAll<{ src_id: string; tgt_id: string }>(admin, JUNCTION[entity], "src_id, tgt_id", false);
  const current = new Map<string, Set<string>>();
  for (const l of links) (current.get(l.src_id) ?? current.set(l.src_id, new Set()).get(l.src_id)!).add(l.tgt_id);
  const has = (id: string, set: Set<string>) => [...(current.get(id) ?? [])].some((t) => set.has(t));

  const [{ data: brandRows }, { data: catRows }] = await Promise.all([
    admin.from("brands").select("id, name"),
    entity === "parent-skus" ? admin.from("product_categories").select("id, name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const brandName = new Map(((brandRows ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const catName = new Map(((catRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const groups: SuggestGroup[] = [];
  const unmatchedBrand = new Map<string, number>(), unmatchedCat = new Map<string, number>();

  type P = { id: string; code: string; name_th: string | null; brand_id: string | null; category_id: string | null; cover_image_r2_key: string | null };
  if (entity === "parent-skus") {
    const parents = await loadAll<P>(admin, "parent_skus_v2", "id, code, name_th, brand_id, category_id, cover_image_r2_key", true);
    const cat: SuggestItem[] = [], brand: SuggestItem[] = [];
    for (const p of parents) {
      const base = { id: p.id, code: p.code, name: p.name_th ?? "", image: p.cover_image_r2_key };
      const cn = p.category_id ? catName.get(p.category_id) : null;
      if (cn && !has(p.id, catFam)) {
        const t = matchTagByName(cn, catTags, CATEGORY_TAG_ALIASES);
        if (t) cat.push({ ...base, tag_id: t.id, tag: t.name, reason: `หมวดหมู่ “${cn}”` });
        else unmatchedCat.set(cn, (unmatchedCat.get(cn) ?? 0) + 1);
      }
      const bn = p.brand_id ? brandName.get(p.brand_id) : null;
      if (bn && !has(p.id, brandFam)) {
        const t = matchTagByName(bn, brandTags);
        if (t) brand.push({ ...base, tag_id: t.id, tag: t.name, reason: `แบรนด์ “${bn}”` });
        else unmatchedBrand.set(bn, (unmatchedBrand.get(bn) ?? 0) + 1);
      }
    }
    groups.push({ key: "category", label: "ช่อง “หมวดหมู่” ของ Parent มีค่าอยู่แล้ว", tag: "แท็กหมวดชื่อเดียวกัน", conf: "sure", count: cat.length, items: cat, missing_tag: false });
    groups.push({ key: "brand", label: "ช่อง “แบรนด์” ของ Parent ตั้งไว้แล้ว", tag: "แท็กแบรนด์ชื่อเดียวกัน", conf: "sure", count: brand.length, items: brand, missing_tag: false });
    return { groups, scanned: parents.length, unmatched: [...countUnmatched(unmatchedCat, "category"), ...countUnmatched(unmatchedBrand, "brand")], current, fams, grps };
  }

  type S = { id: string; code: string; name_th: string | null; parent_sku_id: string | null; cover_image_r2_key: string | null };
  const [skus, parents] = await Promise.all([
    loadAll<S>(admin, "skus_v2", "id, code, name_th, parent_sku_id, cover_image_r2_key", true),
    loadAll<P>(admin, "parent_skus_v2", "id, code, name_th, brand_id, category_id, cover_image_r2_key", false),
  ]);
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const matTag = (name: string) => active.find((f) => matFam.has(f.id) && normName(f.name) === normName(name)) ?? active.find((f) => normName(f.name) === normName(name)) ?? null;
  const brand: SuggestItem[] = [];
  const byRule = new Map<string, SuggestItem[]>();
  for (const s of skus) {
    const par = s.parent_sku_id ? parentById.get(s.parent_sku_id) : undefined;
    const name = (s.name_th ?? "").trim() || (par?.name_th ?? "").trim();
    const base = { id: s.id, code: s.code, name: s.name_th?.trim() || name, image: s.cover_image_r2_key };
    const bn = par?.brand_id ? brandName.get(par.brand_id) : null;
    if (bn && !has(s.id, brandFam)) {
      const t = matchTagByName(bn, brandTags);
      if (t) brand.push({ ...base, tag_id: t.id, tag: t.name, reason: `Parent ${par!.code} เป็นแบรนด์ “${bn}”` });
      else unmatchedBrand.set(bn, (unmatchedBrand.get(bn) ?? 0) + 1);
    }
    if (has(s.id, matFam) || has(s.id, catFam)) continue;
    const g = suggestMaterial(s.code, name);
    if (!g) continue;
    const t = matTag(g.rule.tag);
    (byRule.get(g.rule.key) ?? byRule.set(g.rule.key, []).get(g.rule.key)!).push({ ...base, tag_id: t?.id ?? "", tag: g.rule.tag, reason: g.reason });
  }
  groups.push({ key: "parent-brand", label: "Parent ตั้ง “แบรนด์” ไว้แล้ว", tag: "แบรนด์ของ Parent", conf: "sure", count: brand.length, items: brand, missing_tag: false });
  for (const r of MATERIAL_RULES) {
    const items = byRule.get(r.key) ?? [];
    if (!items.length) continue;
    const missing = !items[0].tag_id;
    groups.push({ key: r.key, label: r.label, tag: r.tag, conf: missing ? "new" : r.conf, count: items.length, items, missing_tag: missing });
  }
  return { groups, scanned: skus.length, unmatched: countUnmatched(unmatchedBrand, "brand"), current, fams, grps };
}

const failMsg = (e: unknown) => e instanceof FetchAllError ? "ฐานข้อมูลตอบช้า โหลดข้อมูลไม่ครบ กรุณาลองใหม่อีกครั้ง" : "โหลดคำแนะนำแท็กไม่สำเร็จ กรุณาลองใหม่";

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const entity = parseEntity(new URL(request.url).searchParams.get("entity"));
  if (!entity) return bad("entity ต้องเป็น skus หรือ parent-skus");
  try {
    const b = await build(supabaseAdmin(), entity);
    const groups = b.groups.map((g) => ({ ...g, items: [...g.items].sort((x, y) => x.code.localeCompare(y.code)).slice(0, ITEM_CAP) }));
    return NextResponse.json({ data: { entity, scanned: b.scanned, groups, unmatched: b.unmatched, item_cap: ITEM_CAP }, error: null });
  } catch (e) { return bad(failMsg(e), e instanceof FetchAllError ? 503 : 500); }
}

type Pick = { key: string; mode: "all" | "only"; exclude: Set<string>; include: Set<string> };
const ids = (v: unknown) => new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 20000));

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const body = await request.json().catch(() => null) as { entity?: unknown; picks?: { key?: unknown; mode?: unknown; exclude?: unknown; include?: unknown }[] } | null;
  const entity = parseEntity(body?.entity);
  if (!entity) return bad("entity ต้องเป็น skus หรือ parent-skus");
  const picks: Pick[] = (Array.isArray(body?.picks) ? body!.picks : []).slice(0, 30)
    .map((p) => ({ key: typeof p.key === "string" ? p.key : "", mode: p.mode === "only" ? "only" as const : "all" as const, exclude: ids(p.exclude), include: ids(p.include) }))
    .filter((p) => p.key);
  if (!picks.length) return bad("ยังไม่ได้เลือกกลุ่มที่จะใส่แท็ก");

  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  let b: Built;
  try { b = await build(admin, entity); } catch (e) { return bad(failMsg(e), e instanceof FetchAllError ? 503 : 500); }

  // กลุ่ม "เลือกได้ 1": แท็ก → แท็กอื่นในกลุ่มเดียวกัน
  const singleGroups = new Set(b.grps.filter((g) => g.single_select).map((g) => g.id));
  const groupOf = new Map(b.fams.map((f) => [f.id, f.group_id]));
  const conflicts = (src: string, tag: string) => {
    const gid = groupOf.get(tag);
    if (!gid || !singleGroups.has(gid)) return false;
    return [...(b.current.get(src) ?? [])].some((t) => t !== tag && groupOf.get(t) === gid);
  };

  const rows: { src_id: string; tgt_id: string }[] = [];
  const seen = new Set<string>();
  const perGroup: { key: string; tag: string; count: number }[] = [];
  let blocked = 0;
  for (const p of picks) {
    const g = b.groups.find((x) => x.key === p.key);
    if (!g || g.missing_tag || g.conf === "new") continue;
    const onlyPicked = p.mode === "only" || g.conf === "check";   // กลุ่มควรเช็ก = ใส่เฉพาะที่ติ๊กทีละตัว
    const chosen = g.items.filter((it) => it.tag_id && (onlyPicked ? p.include.has(it.id) : !p.exclude.has(it.id)));
    let n = 0;
    for (const it of chosen) {
      const k = `${it.id}:${it.tag_id}`;
      if (seen.has(k)) continue;
      if (conflicts(it.id, it.tag_id)) { blocked++; continue; }
      seen.add(k); rows.push({ src_id: it.id, tgt_id: it.tag_id }); n++;
      (b.current.get(it.id) ?? b.current.set(it.id, new Set()).get(it.id)!).add(it.tag_id);   // กันชนกันเองในคำขอเดียว
    }
    if (n) perGroup.push({ key: g.key, tag: g.tag, count: n });
  }
  if (!rows.length) return bad(blocked ? `ใส่ไม่ได้ ${blocked.toLocaleString("th-TH")} รายการ เพราะมีแท็กอื่นในกลุ่ม “เลือกได้ 1” อยู่แล้ว` : "ไม่มีรายการที่จะใส่แท็ก (อาจใส่ไปแล้ว ลองโหลดใหม่)");

  let linked = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error, count } = await admin.from(JUNCTION[entity]).upsert(chunk, { onConflict: "src_id,tgt_id", ignoreDuplicates: true, count: "exact" });
    if (error) {
      await writeAudit(admin, { action: "bulk_tag", entityType: entity === "skus" ? "skus_v2" : "parent_skus_v2", actorId: actor.id, actorName: actor.name,
        metadata: { from: "tag_suggest", partial: true, linked, groups: perGroup } });
      return bad(`ใส่แท็กได้ ${linked.toLocaleString("th-TH")} รายการ แล้วสะดุด กรุณากดใหม่ (ตัวที่ใส่แล้วจะไม่ซ้ำ)`, 500);
    }
    linked += count ?? chunk.length;
  }
  await writeAudit(admin, { action: "bulk_tag", entityType: entity === "skus" ? "skus_v2" : "parent_skus_v2", actorId: actor.id, actorName: actor.name,
    metadata: { from: "tag_suggest", entity, linked, blocked_single_select: blocked, groups: perGroup } });
  return NextResponse.json({ data: { linked, blocked, groups: perGroup }, error: null });
}
