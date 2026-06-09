/**
 * แก้รายละเอียดสั่งงาน / attribute (เฟส 2) — แหล่งข้อมูลจริง
 * GET  /api/product-attributes?sku=  → definitions(+options) + ค่าปัจจุบัน(model+sku) + ช่องเดิม + families
 * POST /api/product-attributes        → บันทึก: parent.family/ช่องเดิม/notes + attribute values (model+sku)
 *
 * ไม่แตะ schema (เขียนลงตารางเดิม): parent_skus_v2 / product_model_attribute_values / product_sku_attribute_values
 * อ่านผ่าน guardApi(products.view) · เขียนผ่าน guardApi(products.edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type AttrDef = { id: string; product_family: string | null; key: string; label: string; scope: string; input_type: string; allow_custom_value: boolean; display_order: number; options: { id: string; label: string }[] };
export type AttrVal = { option_id: string | null; option_ids: string[]; text_value: string | null; number_value: number | null; boolean_value: boolean | null };
export const LEGACY_COLS = ["materials", "lining", "zipper", "strap", "thread", "spares", "logo"] as const;

const str = (v: unknown) => (v == null ? "" : String(v));

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sku = (new URL(request.url).searchParams.get("sku") ?? "").trim();
  if (!sku) return NextResponse.json({ error: "ต้องระบุ sku" }, { status: 400 });
  const admin = supabaseAdmin();

  const { data: skuRow } = await admin.from("skus_v2").select("id, code, parent_sku_id").eq("code", sku).maybeSingle();
  if (!skuRow) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const { data: parent } = skuRow.parent_sku_id
    ? await admin.from("parent_skus_v2").select("id, code, sku_name, name_th, product_family, size_summary, work_instruction_notes, materials, lining, zipper, strap, thread, spares, logo").eq("id", skuRow.parent_sku_id).maybeSingle()
    : { data: null };

  const { data: defsRaw } = await admin.from("product_attribute_definitions").select("id, product_family, key, label, scope, input_type, allow_custom_value, display_order").eq("is_active", true).order("display_order", { ascending: true });
  const defs = (defsRaw ?? []) as Record<string, unknown>[];
  const defIds = defs.map((d) => String(d.id));
  const optByDef = new Map<string, { id: string; label: string }[]>();
  if (defIds.length) {
    const { data: opts } = await admin.from("product_attribute_options").select("id, definition_id, label, display_order").in("definition_id", defIds).eq("is_active", true).order("display_order", { ascending: true });
    for (const o of (opts ?? []) as Record<string, unknown>[]) { const k = String(o.definition_id); (optByDef.get(k) ?? optByDef.set(k, []).get(k)!).push({ id: String(o.id), label: str(o.label) }); }
  }
  const definitions: AttrDef[] = defs.map((d) => ({ id: String(d.id), product_family: (d.product_family as string) ?? null, key: str(d.key), label: str(d.label), scope: str(d.scope), input_type: str(d.input_type), allow_custom_value: !!d.allow_custom_value, display_order: Number(d.display_order) || 0, options: optByDef.get(String(d.id)) ?? [] }));

  const valOf = (r: Record<string, unknown>): AttrVal => ({ option_id: (r.option_id as string) ?? null, option_ids: Array.isArray(r.option_ids) ? (r.option_ids as string[]) : [], text_value: (r.text_value as string) ?? null, number_value: r.number_value == null ? null : Number(r.number_value), boolean_value: r.boolean_value == null ? null : !!r.boolean_value });
  const model_values: Record<string, AttrVal> = {};
  const sku_values: Record<string, AttrVal> = {};
  if (parent) { const { data } = await admin.from("product_model_attribute_values").select("*").eq("product_model_id", (parent as { id: string }).id); for (const r of (data ?? []) as Record<string, unknown>[]) model_values[String(r.definition_id)] = valOf(r); }
  { const { data } = await admin.from("product_sku_attribute_values").select("*").eq("product_sku_id", skuRow.id); for (const r of (data ?? []) as Record<string, unknown>[]) sku_values[String(r.definition_id)] = valOf(r); }

  const families = [...new Set(definitions.map((d) => d.product_family).filter(Boolean) as string[])];
  const legacy: Record<string, string> = {};
  if (parent) for (const c of LEGACY_COLS) legacy[c] = str((parent as Record<string, unknown>)[c]);

  return NextResponse.json({
    sku: { id: skuRow.id, code: skuRow.code },
    parent: parent ? { id: (parent as { id: string }).id, name: ((parent as Record<string, unknown>).sku_name as string) ?? ((parent as Record<string, unknown>).name_th as string) ?? null, product_family: (parent as Record<string, unknown>).product_family as string ?? null, size_summary: str((parent as Record<string, unknown>).size_summary), work_instruction_notes: str((parent as Record<string, unknown>).work_instruction_notes) } : null,
    families, definitions, model_values, sku_values, legacy, error: null,
  });
}

type InVal = { definition_id: string; input_type: string; value: unknown };
type SaveBody = { sku?: string; family?: string | null; size_summary?: string; work_instruction_notes?: string; legacy?: Record<string, string>; model?: InVal[]; sku_vals?: InVal[] };

function rowFor(iv: InVal, link: Record<string, string>): Record<string, unknown> | null {
  const base = { ...link, definition_id: iv.definition_id, option_id: null as string | null, option_ids: null as string[] | null, text_value: null as string | null, number_value: null as number | null, boolean_value: null as boolean | null };
  const v = iv.value;
  if (iv.input_type === "many2one") { if (!v) return null; base.option_id = String(v); }
  else if (iv.input_type === "multiselect") { const arr = (Array.isArray(v) ? v : []).map(String).filter(Boolean); if (!arr.length) return null; base.option_ids = arr; }
  else if (iv.input_type === "number") { if (v === "" || v == null) return null; base.number_value = Number(v); }
  else if (iv.input_type === "boolean") { if (v == null) return null; base.boolean_value = !!v; }
  else { const t = str(v).trim(); if (!t) return null; base.text_value = t; }
  return base;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: SaveBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const sku = (body.sku ?? "").trim();
  if (!sku) return NextResponse.json({ error: "ต้องระบุ sku" }, { status: 400 });
  const admin = supabaseAdmin();

  const { data: skuRow } = await admin.from("skus_v2").select("id, parent_sku_id").eq("code", sku).maybeSingle();
  if (!skuRow) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const parentId = skuRow.parent_sku_id as string | null;

  // 1) อัปเดต Parent (family / ช่องเดิม / notes / size)
  if (parentId) {
    const upd: Record<string, unknown> = {};
    if (body.family !== undefined) upd.product_family = body.family || null;
    if (body.size_summary !== undefined) upd.size_summary = body.size_summary || null;
    if (body.work_instruction_notes !== undefined) upd.work_instruction_notes = body.work_instruction_notes || null;
    if (body.legacy) for (const c of LEGACY_COLS) if (body.legacy[c] !== undefined) upd[c] = body.legacy[c] || null;
    if (Object.keys(upd).length) { const { error } = await admin.from("parent_skus_v2").update(upd).eq("id", parentId); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); }
  }

  // 2) attribute values — ลบของเดิมเฉพาะ definition ที่ส่งมา แล้ว insert ใหม่ (เฉพาะที่มีค่า)
  const saveVals = async (table: string, link: Record<string, string>, items: InVal[]) => {
    const ids = items.map((i) => i.definition_id);
    if (!ids.length) return;
    const linkCol = Object.keys(link)[0];
    await admin.from(table).delete().eq(linkCol, link[linkCol]).in("definition_id", ids);
    const rows = items.map((i) => rowFor(i, link)).filter(Boolean) as Record<string, unknown>[];
    if (rows.length) { const { error } = await admin.from(table).insert(rows); if (error) throw new Error(error.message); }
  };
  try {
    if (parentId && Array.isArray(body.model)) await saveVals("product_model_attribute_values", { product_model_id: parentId }, body.model);
    if (Array.isArray(body.sku_vals)) await saveVals("product_sku_attribute_values", { product_sku_id: skuRow.id as string }, body.sku_vals);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึก attribute ไม่สำเร็จ" }, { status: 400 }); }

  await writeAudit(admin, { action: "update", entityType: "product_spec", entityId: parentId ?? (skuRow.id as string), actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { sku, family: body.family } });
  return NextResponse.json({ ok: true, error: null });
}
