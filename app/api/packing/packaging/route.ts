/**
 * 🎁 Set บรรจุภัณฑ์ตอนแพ็ค — /api/packing/packaging   (รอบ 7 · กติกา lib/packaging · ตาราง packaging_sets + parent_skus_v2.pack_set_id/pack_extra/pack_note/pack_flags)
 *
 * GET                       (packing.pack) → { sets (+ items พร้อมรหัส/ชื่อ/รูป · used = จำนวนรุ่นที่ตั้งเอง), categories, tag, can_manage, can_edit_parent }
 * GET ?parent=<id>          (packing.pack) → { parent (+ extra พร้อมข้อมูล SKU · category_set), sets, tag, can_edit_parent }
 * GET ?matrix=1&q=&missing=1&offset=   (packing.pack) → { rows: [{ id, code, name, image_key, category_name, pack_set_id, auto_set_id }], total }   50 รุ่น/หน้า
 * GET ?usage=1&from=&to=    (packing.pack) → { rows: [{ sku_id, code, name, qty }], orders }   บรรจุภัณฑ์ที่ใช้ไป (จากการแพ็คเสร็จ · ไม่ตัดสต๊อก)
 * POST { action:"set_save", id?, name, items, category_ids }   (packing.manage) สร้าง/แก้ Set · SKU ที่เพิ่มติดแท็ก Packaging ให้เอง · หมวดย้ายจาก Set อื่นมา
 * POST { action:"set_copy", id }                                (packing.manage)
 * POST { action:"set_archive", id, archived }                   (packing.manage) ลบ = เข้าถัง (รุ่นที่ใช้อยู่ยังจำ Set เดิม กู้คืนแล้วกลับมา)
 * POST { action:"parent_set", parent_id, pack_set_id?, pack_extra?, pack_note?, pack_flags? }   (packing.manage หรือ products.edit)
 * POST { action:"parent_bulk", items: [{ parent_id, pack_set_id|null }] }   (packing.manage หรือ products.edit) ตั้งหลายรุ่น / ย้อนกลับ (ไม่เกิน 200)
 * ทุกการแก้ลง audit พร้อม changes (ชื่อ Set / รหัส SKU ไม่ใช่ id)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { categorySetMap, cleanPackFlags, cleanPackNote, cleanSetItems, isUuid, sumUsage, PACKAGING_TAG, type PackagingSet, type SetItem } from "@/lib/packaging";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type SkuInfo = { id: string; code: string; name: string; image_key: string | null };
const SET_COLS = "id, name, items, category_ids, sort, is_active";
const PAGE = 50;
const noStore = { "Cache-Control": "no-store" };

async function whoAmI(request: Request, admin: Admin): Promise<{ id: string | null; name: string | null }> {
  try {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    if (!user) return { id: null, name: null };
    const { data } = await admin.from("user_profiles").select("display_name, username, email").eq("id", user.id).maybeSingle();
    const p = data as { display_name?: string; username?: string; email?: string } | null;
    return { id: user.id, name: p?.display_name || p?.username || p?.email || user.email || null };
  } catch { return { id: null, name: null }; }
}

async function loadSets(admin: Admin): Promise<PackagingSet[]> {
  const { data } = await admin.from("packaging_sets").select(SET_COLS).order("sort").order("name");
  return ((data ?? []) as PackagingSet[]).map((s) => ({ ...s, items: cleanSetItems(s.items), category_ids: s.category_ids ?? [] }));
}
async function skuInfo(admin: Admin, ids: string[]): Promise<Map<string, SkuInfo>> {
  const uniq = [...new Set(ids)].filter(isUuid);
  if (!uniq.length) return new Map();
  const { data } = await admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("id", uniq.slice(0, 500));
  return new Map(((data ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), {
    id: String(r.id), code: String(r.code ?? ""), name: String(r.name_th ?? r.code ?? ""),
    image_key: (r.cover_image_r2_key as string | null) ?? ((r.parent_skus_v2 as { cover_image_r2_key?: string | null } | null)?.cover_image_r2_key ?? null),
  }]));
}
async function packagingTag(admin: Admin): Promise<{ id: string; label: string } | null> {
  const { data } = await admin.from("product_families").select("id, name").ilike("name", PACKAGING_TAG).limit(1).maybeSingle();
  return data ? { id: String((data as { id: string }).id), label: String((data as { name: string }).name) } : null;
}
/** ข้อเสนอ 3: SKU ที่อยู่ใน Set/เสริม → ติดแท็ก Packaging ให้ (ถ้ายังไม่ติด) */
async function ensureTagged(admin: Admin, skuIds: string[]): Promise<number> {
  const tag = await packagingTag(admin);
  if (!tag || !skuIds.length) return 0;
  const { data } = await admin.from("skus_v2_product_family_m2m").select("src_id").eq("tgt_id", tag.id).in("src_id", skuIds);
  const has = new Set(((data ?? []) as { src_id: string }[]).map((r) => r.src_id));
  const missing = skuIds.filter((id) => !has.has(id));
  if (missing.length) await admin.from("skus_v2_product_family_m2m").insert(missing.map((src_id) => ({ src_id, tgt_id: tag.id })));
  return missing.length;
}
const canEditParent = async (request: Request) => (await apiCan(request, "packing.manage")) || (await apiCan(request, "products.edit"));
const itemsText = (items: SetItem[], info: Map<string, SkuInfo>) => items.map((i) => `${info.get(i.sku_id)?.code ?? "?"}×${i.qty}`).join(", ") || "-";
const withInfo = (items: SetItem[], info: Map<string, SkuInfo>) => items.map((i) => ({ ...i, code: info.get(i.sku_id)?.code ?? "", name: info.get(i.sku_id)?.name ?? "(ไม่พบ SKU)", image_key: info.get(i.sku_id)?.image_key ?? null }));

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "packing.pack"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;

  if (sp.get("usage") === "1") {
    const from = sp.get("from"), to = sp.get("to");
    let q = admin.from("packing_sessions").select("packaging").eq("status", "done").not("packaging", "is", null);
    if (from && !Number.isNaN(Date.parse(from))) q = q.gte("finished_at", new Date(from).toISOString());
    if (to && !Number.isNaN(Date.parse(to))) q = q.lt("finished_at", new Date(to).toISOString());
    const { data, error } = await q.limit(5000);
    if (error) return NextResponse.json({ rows: [], orders: 0, error: "โหลดรายงานไม่สำเร็จ" }, { status: 500 });
    const list = (data ?? []) as { packaging: unknown }[];
    return NextResponse.json({ rows: sumUsage(list), orders: list.filter((r) => Array.isArray(r.packaging) && (r.packaging as unknown[]).length).length, error: null }, { headers: noStore });
  }

  const sets = await loadSets(admin);
  const byCat = categorySetMap(sets);

  if (sp.get("matrix") === "1") {
    const q = (sp.get("q") ?? "").trim().replace(/[,%()*]/g, " ").slice(0, 60);
    const offset = Math.max(0, Math.round(Number(sp.get("offset")) || 0));
    let query = admin.from("parent_skus_v2").select("id, code, name_th, sku_name, cover_image_r2_key, category_id, pack_set_id, product_categories ( name )", { count: "exact" }).not("is_active", "is", false);
    if (q) query = query.or(`code.ilike.%${q}%,name_th.ilike.%${q}%,sku_name.ilike.%${q}%`);
    if (sp.get("missing") === "1") {
      query = query.is("pack_set_id", null);
      const covered = [...byCat.keys()];
      if (covered.length) query = query.or(`category_id.is.null,category_id.not.in.(${covered.join(",")})`);
    }
    const { data, count, error } = await query.order("code").range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ rows: [], total: 0, error: "โหลดรายการรุ่นไม่สำเร็จ" }, { status: 500 });
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), code: (r.code as string) ?? "", name: (r.name_th as string) || (r.sku_name as string) || "", image_key: (r.cover_image_r2_key as string) ?? null,
      category_name: (r.product_categories as { name?: string } | null)?.name ?? null,
      pack_set_id: (r.pack_set_id as string | null) ?? null,
      auto_set_id: r.category_id ? byCat.get(String(r.category_id))?.id ?? null : null,
    }));
    return NextResponse.json({ rows, total: count ?? rows.length, page_size: PAGE, error: null }, { headers: noStore });
  }

  const allSkuIds = sets.flatMap((s) => s.items.map((i) => i.sku_id));
  const parentId = sp.get("parent");
  if (parentId) {
    if (!isUuid(parentId)) return NextResponse.json({ error: "รหัสรุ่นไม่ถูกต้อง" }, { status: 400 });
    const { data, error } = await admin.from("parent_skus_v2").select("id, code, name_th, sku_name, category_id, pack_set_id, pack_extra, pack_note, pack_flags, product_categories ( name )").eq("id", parentId).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "ไม่พบรุ่นสินค้านี้" }, { status: 404 });
    const r = data as Record<string, unknown>;
    const extra = cleanSetItems(r.pack_extra);
    const info = await skuInfo(admin, [...allSkuIds, ...extra.map((i) => i.sku_id)]);
    const catSet = r.category_id ? byCat.get(String(r.category_id)) ?? null : null;
    return NextResponse.json({
      parent: {
        id: r.id, code: r.code, name: (r.name_th as string) || (r.sku_name as string) || "", category_name: (r.product_categories as { name?: string } | null)?.name ?? null,
        pack_set_id: r.pack_set_id ?? null, pack_extra: withInfo(extra, info), pack_note: r.pack_note ?? null, pack_flags: (r.pack_flags as string[]) ?? [],
        category_set: catSet ? { id: catSet.id, name: catSet.name } : null,
      },
      sets: sets.map((s) => ({ ...s, items: withInfo(s.items, info) })), tag: await packagingTag(admin), can_edit_parent: await canEditParent(request), error: null,
    }, { headers: noStore });
  }

  const [info, cats, used, tag] = await Promise.all([
    skuInfo(admin, allSkuIds),
    admin.from("product_categories").select("id, name").order("name").then((r) => (r.data ?? []) as { id: string; name: string }[]),
    admin.from("parent_skus_v2").select("pack_set_id").not("pack_set_id", "is", null).limit(5000).then((r) => (r.data ?? []) as { pack_set_id: string }[]),
    packagingTag(admin),
  ]);
  const usedCount = new Map<string, number>();
  for (const u of used) usedCount.set(u.pack_set_id, (usedCount.get(u.pack_set_id) ?? 0) + 1);
  return NextResponse.json({
    sets: sets.map((s) => ({ ...s, items: withInfo(s.items, info), used: usedCount.get(s.id) ?? 0 })),
    categories: cats, tag, can_manage: await apiCan(request, "packing.manage"), can_edit_parent: await canEditParent(request), error: null,
  }, { headers: noStore });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "packing.pack"); if (denied) return denied;
  const admin = supabaseAdmin();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const me = await whoAmI(request, admin);
  const now = new Date().toISOString();

  // ── Set (หัวหน้าแพ็ค) ──
  if (action === "set_save" || action === "set_copy" || action === "set_archive") {
    if (!(await apiCan(request, "packing.manage"))) return NextResponse.json({ error: "ต้องเป็นหัวหน้าแพ็คถึงจะแก้ Set บรรจุภัณฑ์ได้" }, { status: 403 });
    const sets = await loadSets(admin);
    const cur = isUuid(body.id) ? sets.find((s) => s.id === body.id) : undefined;
    if (body.id !== undefined && body.id !== null && !cur) return NextResponse.json({ error: "ไม่พบ Set นี้" }, { status: 404 });

    if (action === "set_archive") {
      if (!cur) return NextResponse.json({ error: "ไม่พบ Set นี้" }, { status: 404 });
      const active = body.archived !== true;
      const { error } = await admin.from("packaging_sets").update({ is_active: active, updated_at: now, updated_by: me.id }).eq("id", cur.id);
      if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
      await writeAudit(admin, { action: active ? "packing.set_restore" : "packing.set_archive", entityType: "packaging_sets", entityId: cur.id, actorId: me.id, actorName: me.name, metadata: { name: cur.name, changes: auditDiff({ สถานะ: cur.is_active ? "ใช้งาน" : "ในถัง" }, { สถานะ: active ? "ใช้งาน" : "ในถัง" }) } });
      return NextResponse.json({ ok: true, error: null });
    }
    if (action === "set_copy") {
      if (!cur) return NextResponse.json({ error: "ไม่พบ Set นี้" }, { status: 404 });
      const { data, error } = await admin.from("packaging_sets").insert({ name: `${cur.name} (สำเนา)`.slice(0, 80), items: cur.items, category_ids: [], sort: Math.max(0, ...sets.map((s) => s.sort)) + 1, updated_by: me.id }).select("id").single();
      if (error) return NextResponse.json({ error: "คัดลอกไม่สำเร็จ" }, { status: 500 });
      await writeAudit(admin, { action: "packing.set_create", entityType: "packaging_sets", entityId: String(data.id), actorId: me.id, actorName: me.name, metadata: { name: `${cur.name} (สำเนา)`, copied_from: cur.name } });
      return NextResponse.json({ ok: true, id: data.id, error: null });
    }

    // set_save
    const name = body.name !== undefined ? String(body.name ?? "").trim().slice(0, 80) : cur?.name ?? "";
    if (!name) return NextResponse.json({ error: "ใส่ชื่อ Set ก่อน" }, { status: 400 });
    if (sets.some((s) => s.is_active && s.id !== cur?.id && s.name === name)) return NextResponse.json({ error: "มีชื่อ Set นี้อยู่แล้ว" }, { status: 400 });
    let items = body.items !== undefined ? cleanSetItems(body.items) : cur?.items ?? [];
    const info = await skuInfo(admin, [...items.map((i) => i.sku_id), ...(cur?.items ?? []).map((i) => i.sku_id)]);
    items = items.filter((i) => info.has(i.sku_id));   // SKU ต้องมีจริง
    const catIds = body.category_ids !== undefined ? [...new Set((Array.isArray(body.category_ids) ? body.category_ids : []).filter(isUuid))].slice(0, 100) : cur?.category_ids ?? [];
    const patch = { name, items, category_ids: catIds, updated_at: now, updated_by: me.id };
    let id = cur?.id ?? null;
    if (cur) {
      const { error } = await admin.from("packaging_sets").update(patch).eq("id", cur.id);
      if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
    } else {
      const { data, error } = await admin.from("packaging_sets").insert({ ...patch, sort: Math.max(0, ...sets.map((s) => s.sort)) + 1 }).select("id").single();
      if (error) return NextResponse.json({ error: "สร้าง Set ไม่สำเร็จ" }, { status: 500 });
      id = String(data.id);
    }
    // ข้อ 2: 1 หมวด = 1 Set → เอาหมวดที่เพิ่งเลือกออกจาก Set อื่น
    const moved: string[] = [];
    for (const s of sets) {
      if (s.id === id || !s.category_ids.some((c) => catIds.includes(c))) continue;
      await admin.from("packaging_sets").update({ category_ids: s.category_ids.filter((c) => !catIds.includes(c)), updated_at: now, updated_by: me.id }).eq("id", s.id);
      moved.push(s.name);
    }
    const tagged = await ensureTagged(admin, items.map((i) => i.sku_id));
    const changes = auditDiff(
      { ชื่อ: cur?.name ?? "", รายการ: itemsText(cur?.items ?? [], info), หมวดที่ใช้: (cur?.category_ids ?? []).length },
      { ชื่อ: name, รายการ: itemsText(items, info), หมวดที่ใช้: catIds.length },
    );
    await writeAudit(admin, { action: cur ? "packing.set_update" : "packing.set_create", entityType: "packaging_sets", entityId: String(id), actorId: me.id, actorName: me.name, metadata: { name, changes, moved_categories_from: moved.length ? moved : undefined, tagged: tagged || undefined } });
    return NextResponse.json({ ok: true, id, tagged, moved, error: null });
  }

  // ── ตั้งค่าต่อรุ่น (หัวหน้าแพ็ค หรือคนแก้สินค้าได้) ──
  if (action === "parent_set" || action === "parent_bulk") {
    if (!(await canEditParent(request))) return NextResponse.json({ error: "ไม่มีสิทธิ์แก้การแพ็คของสินค้า" }, { status: 403 });
    const sets = await loadSets(admin);
    const setName = (id: string | null) => (id ? sets.find((s) => s.id === id)?.name ?? "(ไม่พบ Set)" : "ไม่ตั้ง (ใช้ของหมวด)");

    if (action === "parent_bulk") {
      const list = (Array.isArray(body.items) ? body.items : []).slice(0, 200) as { parent_id?: unknown; pack_set_id?: unknown }[];
      const want = list.filter((x) => isUuid(x.parent_id)).map((x) => ({ id: String(x.parent_id), set: isUuid(x.pack_set_id) && sets.some((s) => s.id === x.pack_set_id) ? String(x.pack_set_id) : null }));
      if (!want.length) return NextResponse.json({ error: "ไม่ได้เลือกรุ่น" }, { status: 400 });
      const { data: curRows } = await admin.from("parent_skus_v2").select("id, code, pack_set_id").in("id", want.map((w) => w.id));
      const curMap = new Map(((curRows ?? []) as { id: string; code: string; pack_set_id: string | null }[]).map((r) => [r.id, r]));
      const prev: { parent_id: string; pack_set_id: string | null }[] = [];
      let changed = 0;
      // จัดกลุ่มตาม Set ปลายทาง → update ทีละกลุ่ม
      const groups = new Map<string, string[]>();
      for (const w of want) {
        const c = curMap.get(w.id);
        if (!c || c.pack_set_id === w.set) continue;
        prev.push({ parent_id: w.id, pack_set_id: c.pack_set_id });
        const k = w.set ?? "";
        groups.set(k, [...(groups.get(k) ?? []), w.id]);
      }
      for (const [k, ids] of groups) {
        const { error } = await admin.from("parent_skus_v2").update({ pack_set_id: k || null }).in("id", ids);
        if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ", prev }, { status: 500 });
        changed += ids.length;
      }
      if (prev.length) {
        await admin.from("audit_logs").insert(prev.map((p) => {
          const to = want.find((w) => w.id === p.parent_id)?.set ?? null;
          return { actor_user_id: me.id, action: "packing.parent_packaging", entity_type: "parent_skus_v2", entity_id: p.parent_id, metadata: { actor: me.name, code: curMap.get(p.parent_id)?.code, bulk: true, changes: auditDiff({ Set: setName(p.pack_set_id) }, { Set: setName(to) }) } };
        }));
      }
      return NextResponse.json({ ok: true, changed, prev, error: null });
    }

    if (!isUuid(body.parent_id)) return NextResponse.json({ error: "รหัสรุ่นไม่ถูกต้อง" }, { status: 400 });
    const { data: cur } = await admin.from("parent_skus_v2").select("id, code, pack_set_id, pack_extra, pack_note, pack_flags").eq("id", body.parent_id).maybeSingle();
    if (!cur) return NextResponse.json({ error: "ไม่พบรุ่นสินค้านี้" }, { status: 404 });
    const c = cur as { id: string; code: string; pack_set_id: string | null; pack_extra: unknown; pack_note: string | null; pack_flags: string[] | null };
    const patch: Record<string, unknown> = {};
    if (body.pack_set_id !== undefined) {
      if (body.pack_set_id !== null && !(isUuid(body.pack_set_id) && sets.some((s) => s.id === body.pack_set_id))) return NextResponse.json({ error: "ไม่พบ Set นี้" }, { status: 400 });
      patch.pack_set_id = body.pack_set_id;
    }
    const oldExtra = cleanSetItems(c.pack_extra);
    let newExtra = oldExtra;
    if (body.pack_extra !== undefined) newExtra = patch.pack_extra = cleanSetItems(body.pack_extra) as SetItem[];
    if (body.pack_note !== undefined) patch.pack_note = cleanPackNote(body.pack_note);
    if (body.pack_flags !== undefined) patch.pack_flags = cleanPackFlags(body.pack_flags);
    const info = await skuInfo(admin, [...oldExtra, ...newExtra].map((i) => i.sku_id));
    if (patch.pack_extra) newExtra = patch.pack_extra = newExtra.filter((i) => info.has(i.sku_id));
    const changes = auditDiff(
      { Set: setName(c.pack_set_id), SKUเสริม: itemsText(oldExtra, info), โน้ตตอนแพ็ค: c.pack_note ?? "", ป้ายเตือน: (c.pack_flags ?? []).join(", ") },
      {
        Set: setName(patch.pack_set_id !== undefined ? (patch.pack_set_id as string | null) : c.pack_set_id), SKUเสริม: itemsText(newExtra, info),
        โน้ตตอนแพ็ค: patch.pack_note !== undefined ? (patch.pack_note as string | null) ?? "" : c.pack_note ?? "",
        ป้ายเตือน: patch.pack_flags !== undefined ? (patch.pack_flags as string[]).join(", ") : (c.pack_flags ?? []).join(", "),
      },
    );
    if (!changes.length) return NextResponse.json({ ok: true, unchanged: true, error: null });
    const { error } = await admin.from("parent_skus_v2").update(patch).eq("id", c.id);
    if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
    const tagged = patch.pack_extra ? await ensureTagged(admin, newExtra.map((i) => i.sku_id)) : 0;
    await writeAudit(admin, { action: "packing.parent_packaging", entityType: "parent_skus_v2", entityId: c.id, actorId: me.id, actorName: me.name, metadata: { code: c.code, changes, tagged: tagged || undefined } });
    return NextResponse.json({ ok: true, tagged, error: null });
  }

  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}
