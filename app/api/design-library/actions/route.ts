/**
 * 📚 Design Library — งานที่ต้องคิดเลข/ตรวจก่อนเขียน
 * POST { action: "new_recipe", template_id, from_recipe_id? }          → สูตรใหม่ (เลข #ถัดไปของแม่แบบ · ตั้งต้นจากแม่แบบ หรือคัดลอกสูตรเดิม)
 * POST { action: "save_recipe", id, spec, name?, note? }                → บันทึกสูตร (ทำความสะอาดด้วย cleanSpec ก่อนเสมอ)
 * POST { action: "add_render", recipe_id, view_key, image_key, note? } → เพิ่มรูปที่ได้จาก GPT (version = ล่าสุดของชุดมุมนั้น + 1)
 * สิทธิ์ design_library.edit · audit ทุกงาน
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { cleanSpec, RENDER_VIEWS } from "@/lib/design-library";
import { EDIT_PERM } from "../_resources";

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
    const spec = cleanSpec(body.spec);
    const patch: Record<string, unknown> = { spec, updated_by_name: actor.name, updated_at: new Date().toISOString() };
    if ("name" in body) patch.name = String(body.name ?? "").trim().slice(0, 120) || null;
    if ("note" in body) patch.note = String(body.note ?? "").trim().slice(0, 2000) || null;
    const { data, error } = await admin.from("design_library_recipes").update(patch).eq("id", id).select("*").single();
    if (error) return bad("บันทึกสูตรไม่สำเร็จ กรุณาลองใหม่", 500);
    const b = (before.spec ?? {}) as { pins?: unknown[] };
    await audit("update", "design_library_recipes", id, {
      seq: before.seq,
      changes: {
        spec: { from: { pins: Array.isArray(b.pins) ? b.pins.length : 0 }, to: { pins: spec.pins.length, size: spec.size, hw_color: spec.hw_color } },
        ...("name" in patch && patch.name !== before.name ? { name: { from: before.name, to: patch.name } } : {}),
        ...("note" in patch && patch.note !== before.note ? { note: { from: before.note, to: patch.note } } : {}),
      },
    });
    return NextResponse.json({ data, error: null });
  }

  if (body.action === "add_render") {
    const recipeId = String(body.recipe_id ?? "");
    const view = String(body.view_key ?? "");
    const imageKey = String(body.image_key ?? "").trim();
    if (!UUID.test(recipeId)) return bad("ไม่พบสูตร");
    if (!RENDER_VIEWS.some((v) => v.key === view)) return bad("ไม่รู้จักชุดมุมนี้");
    if (!imageKey) return bad("ยังไม่มีรูป");
    const { data: rc } = await admin.from("design_library_recipes").select("id").eq("id", recipeId).maybeSingle();
    if (!rc) return bad("ไม่พบสูตร", 404);
    const { data: last } = await admin.from("design_library_renders").select("version").eq("recipe_id", recipeId).eq("view_key", view).order("version", { ascending: false }).limit(1).maybeSingle();
    const version = (Number(last?.version) || 0) + 1;
    const { data, error } = await admin.from("design_library_renders").insert({
      recipe_id: recipeId, view_key: view, version, image_key: imageKey, note: String(body.note ?? "").trim().slice(0, 500) || null,
      created_by: actor.id, created_by_name: actor.name,
    }).select("*").single();
    if (error) return bad("บันทึกรูปไม่สำเร็จ กรุณาลองใหม่", 500);
    await audit("create", "design_library_renders", data.id, { recipe_id: recipeId, view_key: view, version });
    return NextResponse.json({ data, error: null });
  }

  return bad("ไม่รู้จักคำสั่งนี้");
}
