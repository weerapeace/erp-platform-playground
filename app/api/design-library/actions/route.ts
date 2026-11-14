/**
 * 📚 Design Library — งานที่ต้องคิดเลข/ตรวจก่อนเขียน
 * POST { action: "new_recipe", template_id, from_recipe_id? }          → สูตรใหม่ (เลข #ถัดไปของแม่แบบ · ตั้งต้นจากแม่แบบ หรือคัดลอกสูตรเดิม)
 * POST { action: "save_recipe", id, spec, name?, note? }                → บันทึกสูตร (ทำความสะอาดด้วย cleanSpec ก่อนเสมอ)
 * POST { action: "add_render", recipe_id, view_key, image_key, colorway_id?, note? } → เพิ่มรูปที่ได้จาก GPT (version = ล่าสุดของชุดมุม+ชุดสีนั้น + 1 · colorway_id ว่าง = สีหลัก)
 * POST { action: "set_template_vector", render_id }                  → ตั้งรูปลายเส้นเป็นรูป Vector ของแม่แบบ (design_library.manage)
 * สิทธิ์ design_library.edit · audit ทุกงาน · ทุนประมาณ (spec.cost) แก้ได้เฉพาะ products.cost.view — ไม่มีสิทธิ์ = คงค่าเดิมไว้
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { cleanSpec, EMPTY_COST, RENDER_VIEWS } from "@/lib/design-library";
import { COST_PERM } from "@/lib/cost-access";
import { EDIT_PERM, MANAGE_PERM } from "../_resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ใช่ JSON"); }
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const audit = (action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) =>
    writeAudit(admin, { action, entityType, entityId, actorId: actor.id, actorName: actor.name, metadata });

  if (body.action === "new_recipe") {
    const templateId = String(body.template_id ?? "");
    if (!UUID.test(templateId)) return bad("ไม่พบแม่แบบ");
    const { data: tpl } = await admin.from("design_library_templates").select("id, code, default_spec").eq("id", templateId).is("deleted_at", null).maybeSingle();
    if (!tpl) return bad("ไม่พบแม่แบบ (อาจถูกลบไปแล้ว)", 404);
    let spec: unknown = tpl.default_spec;
    if (body.from_recipe_id) {
      const { data: src } = await admin.from("design_library_recipes").select("spec").eq("id", String(body.from_recipe_id)).maybeSingle();
      if (!src) return bad("ไม่พบสูตรต้นทาง", 404);
      spec = src.spec;
    }
    const { data: last } = await admin.from("design_library_recipes").select("seq").eq("template_id", templateId).order("seq", { ascending: false }).limit(1).maybeSingle();
    const seq = (Number(last?.seq) || 0) + 1;
    const { data, error } = await admin.from("design_library_recipes").insert({
      template_id: templateId, seq, spec: cleanSpec(spec), created_by: actor.id, created_by_name: actor.name, updated_by_name: actor.name,
    }).select("*").single();
    if (error) return bad("สร้างสูตรไม่สำเร็จ กรุณาลองใหม่", 500);
    await audit("create", "design_library_recipes", data.id, { template_code: tpl.code, seq, copied_from: body.from_recipe_id ?? null });
    return NextResponse.json({ data, error: null });
  }

  if (body.action === "save_recipe") {
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return bad("ไม่พบสูตร");
    const { data: before } = await admin.from("design_library_recipes").select("id, seq, spec, name, note").eq("id", id).maybeSingle();
    if (!before) return bad("ไม่พบสูตร (อาจถูกลบไปแล้ว)", 404);
    const incoming = cleanSpec(body.spec);
    // คนไม่มีสิทธิ์ดูต้นทุนได้ spec.cost ว่างจาก bundle → ห้ามทับของเดิม
    const spec = (await apiCan(request, COST_PERM)) ? incoming : { ...incoming, cost: cleanSpec(before.spec).cost };
    const patch: Record<string, unknown> = { spec, updated_by_name: actor.name, updated_at: new Date().toISOString() };
    if ("name" in body) patch.name = String(body.name ?? "").trim().slice(0, 120) || null;
    if ("note" in body) patch.note = String(body.note ?? "").trim().slice(0, 2000) || null;
    const { data, error } = await admin.from("design_library_recipes").update(patch).eq("id", id).select("*").single();
    if (error) return bad("บันทึกสูตรไม่สำเร็จ กรุณาลองใหม่", 500);
    const b = (before.spec ?? {}) as { pins?: unknown[] };
    await audit("update", "design_library_recipes", id, {
      seq: before.seq,
      changes: {
        spec: { from: { pins: Array.isArray(b.pins) ? b.pins.length : 0 }, to: { pins: spec.pins.length, size: spec.size, hw_color: spec.hw_color, colorways: spec.colorways.length } },
        ...("name" in patch && patch.name !== before.name ? { name: { from: before.name, to: patch.name } } : {}),
        ...("note" in patch && patch.note !== before.note ? { note: { from: before.note, to: patch.note } } : {}),
      },
    });
    const canCost = await apiCan(request, COST_PERM);
    return NextResponse.json({ data: canCost ? data : { ...data, spec: { ...spec, cost: EMPTY_COST } }, error: null });
  }

  if (body.action === "add_render") {
    const recipeId = String(body.recipe_id ?? "");
    const view = String(body.view_key ?? "");
    const imageKey = String(body.image_key ?? "").trim();
    const colorwayId = body.colorway_id == null || body.colorway_id === "" ? null : String(body.colorway_id);
    if (!UUID.test(recipeId)) return bad("ไม่พบสูตร");
    if (colorwayId && !/^[A-Za-z0-9_-]{1,40}$/.test(colorwayId)) return bad("ไม่รู้จักชุดสีนี้");
    if (!RENDER_VIEWS.some((v) => v.key === view)) return bad("ไม่รู้จักชุดมุมนี้");
    if (!imageKey) return bad("ยังไม่มีรูป");
    const { data: rc } = await admin.from("design_library_recipes").select("id, spec").eq("id", recipeId).maybeSingle();
    if (!rc) return bad("ไม่พบสูตร", 404);
    if (colorwayId && !cleanSpec(rc.spec).colorways.some((c) => c.id === colorwayId)) return bad("ไม่พบชุดสีนี้ในสูตร — บันทึกสูตรก่อนแล้วอัปใหม่");
    let lastQ = admin.from("design_library_renders").select("version").eq("recipe_id", recipeId).eq("view_key", view);
    lastQ = colorwayId ? lastQ.eq("colorway_id", colorwayId) : lastQ.is("colorway_id", null);
    const { data: last } = await lastQ.order("version", { ascending: false }).limit(1).maybeSingle();
    const version = (Number(last?.version) || 0) + 1;
    const { data, error } = await admin.from("design_library_renders").insert({
      recipe_id: recipeId, view_key: view, version, image_key: imageKey, colorway_id: colorwayId, note: String(body.note ?? "").trim().slice(0, 500) || null,
      created_by: actor.id, created_by_name: actor.name,
    }).select("*").single();
    if (error) return bad("บันทึกรูปไม่สำเร็จ กรุณาลองใหม่", 500);
    await audit("create", "design_library_renders", data.id, { recipe_id: recipeId, view_key: view, version, colorway_id: colorwayId });
    return NextResponse.json({ data, error: null });
  }

  // ตั้งรูปลายเส้นที่ได้จาก GPT (ช่อง "ลายเส้น" ของสูตร) เป็นรูป Vector ของแม่แบบ — เฉพาะคนที่จัดการแม่แบบได้
  if (body.action === "set_template_vector") {
    if (!(await apiCan(request, MANAGE_PERM))) return bad("คุณไม่มีสิทธิ์แก้แม่แบบ (ต้องมีสิทธิ์ “จัดการแม่แบบและตัวเลือก”)", 403);
    const renderId = String(body.render_id ?? "");
    if (!UUID.test(renderId)) return bad("ไม่พบรูป");
    const { data: rnd } = await admin.from("design_library_renders").select("id, image_key, recipe_id, version").eq("id", renderId).maybeSingle();
    if (!rnd) return bad("ไม่พบรูป", 404);
    const { data: rc } = await admin.from("design_library_recipes").select("template_id").eq("id", rnd.recipe_id).maybeSingle();
    if (!rc) return bad("ไม่พบสูตรของรูปนี้", 404);
    const { data: before } = await admin.from("design_library_templates").select("id, code, vector_image_key").eq("id", rc.template_id).maybeSingle();
    if (!before) return bad("ไม่พบแม่แบบ", 404);
    const { data, error } = await admin.from("design_library_templates").update({ vector_image_key: rnd.image_key, updated_at: new Date().toISOString() }).eq("id", before.id).select("*").single();
    if (error) return bad("ตั้งรูปไม่สำเร็จ กรุณาลองใหม่", 500);
    await audit("update", "design_library_templates", before.id, { code: before.code, from_render: renderId, changes: { vector_image_key: { from: before.vector_image_key, to: rnd.image_key } } });
    return NextResponse.json({ data, error: null });
  }

  return bad("ไม่รู้จักคำสั่งนี้");
}
