/**
 * 📚 Design Library — โหลดข้อมูลครบสำหรับ 1 หน้า (ลดการยิงหลายรอบ)
 * GET ?overview=1          → แม่แบบทั้งหมด + จำนวนสูตร + รูปผลล่าสุด (หน้าคลัง)
 * GET ?template_id=<uuid>  → แม่แบบ + สูตรทั้งหมด (+ รูปผลล่าสุดต่อสูตร)
 * GET ?recipe_id=<uuid>    → สูตร + แม่แบบ + ตัวเลือกทั้งหมด + รูปผลทุกเวอร์ชัน + สต็อกสดของ SKU ในสูตร
 * GET ?stock_ids=a,b       → สต็อกสด + ข้อมูลวัสดุ (หน่วย/หน้าผ้า ไม่มีราคา) ของ SKU ที่เพิ่งเลือก (ยังไม่บันทึก)
 * ทุนประมาณ: ส่ง materials (หน่วย/หน้าผ้า) + calc (bom_calc_settings) ให้ทุกคน (ใบสั่งทำตัวอย่างใช้คิดปริมาณ)
 *   spec.cost (ราคา/จำนวนที่แก้เอง) ส่งเฉพาะคนมีสิทธิ์ products.cost.view · ราคาทุน SKU อยู่ที่ /api/design-library/cost
 * สิทธิ์ design_library.view
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { EMPTY_COST } from "@/lib/design-library";
import type { MaterialInfo } from "@/lib/design-library-cost";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadSkuStock } from "@/lib/sku-stock";
import { allSkuIds, cleanSpec } from "@/lib/design-library";
import { VIEW_PERM } from "../_resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;
const fail = (error: string, status = 500) => NextResponse.json({ data: null, error }, { status });
type Render = { recipe_id: string; image_key: string; created_at: string };
type Admin = ReturnType<typeof supabaseAdmin>;

/** ข้อมูลวัสดุ (ไม่มีราคา) ของ SKU — หน่วยซื้อ + หน้าผ้า ใช้คิดปริมาณ */
async function loadMaterials(admin: Admin, ids: string[]): Promise<Record<string, MaterialInfo>> {
  if (!ids.length) return {};
  const { data } = await admin.from("skus_v2").select("id, code, name_th, purchase_uom_en, fabric_width_cm").in("id", ids);
  const out: Record<string, MaterialInfo> = {};
  for (const r of (data ?? []) as { id: string; code: string; name_th: string | null; purchase_uom_en: string | null; fabric_width_cm: number | null }[])
    out[r.id] = { code: r.code, name: r.name_th ?? r.code, uom: r.purchase_uom_en, face_width_cm: Number(r.fabric_width_cm) > 0 ? Number(r.fabric_width_cm) : null };
  return out;
}

/** รูปผลล่าสุดต่อสูตร (ใช้เป็นรูปปกการ์ด) */
function latestByRecipe(rows: Render[]): Map<string, string> {
  const m = new Map<string, { key: string; at: string }>();
  for (const r of rows) { const cur = m.get(r.recipe_id); if (!cur || r.created_at > cur.at) m.set(r.recipe_id, { key: r.image_key, at: r.created_at }); }
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
    const { data: rnd } = ids.length ? await admin.from("design_library_renders").select("recipe_id, image_key, created_at").in("recipe_id", ids).eq("is_active", true) : { data: [] };
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
    const [{ data: tpl }, { data: choices }, { data: renders }, stockMap, materials, { data: calc }] = await Promise.all([
      admin.from("design_library_templates").select("*").eq("id", rec.template_id).maybeSingle(),
      admin.from("design_library_choices").select("*").eq("is_active", true).order("list_key").order("sort_order").order("name"),
      admin.from("design_library_renders").select("*").eq("recipe_id", recipeId).eq("is_active", true).order("view_key").order("version", { ascending: false }),
      loadSkuStock(admin, allSkuIds(spec)).catch(() => new Map()),
      loadMaterials(admin, allSkuIds(spec)).catch(() => ({})),
      admin.from("bom_calc_settings").select("material_type, default_face_width_cm, loss_percent, uom, cm_per_unit").eq("is_active", true),
    ]);
    if (!tpl) return fail("ไม่พบแม่แบบของสูตรนี้", 404);
    const stock: Record<string, number> = {};
    for (const [id, s] of stockMap as Map<string, { onHand: number }>) stock[id] = s.onHand;
    return NextResponse.json({ data: { recipe: { ...rec, spec: canCost ? spec : { ...spec, cost: EMPTY_COST } }, template: tpl, choices: choices ?? [], renders: renders ?? [], stock, materials, calc: calc ?? [], can_cost: canCost }, error: null });
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
