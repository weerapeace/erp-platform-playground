/**
 * ตัวประกอบสินค้า — คำสั่งที่แตะหลายแถว · POST /api/configurator/actions
 *   { action: "sample",    shop_id }                                   → สร้างทรงตัวอย่าง "กระเป๋าโท้ท" (ปิดไว้ก่อน)
 *   { action: "duplicate", model_id, code?, name_th?, with_images? }   → สำเนาทรงทั้งชุด (ปิดไว้ก่อน)
 *   { action: "reorder",   kind: models|slots|options|layers|rules, scope_id, ids[] } → เรียงใหม่ตามลำดับในอาเรย์ (×10)
 * ตอบ { data: { model_id? , updated? } } · สิทธิ์ configurator.edit · audit 1 แถวต่อคำสั่ง
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { actorOf } from "@/lib/crud-resource-api";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { blueprintFromData, normCode } from "@/lib/product-configurator";
import { sampleToteBlueprint } from "@/lib/product-configurator-sample";
import { createFromBlueprint, freeModelCode, loadBundle } from "../_data";
import { EDIT_PERM } from "../_resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

/** ตาราง + คอลัมน์ลำดับ + คอลัมน์ขอบเขต ของแต่ละชนิดที่จัดเรียงได้ */
const REORDER: Record<string, { table: string; col: "sort_order" | "z_index"; scope: "shop_id" | "model_id" | "slot_id" }> = {
  models:  { table: "configurator_models",  col: "sort_order", scope: "shop_id" },
  slots:   { table: "configurator_slots",   col: "sort_order", scope: "model_id" },
  options: { table: "configurator_options", col: "sort_order", scope: "slot_id" },
  layers:  { table: "configurator_layers",  col: "z_index",    scope: "model_id" },
  rules:   { table: "configurator_rules",   col: "sort_order", scope: "model_id" },
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ใช่ JSON"); }
  const admin = supabaseAdmin();
  const actor = await actorOf(request);
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  if (body.action === "sample") {
    const shopId = str("shop_id");
    if (!shopId) return bad("ต้องระบุร้าน (shop_id)");
    const bp = sampleToteBlueprint();
    bp.model.code = await freeModelCode(admin, shopId, bp.model.code);
    const r = await createFromBlueprint(admin, shopId, bp);
    if (r.error || !r.modelId) return bad(friendlyDbError(r.error ?? ""), 500);
    await writeAudit(admin, { action: "create", entityType: "configurator_models", entityId: r.modelId, ...actor, metadata: { from: "sample", code: bp.model.code, shop_id: shopId, ...r.counts } });
    return NextResponse.json({ data: { model_id: r.modelId }, error: null });
  }

  if (body.action === "duplicate") {
    const modelId = str("model_id");
    if (!modelId) return bad("ต้องระบุทรงต้นแบบ (model_id)");
    const { data, error } = await loadBundle(admin, modelId);
    if (!data) return bad(error ?? "ไม่พบทรงต้นแบบ", 404);
    const code = await freeModelCode(admin, data.model.shop_id, normCode(str("code")) || `${data.model.code}-2`);
    const bp = blueprintFromData(data, { code, nameTh: str("name_th") || `${data.model.name_th} (สำเนา)`, withImages: body.with_images !== false });
    const r = await createFromBlueprint(admin, data.model.shop_id, bp);
    if (r.error || !r.modelId) return bad(friendlyDbError(r.error ?? ""), 500);
    await writeAudit(admin, { action: "create", entityType: "configurator_models", entityId: r.modelId, ...actor, metadata: { from: "duplicate", source_model_id: modelId, code, ...r.counts } });
    return NextResponse.json({ data: { model_id: r.modelId }, error: null });
  }

  if (body.action === "reorder") {
    const spec = REORDER[str("kind")];
    const scopeId = str("scope_id");
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
    if (!spec) return bad("ไม่รู้จักชนิดที่จะจัดลำดับ");
    if (!scopeId || ids.length === 0) return bad("ไม่มีรายการให้จัดลำดับ");
    if (ids.length > 500) return bad("จัดลำดับได้ครั้งละไม่เกิน 500 รายการ");
    const { data: rows, error } = await admin.from(spec.table).select(`id, ${spec.col}`).eq(spec.scope, scopeId).in("id", ids);
    if (error) return bad("อ่านรายการไม่สำเร็จ", 500);
    const known = new Map((rows ?? []).map((r) => [(r as Record<string, unknown>).id as string, Number((r as Record<string, unknown>)[spec.col])]));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) return bad(`มี ${missing.length} รายการที่ไม่ได้อยู่ในกลุ่มนี้หรือถูกลบไปแล้ว — รีเฟรชหน้าแล้วลองใหม่`);
    const now = new Date().toISOString();
    const jobs = ids.map((id, i) => ({ id, v: (i + 1) * 10 })).filter((j) => known.get(j.id) !== j.v);
    const results = await Promise.all(jobs.map((j) => admin.from(spec.table).update({ [spec.col]: j.v, updated_at: now }).eq("id", j.id)));
    const failed = results.filter((r) => r.error).length;
    if (failed) return bad(`บันทึกลำดับไม่สำเร็จ ${failed} รายการ`, 500);
    await writeAudit(admin, { action: "reorder", entityType: spec.table, entityId: null, ...actor, metadata: { scope: spec.scope, scope_id: scopeId, count: ids.length, updated: jobs.length, order: ids } });
    return NextResponse.json({ data: { updated: jobs.length }, error: null });
  }

  return bad("ไม่รู้จักคำสั่งนี้");
}
