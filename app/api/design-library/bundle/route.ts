/**
 * 📚 Design Library — โหลดข้อมูลครบสำหรับ 1 หน้า (ลดการยิงหลายรอบ)
 * GET ?overview=1          → แม่แบบทั้งหมด + จำนวนสูตร + รูปผลล่าสุด (หน้าคลัง)
 * GET ?template_id=<uuid>  → แม่แบบ + สูตรทั้งหมด (+ รูปผลล่าสุดต่อสูตร)
 * GET ?recipe_id=<uuid>    → สูตร + แม่แบบ + ตัวเลือกทั้งหมด + รูปผลทุกเวอร์ชัน + สต็อกสดของ SKU ในสูตร + ใบงานที่ส่งไปแล้ว (sheet)
 * GET ?stock_ids=a,b       → สต็อกสด + ข้อมูลวัสดุ (หน่วย/หน้าผ้า ไม่มีราคา) ของ SKU ที่เพิ่งเลือก (ยังไม่บันทึก)
 * GET ?logo_sizes=1        → ขนาดโลโก้ที่เคยใส่ในสูตรอื่น (รอบ 8: เลือกโลโก้เดิม → เติมขนาดเดิมให้) — ล่าสุดก่อน · ไม่ซ้ำต่อรูป/คลังรูป/SKU
 * ค่าทำโลโก้ (วิธีทำโลโก้ config.block_fee / unit_fee) = ราคา → ตัดออกให้คนไม่มีสิทธิ์ดูต้นทุน
 * ทุนประมาณ: ส่ง materials (หน่วย/หน้าผ้า) + calc (bom_calc_settings) ให้ทุกคน (ใบสั่งทำตัวอย่างใช้คิดปริมาณ)
 *   spec.cost (ราคา/จำนวนที่แก้เอง) ส่งเฉพาะคนมีสิทธิ์ products.cost.view · ราคาทุน SKU อยู่ที่ /api/design-library/cost
 * สิทธิ์ design_library.view
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { EMPTY_COST } from "@/lib/design-library";
import { loadCalcRows, loadMaterials } from "@/lib/design-library-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadSkuStock } from "@/lib/sku-stock";
import { allSkuIds, cleanSpec } from "@/lib/design-library";
import { VIEW_PERM } from "../_resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;
const fail = (error: string, status = 500) => NextResponse.json({ data: null, error }, { status });
/** ตัดค่าทำโลโก้ (ราคา) ออกจากตัวเลือกสำหรับคนไม่มีสิทธิ์ดูต้นทุน */
const FEE_KEYS = ["block_fee", "unit_fee"];
function hideFees<T extends { list_key?: unknown; config?: unknown }>(rows: T[]): T[] {
  return rows.map((r) => {
    if (r.list_key !== "logo_method" || !r.config || typeof r.config !== "object") return r;
    const c = { ...(r.config as Record<string, unknown>) };
    for (const k of FEE_KEYS) delete c[k];
    return { ...r, config: c };
  });
}
type Render = { recipe_id: string; image_key: string; created_at: string; colorway_id: string | null; is_starred: boolean | null };

