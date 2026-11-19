/**
 * หมวดในร้าน — /api/platform-shop-categories (แผนจัดหมวดต่อร้าน = แบรนด์ × แพลตฟอร์ม · เจ้าของเลือกแบบ A 2026-11-19)
 *
 *  GET  ?brand_id=&platform_id=   (products.platforms.view)
 *       → { cats, items, products, centrals, other_plans, platform } · products = สินค้าที่มีบนร้านนี้ + สินค้าที่อยู่ในแผน
 *  POST { action, ... }            (products.platforms.edit) · เขียนประวัติทุกครั้ง (entity_type platform_shop_category)
 *       create {brand_id, platform_id, name} · rename {id, name} · link_central {id, central_category_id|null}
 *       reorder {brand_id, platform_id, ids[]} · delete {id} (ลงถังขยะ) · restore {id} · purge {id} (ลบถาวร — เฉพาะที่ไม่ค้างบนร้าน)
 *       set_items {category_id, add?[], remove?[], order?[]} · copy_from {brand_id, platform_id, from_platform_id}
 *       mark_done {brand_id, platform_id, key} → { undo } · revert {brand_id, platform_id, undo}
 * กติกาเช็กลิสต์/ติ๊กว่าทำแล้ว = lib/shop-category-plan (ตัวเดียวกับหน้าเว็บ) · ตาราง: supabase/migrations/202611190100_platform_shop_categories.sql
 * ⚠️ ไม่ส่งอะไรขึ้นร้านจริง — แอปจำแผน + สิ่งที่คนติ๊กว่าทำในหลังร้านแล้ว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { fetchAllPages } from "@/lib/fetch-all";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import {
  normCatName, stepEffect, undoOf, validateCatName,
  type CatPatch, type ShopCat, type ShopCatItem, type ShopCatProduct, type StepEffect,
} from "@/lib/shop-category-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const NO_STORE = { "Cache-Control": "no-store" };
const CAT_COLS = "id, brand_id, platform_id, name, sort_order, central_category_id, on_shop, shop_name, shop_sort, deleted_at";
const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const UUID = /^[0-9a-f-]{36}$/i;
const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map(str).filter((x) => UUID.test(x)))] : []);
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

const toCat = (r: Row): ShopCat & { brand_id: string; platform_id: string } => ({
  id: str(r.id), brand_id: str(r.brand_id), platform_id: str(r.platform_id), name: str(r.name), sort_order: Number(r.sort_order ?? 0),
  central_category_id: (r.central_category_id as string) ?? null, on_shop: r.on_shop === true,
  shop_name: (r.shop_name as string) ?? null, shop_sort: r.shop_sort == null ? null : Number(r.shop_sort), deleted_at: (r.deleted_at as string) ?? null,
});
const toItem = (r: Row): ShopCatItem => ({ category_id: str(r.category_id), parent_sku_id: str(r.parent_sku_id), sort_order: Number(r.sort_order ?? 0), in_plan: r.in_plan !== false, on_shop: r.on_shop === true });

async function loadShop(admin: Admin, brandId: string, platformId: string) {
  const { data, error } = await admin.from("platform_shop_categories").select(CAT_COLS).eq("brand_id", brandId).eq("platform_id", platformId);
  if (error) throw new Error(error.message);
  const cats = ((data ?? []) as Row[]).map(toCat);
  let items: ShopCatItem[] = [];
  if (cats.length) {
    const rows = await fetchAllPages<Row>((from, to) => admin.from("platform_shop_category_items").select("category_id, parent_sku_id, sort_order, in_plan, on_shop")
      .in("category_id", cats.map((c) => c.id)).or("in_plan.eq.true,on_shop.eq.true").order("category_id").order("parent_sku_id").range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>);
    items = rows.map(toItem);
  }
  return { cats, items };
}
async function catById(admin: Admin, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await admin.from("platform_shop_categories").select(CAT_COLS).eq("id", id).maybeSingle();
  return data ? toCat(data as Row) : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const brandId = str(sp.get("brand_id")), platformId = str(sp.get("platform_id"));
  if (!UUID.test(brandId) || !UUID.test(platformId)) return NextResponse.json({ error: "ต้องเลือกแบรนด์และร้านก่อน" }, { status: 400, headers: NO_STORE });
  const admin = supabaseAdmin();
  try {
    const [{ cats, items }, listings, { data: pf }, { data: centrals }, { data: others }] = await Promise.all([
      loadShop(admin, brandId, platformId),
      fetchAllPages<Row>((from, to) => admin.from("platform_catalog_listings").select("id, matched_parent_sku_id, created_at")
        .eq("platform_id", platformId).eq("brand_id", brandId).not("matched_parent_sku_id", "is", null).or(LIVE_LISTING_OR)
        .order("id").range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>, { strict: true }),
      admin.from("erp_platforms").select("id, code, name_th").eq("id", platformId).maybeSingle(),
      admin.from("platform_central_categories").select("id, name, sort_order").order("sort_order"),
      admin.from("platform_shop_categories").select("platform_id").eq("brand_id", brandId).neq("platform_id", platformId).is("deleted_at", null),
    ]);
    // สินค้าบนร้าน (วันที่เห็นครั้งแรก = รายการบนร้านที่เก่าสุดของรุ่นนั้น)
    const firstSeen = new Map<string, string>();
    for (const l of listings) {
      const pid = str(l.matched_parent_sku_id); const at = str(l.created_at);
      if (!pid) continue;
      const cur = firstSeen.get(pid);
      if (!cur || (at && at < cur)) firstSeen.set(pid, at);
    }
    const wanted = [...new Set([...firstSeen.keys(), ...items.map((i) => i.parent_sku_id)])];
    const centralName = new Map(((centrals ?? []) as Row[]).map((c) => [str(c.id), str(c.name)]));
    const products: ShopCatProduct[] = [];
    for (let i = 0; i < wanted.length; i += 200) {
      const { data, error } = await admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key, platform_category_id").in("id", wanted.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const p of (data ?? []) as Row[]) {
        const id = str(p.id); const cid = (p.platform_category_id as string) ?? null;
        products.push({ id, code: str(p.code), name: str(p.name_th) || str(p.code), cover: (p.cover_image_r2_key as string) ?? null, central_id: cid, central_name: cid ? centralName.get(cid) ?? null : null, listed: firstSeen.has(id), first_seen: firstSeen.get(id) || null });
      }
    }
    // แผนของร้านอื่นในแบรนด์เดียวกัน (ปุ่มคัดลอกแผน)
    const otherCount = new Map<string, number>();
    for (const o of (others ?? []) as Row[]) otherCount.set(str(o.platform_id), (otherCount.get(str(o.platform_id)) ?? 0) + 1);
    let other_plans: { platform_id: string; name: string; count: number }[] = [];
    if (otherCount.size) {
      const { data: pfs } = await admin.from("erp_platforms").select("id, name_th").in("id", [...otherCount.keys()]);
      other_plans = ((pfs ?? []) as Row[]).map((p) => ({ platform_id: str(p.id), name: str(p.name_th), count: otherCount.get(str(p.id)) ?? 0 }));
    }
    return NextResponse.json({
      cats, items, products,
      centrals: ((centrals ?? []) as Row[]).map((c) => ({ id: str(c.id), name: str(c.name) })),
      other_plans,
      platform: pf ? { id: str((pf as Row).id), code: str((pf as Row).code), name: str((pf as Row).name_th) } : null,
      error: null,
    }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: `โหลดหมวดในร้านไม่สำเร็จ: ${(e as Error).message}` }, { status: 503, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: Row;
  try { body = await request.json(); } catch { return bad("อ่านข้อมูลไม่ได้"); }
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorId = user?.id ?? null; const actorName = user?.email ?? null;
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const action = str(body.action);
  const audit = (act: string, entityId: string | null, metadata: Row) =>
    writeAudit(admin, { action: act, entityType: "platform_shop_category", entityId, actorId, actorName, metadata: { source: "shop_categories", op: action, ...metadata } });

  try {
    switch (action) {
      case "create": {
        const brandId = str(body.brand_id), platformId = str(body.platform_id);
        if (!UUID.test(brandId) || !UUID.test(platformId)) return bad("ต้องเลือกแบรนด์และร้านก่อน");
        const { cats } = await loadShop(admin, brandId, platformId);
        const name = normCatName(str(body.name));
        const err = validateCatName(name, cats); if (err) return bad(err);
        const sort = Math.max(-1, ...cats.filter((c) => !c.deleted_at).map((c) => c.sort_order)) + 1;
        const { data, error } = await admin.from("platform_shop_categories").insert({ brand_id: brandId, platform_id: platformId, name, sort_order: sort, created_by: actorId }).select(CAT_COLS).single();
        if (error) return bad(error.message);
        const cat = toCat(data as Row);
        await audit("create", cat.id, { brand_id: brandId, platform_id: platformId, name });
        return NextResponse.json({ ok: true, cat }, { headers: NO_STORE });
      }
      case "rename": {
        const cat = await catById(admin, str(body.id)); if (!cat) return bad("ไม่พบหมวดนี้", 404);
        const { cats } = await loadShop(admin, cat.brand_id, cat.platform_id);
        const name = normCatName(str(body.name));
        const err = validateCatName(name, cats, cat.id); if (err) return bad(err);
        const { error } = await admin.from("platform_shop_categories").update({ name, updated_at: now }).eq("id", cat.id);
        if (error) return bad(error.message);
        await audit("update", cat.id, { name, changes: auditDiff({ name: cat.name }, { name }) });
        return NextResponse.json({ ok: true, old: cat.name }, { headers: NO_STORE });
      }
      case "link_central": {
        const cat = await catById(admin, str(body.id)); if (!cat) return bad("ไม่พบหมวดนี้", 404);
        const cid = str(body.central_category_id) || null;
        if (cid && !UUID.test(cid)) return bad("หมวดกลางไม่ถูกต้อง");
        const { error } = await admin.from("platform_shop_categories").update({ central_category_id: cid, updated_at: now }).eq("id", cat.id);
        if (error) return bad(error.message);
        await audit("update", cat.id, { name: cat.name, changes: auditDiff({ central_category_id: cat.central_category_id }, { central_category_id: cid }) });
        return NextResponse.json({ ok: true, old: cat.central_category_id }, { headers: NO_STORE });
      }
      case "reorder": {
        const brandId = str(body.brand_id), platformId = str(body.platform_id);
        const order = ids(body.ids);
        const { cats } = await loadShop(admin, brandId, platformId);
        const mine = new Set(cats.filter((c) => !c.deleted_at).map((c) => c.id));
        if (!order.length || order.some((id) => !mine.has(id))) return bad("ลำดับหมวดไม่ตรงกับร้านนี้ — โหลดใหม่แล้วลองอีกครั้ง", 409);
        const before = cats.filter((c) => !c.deleted_at).sort((a, b) => a.sort_order - b.sort_order).map((c) => c.id);
        await Promise.all(order.map((id, i) => admin.from("platform_shop_categories").update({ sort_order: i, updated_at: now }).eq("id", id)));
        await audit("update", null, { brand_id: brandId, platform_id: platformId, changes: [{ field: "order", old: before.length, new: order.length }] });
        return NextResponse.json({ ok: true, before }, { headers: NO_STORE });
      }
      case "delete":
      case "restore": {
        const cat = await catById(admin, str(body.id)); if (!cat) return bad("ไม่พบหมวดนี้", 404);
        if (action === "restore") {
          const { cats } = await loadShop(admin, cat.brand_id, cat.platform_id);
          const err = validateCatName(cat.name, cats, cat.id);
          if (err) return bad(`${err} — เปลี่ยนชื่อหมวดเดิมก่อนกู้คืน`);
        }
        const { error } = await admin.from("platform_shop_categories").update({ deleted_at: action === "delete" ? now : null, updated_at: now }).eq("id", cat.id);
        if (error) return bad(error.message);
        await audit(action, cat.id, { name: cat.name, brand_id: cat.brand_id, platform_id: cat.platform_id });
        return NextResponse.json({ ok: true }, { headers: NO_STORE });
      }
      case "purge": {
        const cat = await catById(admin, str(body.id)); if (!cat) return bad("ไม่พบหมวดนี้", 404);
        if (!cat.deleted_at) return bad("ลบถาวรได้เฉพาะหมวดในถังขยะ");
        if (cat.on_shop) return bad("หมวดนี้ยังค้างบนร้าน — ติ๊ก “ลบหมวดในหลังร้าน” ในเช็กลิสต์ก่อน");
        const { error } = await admin.from("platform_shop_categories").delete().eq("id", cat.id);
        if (error) return bad(error.message);
        await audit("delete", cat.id, { name: cat.name, brand_id: cat.brand_id, platform_id: cat.platform_id, permanent: true });
        return NextResponse.json({ ok: true }, { headers: NO_STORE });
      }
      case "set_items": {
        const cat = await catById(admin, str(body.category_id)); if (!cat) return bad("ไม่พบหมวดนี้", 404);
        if (cat.deleted_at) return bad("หมวดนี้อยู่ในถังขยะ — กู้คืนก่อน");
        const add = ids(body.add), remove = ids(body.remove), order = ids(body.order);
        const { data: cur } = await admin.from("platform_shop_category_items").select("category_id, parent_sku_id, sort_order, in_plan, on_shop").eq("category_id", cat.id);
        const curItems = ((cur ?? []) as Row[]).map(toItem);
        const byPid = new Map(curItems.map((i) => [i.parent_sku_id, i]));
        let next = Math.max(-1, ...curItems.filter((i) => i.in_plan).map((i) => i.sort_order)) + 1;
        const ups = add.filter((pid) => !byPid.get(pid)?.in_plan).map((pid) => ({ category_id: cat.id, parent_sku_id: pid, in_plan: true, sort_order: next++, updated_at: now }));
        if (ups.length) { const { error } = await admin.from("platform_shop_category_items").upsert(ups, { onConflict: "category_id,parent_sku_id" }); if (error) return bad(error.message); }
        const rmOnShop = remove.filter((pid) => byPid.get(pid)?.on_shop);
        const rmGone = remove.filter((pid) => byPid.has(pid) && !byPid.get(pid)!.on_shop);
        if (rmOnShop.length) { const { error } = await admin.from("platform_shop_category_items").update({ in_plan: false, updated_at: now }).eq("category_id", cat.id).in("parent_sku_id", rmOnShop); if (error) return bad(error.message); }
        if (rmGone.length) { const { error } = await admin.from("platform_shop_category_items").delete().eq("category_id", cat.id).in("parent_sku_id", rmGone); if (error) return bad(error.message); }
        if (order.length) await Promise.all(order.map((pid, i) => admin.from("platform_shop_category_items").update({ sort_order: i }).eq("category_id", cat.id).eq("parent_sku_id", pid)));
        if (ups.length || remove.length) await audit("update", cat.id, { name: cat.name, added: ups.length, removed: remove.length, added_ids: ups.map((u) => u.parent_sku_id).slice(0, 50), removed_ids: remove.slice(0, 50) });
        return NextResponse.json({ ok: true, added: ups.length, removed: remove.length }, { headers: NO_STORE });
      }
      case "copy_from": {
        const brandId = str(body.brand_id), platformId = str(body.platform_id), fromId = str(body.from_platform_id);
        if (!UUID.test(brandId) || !UUID.test(platformId) || !UUID.test(fromId) || fromId === platformId) return bad("เลือกร้านที่จะคัดลอกก่อน");
        const [src, dst] = await Promise.all([loadShop(admin, brandId, fromId), loadShop(admin, brandId, platformId)]);
        const have = new Set(dst.cats.filter((c) => !c.deleted_at).map((c) => normCatName(c.name).toLowerCase()));
        let sort = Math.max(-1, ...dst.cats.filter((c) => !c.deleted_at).map((c) => c.sort_order)) + 1;
        let made = 0, itemsMade = 0;
        for (const c of src.cats.filter((x) => !x.deleted_at).sort((a, b) => a.sort_order - b.sort_order)) {
          if (have.has(normCatName(c.name).toLowerCase())) continue;
          const { data, error } = await admin.from("platform_shop_categories").insert({ brand_id: brandId, platform_id: platformId, name: c.name, sort_order: sort++, central_category_id: c.central_category_id, created_by: actorId }).select("id").single();
          if (error) return bad(error.message);
          made++;
          const plan = src.items.filter((i) => i.category_id === c.id && i.in_plan).sort((a, b) => a.sort_order - b.sort_order);
          if (plan.length) {
            const { error: e2 } = await admin.from("platform_shop_category_items").insert(plan.map((i, k) => ({ category_id: str((data as Row).id), parent_sku_id: i.parent_sku_id, sort_order: k, in_plan: true })));
            if (e2) return bad(e2.message);
            itemsMade += plan.length;
          }
        }
        await audit("create", null, { brand_id: brandId, platform_id: platformId, from_platform_id: fromId, categories: made, items: itemsMade });
        return NextResponse.json({ ok: true, categories: made, items: itemsMade }, { headers: NO_STORE });
      }
      case "mark_done":
      case "revert": {
        const brandId = str(body.brand_id), platformId = str(body.platform_id);
        if (!UUID.test(brandId) || !UUID.test(platformId)) return bad("ต้องเลือกแบรนด์และร้านก่อน");
        const { cats, items } = await loadShop(admin, brandId, platformId);
        let eff: StepEffect | null;
        let undo: StepEffect | null = null;
        if (action === "mark_done") {
          eff = stepEffect(str(body.key), cats, items);
          if (!eff) return bad("ข้อนี้ไม่ต้องทำแล้ว (แผนเปลี่ยนไป) — โหลดใหม่", 409);
          undo = undoOf(eff, cats, items);
        } else {
          eff = sanitizeEffect(body.undo, new Set(cats.map((c) => c.id)));
          if (!eff) return bad("ข้อมูลยกเลิกติ๊กไม่ถูกต้อง");
        }
        for (const c of eff.cats) { const { error } = await admin.from("platform_shop_categories").update({ ...c.patch, updated_at: now }).eq("id", c.id); if (error) return bad(error.message); }
        for (const i of eff.items) { const { error } = await admin.from("platform_shop_category_items").update({ ...i.patch, updated_at: now }).eq("category_id", i.category_id).eq("parent_sku_id", i.parent_sku_id); if (error) return bad(error.message); }
        await audit("update", null, { brand_id: brandId, platform_id: platformId, key: str(body.key) || null, cats: eff.cats.length, items: eff.items.length });
        return NextResponse.json({ ok: true, undo }, { headers: NO_STORE });
      }
      default:
        return bad("ไม่รู้จักคำสั่งนี้");
    }
  } catch (e) {
    return bad(`บันทึกไม่สำเร็จ: ${(e as Error).message}`, 500);
  }
}

/** ค่ายกเลิกติ๊กที่หน้าเว็บส่งกลับ — รับเฉพาะหมวดของร้านนี้ และเฉพาะช่องฝั่ง "ทำแล้ว" */
function sanitizeEffect(raw: unknown, catIds: Set<string>): StepEffect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { cats?: unknown; items?: unknown };
  const cats: StepEffect["cats"] = []; const items: StepEffect["items"] = [];
  for (const c of Array.isArray(r.cats) ? r.cats : []) {
    const id = str((c as Row).id); const p = ((c as Row).patch ?? {}) as Row;
    if (!catIds.has(id)) return null;
    const patch: CatPatch = {};
    if ("on_shop" in p) patch.on_shop = p.on_shop === true;
    if ("shop_name" in p) patch.shop_name = p.shop_name == null ? null : str(p.shop_name).slice(0, 60);
    if ("shop_sort" in p) patch.shop_sort = p.shop_sort == null ? null : Math.trunc(Number(p.shop_sort)) || 0;
    cats.push({ id, patch });
  }
  for (const i of Array.isArray(r.items) ? r.items : []) {
    const cid = str((i as Row).category_id), pid = str((i as Row).parent_sku_id);
    if (!catIds.has(cid) || !UUID.test(pid)) return null;
    items.push({ category_id: cid, parent_sku_id: pid, patch: { on_shop: ((i as Row).patch as Row | undefined)?.on_shop === true } });
  }
  return cats.length || items.length ? { cats, items } : null;
}
