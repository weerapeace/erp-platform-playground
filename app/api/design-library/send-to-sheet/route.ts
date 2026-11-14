/**
 * 📚 Design Library → ส่งสูตรเป็นใบงานออกแบบ (รอบ 5 ช่วง 3)
 *
 * POST { recipe_id, mode: "new" | "attach", sheet_id?, name?, brand_id?, colorway_id?, expect_sheet_id?,
 *        include: { images, spec, colors, cost } }
 *   new    = ออกเลข DS ใหม่ (ระบบเลขเดิม nextDsNo) + รายละเอียดงานลิงก์กลับสูตร + ⏳ ข้อตั้งต้นแบบสร้างใบปกติ
 *   attach = แนบเข้าใบที่มีอยู่ · ไม่ลบของเดิมในใบ
 *   ของที่ส่ง (แปลงด้วย lib/design-library-sheet):
 *     images = รูปผล GPT ล่าสุดทุกชุดสี → ไฟล์แนบใบงาน (key เดิม · แนบแล้วข้าม)
 *     spec   = หน้ารูปแม่แบบ + หมุดวัสดุ (ชุดสีที่เลือก) → แท็บรายละเอียดงาน · หน้าชื่อเดียวกัน (ส่งซ้ำ) = แทน
 *     colors = ทุกชุดสี → ตารางสีใบงาน (รวมกับของเดิม)
 *     cost   = ทุนประมาณ (ชุดสีที่เลือก) → ตารางตีราคา ต่อท้าย · ต้องมี products.cost.view (ไม่มี = ข้ามเงียบ ๆ)
 *   แล้วจำใบงานไว้ที่สูตร (design_library_recipes.design_sheet_id) — ช่วง 4 สร้าง SKU/BOM ต่อจากใบงานนี้
 * สิทธิ์: design_library.edit + products.edit (สิทธิ์สร้าง/แก้ใบงาน) · audit ทั้งฝั่งใบงานและฝั่งสูตร
 * พลาดบางส่วน = ใบงานยังอยู่ ตอบ warnings ให้ผู้ใช้รู้ว่าส่วนไหนไม่เข้า
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { r2ImageUrl } from "@/lib/r2-image";
import { applyColorway, allSkuIds, cleanSpec, colorwayLabel, type Choice } from "@/lib/design-library";
import { calcSettingsFrom, estimateCost } from "@/lib/design-library-cost";
import { latestRenders, mergeColorTables, recipeColorTable, recipeCostRows, recipePagePins, recipeTag, sheetDetailHtml, specPageTitle, type RenderRow } from "@/lib/design-library-sheet";
import { loadCalcRows, loadCostPrices, loadMaterials } from "@/lib/design-library-server";
import { cleanSpecColors } from "@/lib/design-sheet-spec-colors";
import { seedChecklistOnCreate } from "@/lib/record-tasks-server";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";
import { nextDsNo } from "../../design-sheets/shared";
import { EDIT_PERM } from "../_resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

type Body = {
  recipe_id?: string; mode?: string; sheet_id?: string | null; name?: string; brand_id?: string | null;
  colorway_id?: string | null; expect_sheet_id?: string | null;
  include?: { images?: boolean; spec?: boolean; colors?: boolean; cost?: boolean };
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  if (!(await apiCan(request, "products.edit"))) return bad("ต้องมีสิทธิ์แก้ไขใบงานออกแบบ (products.edit) ถึงจะส่งเป็นใบงานได้", 403);
  let body: Body;
  try { body = await request.json(); } catch { return bad("ข้อมูลไม่ถูกต้อง"); }
  const recipeId = String(body.recipe_id ?? "");
  if (!UUID.test(recipeId)) return bad("ไม่พบสูตร", 404);
  const mode = body.mode === "attach" ? "attach" : "new";
  const inc = { images: body.include?.images !== false, spec: body.include?.spec !== false, colors: body.include?.colors !== false, cost: body.include?.cost !== false };
  const canCost = inc.cost && (await apiCan(request, COST_PERM));

  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const { data: rec } = await admin.from("design_library_recipes").select("*").eq("id", recipeId).maybeSingle();
  if (!rec || rec.deleted_at) return bad("ไม่พบสูตร (อาจถูกลบไปแล้ว)", 404);
  const linked = (rec.design_sheet_id as string | null) ?? null;
  const spec = cleanSpec(rec.spec);
  const cwId = body.colorway_id && spec.colorways.some((c) => c.id === body.colorway_id) ? body.colorway_id : null;
  const view = applyColorway(spec, cwId);
  const cwName = cwId ? colorwayLabel(spec, cwId) : spec.colorways.length ? colorwayLabel(spec, null) : null;

  const [{ data: tpl }, { data: choicesRaw }, { data: rendersRaw }, materials, calcRows, prices] = await Promise.all([
    admin.from("design_library_templates").select("id, code, name, image_key, image_w, image_h").eq("id", rec.template_id).maybeSingle(),
    admin.from("design_library_choices").select("*").eq("is_active", true),
    admin.from("design_library_renders").select("id, view_key, version, image_key, colorway_id, created_at").eq("recipe_id", recipeId).eq("is_active", true),
    loadMaterials(admin, allSkuIds(spec)).catch(() => ({})),
    loadCalcRows(admin).catch(() => []),
    canCost ? loadCostPrices(admin, allSkuIds(spec)) : Promise.resolve({}),
  ]);
  if (!tpl) return bad("ไม่พบแม่แบบของสูตรนี้", 404);
  const choices = (choicesRaw ?? []) as Choice[];
  const tag = recipeTag(String(tpl.code), Number(rec.seq));

  // ── ใบงานปลายทาง ──
  let sheet: { id: string; code: string; name: string };
  let created = false;
  if (mode === "attach") {
    const sid = String(body.sheet_id ?? "");
    if (!UUID.test(sid)) return bad("เลือกใบงานที่จะแนบก่อน");
    const { data: s } = await admin.from("design_sheets").select("id, code, name, is_active").eq("id", sid).maybeSingle();
    if (!s) return bad("ไม่พบใบงานนี้ (อาจถูกลบไปแล้ว)", 404);
    sheet = { id: String(s.id), code: String(s.code), name: String(s.name) };
  } else {
    // กันกดซ้ำ / สองคนส่งพร้อมกันได้ใบงานซ้ำ: หน้าจอส่งใบงานที่ผูกอยู่ตอนเปิดป๊อปมา ต้องตรงกับในฐานข้อมูล
    if ((body.expect_sheet_id ?? null) !== linked) return bad("สูตรนี้เพิ่งถูกส่งเป็นใบงานไปแล้ว — โหลดหน้าใหม่ก่อน", 409);
    const name = String(body.name ?? "").trim().slice(0, 200) || `${tpl.name} · ${rec.name || tag}`;
    const brandId = body.brand_id && UUID.test(body.brand_id) ? body.brand_id : null;
    const code = await nextDsNo(admin);
    const { data: row, error } = await admin.from("design_sheets").insert({
      code, name, brand_id: brandId, status: "design", is_active: true, created_by: actor.id,
      detail: sheetDetailHtml({ recipeId, tag, templateName: String(tpl.name), size: spec.size, colorways: [colorwayLabel(spec, null), ...spec.colorways.map((c) => c.name)], note: (rec.note as string | null) ?? null }),
      parent_sku_codes: [], parent_sku_drafts: [],
    }).select("id, code, name").single();
    if (error || !row) return bad("สร้างใบงานไม่สำเร็จ กรุณาลองใหม่", 500);
    sheet = { id: String(row.id), code: String(row.code), name: String(row.name) };
    created = true;
    await writeAudit(admin, { action: "create", entityType: "design_sheet", entityId: sheet.id, actorId: actor.id, actorName: actor.name, metadata: { code, name, from_design_library: recipeId, recipe: tag } });
    await seedChecklistOnCreate(admin, DESIGN_WAITING.moduleKey, sheet.id, { id: actor.id, name: actor.name ?? "system" }, null).catch(() => []);
  }

  const warnings: string[] = [];
  const counts = { images: 0, pins: 0, colorways: 0, cost_lines: 0 };

  // ── รูปผล GPT → ไฟล์แนบ ──
  if (inc.images) {
    const latest = latestRenders((rendersRaw ?? []) as RenderRow[]);
    if (latest.length) {
      const { data: had } = await admin.from("erp_playground_attachments").select("file_path, sort_order").eq("entity_type", "design_sheet").eq("entity_id", sheet.id);
      const have = new Set((had ?? []).map((a) => String(a.file_path)));
      let order = Math.max(0, ...(had ?? []).map((a) => Number(a.sort_order) || 0));
      const todo = latest.filter((r) => !have.has(r.image_key));
      const rows = todo.map((r, i) => {
        const ext = (r.image_key.split(".").pop() || "png").toLowerCase();
        const cw = r.colorway_id ? colorwayLabel(spec, r.colorway_id) : null;
        return {
          entity_type: "design_sheet", entity_id: sheet.id, file_name: `${tpl.code}-${rec.seq}-${r.view_key}${cw ? `-${cw}` : ""}-v${r.version}.${ext}`.slice(0, 200),
          file_path: r.image_key, public_url: r2ImageUrl(r.image_key) ?? `/api/r2-image?key=${encodeURIComponent(r.image_key)}`,
          content_type: MIME[ext] ?? "image/png", size_bytes: null, uploaded_by: actor.name ?? "design-library",
          is_primary: !had?.length && i === 0, sort_order: ++order,
        };
      });
      if (rows.length) {
        const { error } = await admin.from("erp_playground_attachments").insert(rows);
        if (error) warnings.push("แนบรูปไม่สำเร็จ"); else counts.images = rows.length;
      }
    }
  }

  // ── ปริมาณ/ทุนของชุดสีที่เลือก (ใช้ทั้งหมุดและตีราคา) ──
  const est = estimateCost(view, choices, { materials, prices: prices ?? {}, calc: calcSettingsFrom(calcRows), cost: canCost ? spec.cost : { ...spec.cost, price: {} } });

  // ── หน้ารูป + หมุด → แท็บรายละเอียดงาน ──
  if (inc.spec && tpl.image_key && view.pins.length) {
    const title = specPageTitle(String(tpl.code), Number(rec.seq), cwName);
    await admin.from("design_sheet_spec_pages").delete().eq("sheet_id", sheet.id).eq("title", title);   // ส่งซ้ำ = แทนหน้าเดิมจากสูตรนี้ (หมุดลบตาม)
    const [{ data: lastPage }, { data: lastPin }] = await Promise.all([
      admin.from("design_sheet_spec_pages").select("sort_order").eq("sheet_id", sheet.id).order("sort_order", { ascending: false }).limit(1).maybeSingle(),
      admin.from("design_sheet_spec_pins").select("no").eq("sheet_id", sheet.id).order("no", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const key = String(tpl.image_key);
    const { data: page, error } = await admin.from("design_sheet_spec_pages").insert({
      sheet_id: sheet.id, title, image_key: key, image_url: r2ImageUrl(key) ?? `/api/r2-image?key=${encodeURIComponent(key)}`,
      image_w: tpl.image_w ?? null, image_h: tpl.image_h ?? null, shapes: [], sort_order: (Number(lastPage?.sort_order) || 0) + 1, created_by: actor.id,
    }).select("id").single();
    if (error || !page) warnings.push("เพิ่มหน้ารายละเอียดงานไม่สำเร็จ");
    else {
      let no = Number(lastPin?.no) || 0;
      const pins = recipePagePins(view, choices, est.lines).map((p) => ({ ...p, sheet_id: sheet.id, page_id: page.id, no: ++no }));
      const { error: pe } = await admin.from("design_sheet_spec_pins").insert(pins);
      if (pe) warnings.push("เพิ่มหมุดวัสดุไม่สำเร็จ"); else counts.pins = pins.length;
    }
  }

  // ── ชุดสี → ตารางสี ──
  if (inc.colors) {
    const incoming = recipeColorTable(spec, choices);
    if (incoming.colorways.length && incoming.rows.length) {
      const { data: cur } = await admin.from("design_sheet_spec_colors").select("data").eq("sheet_id", sheet.id).maybeSingle();
      const merged = mergeColorTables(cleanSpecColors(cur?.data), incoming, tag);
      const { error } = await admin.from("design_sheet_spec_colors").upsert({ sheet_id: sheet.id, data: merged, updated_by: actor.id, updated_at: new Date().toISOString() }, { onConflict: "sheet_id" });
      if (error) warnings.push("ใส่ตารางสีไม่สำเร็จ"); else counts.colorways = incoming.colorways.length;
    }
  }

  // ── ทุนประมาณ → ตีราคา (ต่อท้าย) ──
  if (canCost) {
    const rows = recipeCostRows(est.lines, choices, cwName ? `${tag} · ${cwName}` : tag);
    if (rows.length) {
      const { data: last } = await admin.from("design_sheet_cost_lines").select("sort_order").eq("sheet_id", sheet.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
      let order = Number(last?.sort_order) || 0;
      const { error } = await admin.from("design_sheet_cost_lines").insert(rows.map((r) => ({ ...r, sheet_id: sheet.id, sort_order: ++order })));
      if (error) warnings.push("ใส่ตีราคาไม่สำเร็จ"); else counts.cost_lines = rows.length;
    }
  }

  // ── จำใบงานไว้ที่สูตร + ประวัติ ──
  const { error: linkErr } = await admin.from("design_library_recipes").update({ design_sheet_id: sheet.id, updated_by_name: actor.name, updated_at: new Date().toISOString() }).eq("id", recipeId);
  if (linkErr) warnings.push("จำใบงานไว้ที่สูตรไม่สำเร็จ");
  const meta = { mode, recipe: tag, colorway: cwName, ...counts, warnings };
  await Promise.all([
    !created ? writeAudit(admin, { action: "import_design_library", entityType: "design_sheet", entityId: sheet.id, actorId: actor.id, actorName: actor.name, metadata: { from_design_library: recipeId, ...meta } }) : Promise.resolve(true),
    writeAudit(admin, { action: "send_to_sheet", entityType: "design_library_recipes", entityId: recipeId, actorId: actor.id, actorName: actor.name,
      metadata: { sheet_id: sheet.id, code: sheet.code, ...meta, ...(linked !== sheet.id ? { changes: [{ field: "design_sheet_id", old: linked, new: sheet.id }] } : {}) } }),
  ]);
  return NextResponse.json({ data: { sheet, created, counts, warnings }, error: null });
}