/** รูปปกการ์ดต่อสูตร (รอบ 6): รูปติดดาวของสีหลัก > รูปติดดาวชุดสีอื่น > รูปล่าสุด */
function latestByRecipe(rows: Render[]): Map<string, string> {
  const m = new Map<string, { key: string; rank: string }>();
  for (const r of rows) {
    const rank = `${r.is_starred ? (r.colorway_id ? 1 : 2) : 0}|${r.created_at}`;
    const cur = m.get(r.recipe_id); if (!cur || rank > cur.rank) m.set(r.recipe_id, { key: r.image_key, rank });
  }
  return new Map([...m].map(([k, v]) => [k, v.key]));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();

  if (sp.get("overview")) {
    const [{ data: tpls, error }, { data: recs }] = await Promise.all([
      admin.from("design_library_templates").select("*").is("deleted_at", null).eq("is_active", true).order("sort_order").order("created_at", { ascending: false }),
      admin.from("design_library_recipes").select("template_id").is("deleted_at", null).eq("is_active", true),
    ]);
    if (error) return fail("โหลดคลังแม่แบบไม่สำเร็จ กรุณาลองใหม่");
    const count = new Map<string, number>();
    for (const r of (recs ?? []) as { template_id: string }[]) count.set(r.template_id, (count.get(r.template_id) ?? 0) + 1);
    return NextResponse.json({ data: (tpls ?? []).map((t) => ({ ...t, recipe_count: count.get(t.id as string) ?? 0 })), error: null });
  }

  const templateId = sp.get("template_id");
  if (templateId) {
    if (!UUID.test(templateId)) return fail("ไม่พบแม่แบบ", 404);
    const [{ data: tpl }, { data: recs, error }] = await Promise.all([
      admin.from("design_library_templates").select("*").eq("id", templateId).is("deleted_at", null).maybeSingle(),
      admin.from("design_library_recipes").select("id, seq, name, note, spec, created_by_name, updated_by_name, created_at, updated_at").eq("template_id", templateId).is("deleted_at", null).eq("is_active", true).order("seq", { ascending: false }),
    ]);
    if (!tpl) return fail("ไม่พบแม่แบบ (อาจถูกลบไปแล้ว)", 404);
    if (error) return fail("โหลดสูตรไม่สำเร็จ กรุณาลองใหม่");
    const ids = (recs ?? []).map((r) => r.id as string);
    const { data: rnd } = ids.length ? await admin.from("design_library_renders").select("recipe_id, image_key, created_at, colorway_id, is_starred").in("recipe_id", ids).eq("is_active", true) : { data: [] };
    const cover = latestByRecipe((rnd ?? []) as Render[]);
    const recipes = (recs ?? []).map((r) => {
      const spec = cleanSpec(r.spec);
      return { id: r.id, seq: r.seq, name: r.name, note: r.note, created_by_name: r.created_by_name, updated_by_name: r.updated_by_name, created_at: r.created_at, updated_at: r.updated_at, pin_count: spec.pins.length, cover_key: cover.get(r.id as string) ?? null };
    });
    return NextResponse.json({ data: { template: tpl, recipes }, error: null });
  }

  const recipeId = sp.get("recipe_id");
  if (recipeId) {
    if (!UUID.test(recipeId)) return fail("ไม่พบสูตร", 404);
    const { data: rec } = await admin.from("design_library_recipes").select("*").eq("id", recipeId).maybeSingle();
    if (!rec || rec.deleted_at) return fail("ไม่พบสูตร (อาจถูกลบไปแล้ว)", 404);
    const spec = cleanSpec(rec.spec);
    const canCost = await apiCan(request, COST_PERM);
    const [{ data: tpl }, { data: choices }, { data: renders }, stockMap, materials, calc, { data: sheet }] = await Promise.all([
      admin.from("design_library_templates").select("*").eq("id", rec.template_id).maybeSingle(),
      admin.from("design_library_choices").select("*").eq("is_active", true).order("list_key").order("sort_order").order("name"),
      admin.from("design_library_renders").select("*").eq("recipe_id", recipeId).eq("is_active", true).order("view_key").order("version", { ascending: false }),
      loadSkuStock(admin, allSkuIds(spec)).catch(() => new Map()),
      loadMaterials(admin, allSkuIds(spec)).catch(() => ({})),
      loadCalcRows(admin),
      rec.design_sheet_id ? admin.from("design_sheets").select("id, code, name, is_active, status, parent_sku_codes").eq("id", rec.design_sheet_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!tpl) return fail("ไม่พบแม่แบบของสูตรนี้", 404);
    const stock: Record<string, number> = {};
    for (const [id, s] of stockMap as Map<string, { onHand: number }>) stock[id] = s.onHand;
    return NextResponse.json({ data: { recipe: { ...rec, spec: canCost ? spec : { ...spec, cost: EMPTY_COST } }, template: tpl, choices: canCost ? choices ?? [] : hideFees(choices ?? []), renders: renders ?? [], stock, materials, calc, can_cost: canCost, sheet: sheet ?? null }, error: null });
  }

  // ขนาดโลโก้ที่เคยใช้ (อ่านแค่ spec->pins ของ 300 สูตรล่าสุด)
  if (sp.get("logo_sizes")) {
    const { data, error } = await admin.from("design_library_recipes").select("seq, updated_at, pins:spec->pins").is("deleted_at", null).order("updated_at", { ascending: false }).limit(300);
    if (error) return fail("โหลดขนาดโลโก้เดิมไม่สำเร็จ");
    const out: { k: string; w: number; h: number; seq: number }[] = [];
    const seen = new Set<string>();
    for (const r of (data ?? []) as { seq: number; pins: unknown }[]) {
      for (const p of Array.isArray(r.pins) ? r.pins : []) {
        const q = (p ?? {}) as { dim?: { w?: unknown; h?: unknown }; pick?: { kind?: unknown; image_key?: unknown; asset_id?: unknown; material?: { sku_id?: unknown } | null } };
        const w = Number(q.dim?.w), h = Number(q.dim?.h);
        if (q.pick?.kind !== "logo" || !(w > 0) || !(h > 0)) continue;
        const keys = [q.pick.image_key ? `img:${q.pick.image_key}` : "", q.pick.asset_id ? `asset:${q.pick.asset_id}` : "", q.pick.material?.sku_id ? `sku:${q.pick.material.sku_id}` : ""].filter(Boolean);
        for (const k of keys) if (!seen.has(k)) { seen.add(k); out.push({ k, w, h, seq: Number(r.seq) || 0 }); }
      }
    }
    return NextResponse.json({ data: out.slice(0, 500), error: null });
  }

  // สต็อกสดของ SKU ที่เพิ่งเลือก (ยังไม่บันทึกสูตร)
  const stockIds = (sp.get("stock_ids") ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 200);
  if (stockIds.length) {
    const [m, materials] = await Promise.all([loadSkuStock(admin, stockIds).catch(() => null), loadMaterials(admin, stockIds).catch(() => ({}))]);
    if (!m) return fail("โหลดสต็อกไม่สำเร็จ");
    const stock: Record<string, number> = {};
    for (const [id, s] of m) stock[id] = s.onHand;
    return NextResponse.json({ data: { stock, materials }, error: null });
  }

  return fail("ต้องระบุ overview / template_id / recipe_id / stock_ids", 400);
}
