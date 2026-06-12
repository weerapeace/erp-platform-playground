/**
 * จัดการชุดฟิลด์ต่อประเภทสินค้า (product_attribute_definitions) — /api/admin/attribute-fields
 * GET    ?family=         → { families:[], definitions:[{...,options:[]}] }  (ถ้าไม่ส่ง family = ทุกประเภท)
 * POST                    → สร้างฟิลด์ { product_family, label, scope, type, required, relation_filter, help_text }
 * PATCH                   → แก้ฟิลด์ { id, ...patch }
 * DELETE ?id=             → ลบฟิลด์ (+ ตัวเลือกของมัน)
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ชนิดฟิลด์ (UI) → (input_type, external_table)
type FieldType = "text" | "number" | "boolean" | "select" | "multiselect" | "sku" | "lookup";
function typeToDb(t: FieldType, externalTable?: string | null): { input_type: string; external_table: string | null } {
  if (t === "select") return { input_type: "many2one", external_table: null };
  if (t === "multiselect") return { input_type: "multiselect", external_table: null };
  if (t === "sku") return { input_type: "text", external_table: "skus_v2" };
  if (t === "lookup") return { input_type: "text", external_table: externalTable || null };
  return { input_type: t, external_table: null };
}
export function dbToType(input_type: string, external_table: string | null): FieldType {
  if (external_table === "skus_v2") return "sku";
  if (external_table) return "lookup";
  if (input_type === "many2one") return "select";
  if (input_type === "multiselect") return "multiselect";
  if (input_type === "number") return "number";
  if (input_type === "boolean") return "boolean";
  return "text";
}
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const family = (new URL(request.url).searchParams.get("family") ?? "").trim();
  const admin = supabaseAdmin();

  let q = admin.from("product_attribute_definitions")
    .select("id, product_family, key, label, scope, input_type, external_table, required, allow_custom_value, display_order, help_text, relation_filter, is_active")
    .eq("is_active", true).order("display_order", { ascending: true });
  if (family) q = q.eq("product_family", family);
  const { data: defs, error } = await q;
  if (error) return NextResponse.json({ families: [], definitions: [], error: error.message }, { status: 500 });

  const defRows = (defs ?? []) as Record<string, unknown>[];
  const optByDef = new Map<string, { id: string; label: string; value: string; display_order: number }[]>();
  const defIds = defRows.map((d) => String(d.id));
  if (defIds.length) {
    const { data: opts } = await admin.from("product_attribute_options")
      .select("id, definition_id, label, value, display_order").in("definition_id", defIds).eq("is_active", true)
      .order("display_order", { ascending: true });
    for (const o of (opts ?? []) as Record<string, unknown>[]) {
      const k = String(o.definition_id);
      (optByDef.get(k) ?? optByDef.set(k, []).get(k)!).push({ id: String(o.id), label: String(o.label ?? ""), value: String(o.value ?? ""), display_order: Number(o.display_order) || 0 });
    }
  }
  const definitions = defRows.map((d) => ({
    id: String(d.id), product_family: (d.product_family as string) ?? null, key: String(d.key ?? ""), label: String(d.label ?? ""),
    scope: String(d.scope ?? "model"), type: dbToType(String(d.input_type ?? "text"), (d.external_table as string) ?? null),
    external_table: (d.external_table as string) ?? null,
    required: !!d.required, display_order: Number(d.display_order) || 0, help_text: (d.help_text as string) ?? "",
    relation_filter: (d.relation_filter as Record<string, unknown>) ?? null, options: optByDef.get(String(d.id)) ?? [],
  }));

  // รายชื่อทุกประเภทที่มีฟิลด์ (เพื่อโชว์ในตัวเลือก)
  const { data: famRows } = await admin.from("product_attribute_definitions").select("product_family").eq("is_active", true).not("product_family", "is", null);
  const families = [...new Set((famRows ?? []).map((f: Record<string, unknown>) => String(f.product_family)).filter(Boolean))].sort();

  // ตารางหลักที่ใช้เป็น "เลือกจากตารางหลัก" (lookup) ได้
  const { data: mods } = await admin.from("erp_modules").select("table_name, label").order("label", { ascending: true });
  const lookupTables = (mods ?? []).map((m: Record<string, unknown>) => ({ table_name: String(m.table_name), label: String(m.label ?? m.table_name) })).filter((m) => m.table_name);

  return NextResponse.json({ families, definitions, lookupTables, error: null });
}

type Body = { id?: string; product_family?: string; label?: string; scope?: string; type?: FieldType; external_table?: string; required?: boolean; relation_filter?: unknown; help_text?: string; key?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: Body; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const family = (b.product_family ?? "").trim(); const label = (b.label ?? "").trim();
  if (!family || !label) return NextResponse.json({ error: "ต้องระบุประเภทและชื่อฟิลด์" }, { status: 400 });
  const scope = b.scope === "sku" ? "sku" : "model";
  const { input_type, external_table } = typeToDb((b.type ?? "text") as FieldType, b.external_table);
  const admin = supabaseAdmin();
  // display_order ถัดไป (ต่อ family+scope)
  const { data: maxRow } = await admin.from("product_attribute_definitions").select("display_order").eq("product_family", family).eq("scope", scope).order("display_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (Number((maxRow as { display_order?: number } | null)?.display_order) || 0) + 1;
  const key = (b.key && b.key.trim()) || slug(label) || `f${nextOrder}_${family}`;
  const { data, error } = await admin.from("product_attribute_definitions").insert({
    product_family: family, key, label, scope, input_type, external_table,
    required: !!b.required, display_order: nextOrder, help_text: b.help_text || null,
    relation_filter: b.relation_filter ?? null, is_active: true,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "attribute_definition", entityId: (data as { id: string }).id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { family, label } });
  return NextResponse.json({ id: (data as { id: string }).id, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: Body & { display_order?: number }; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof b.label === "string") patch.label = b.label.trim();
  if (typeof b.scope === "string") patch.scope = b.scope === "sku" ? "sku" : "model";
  if (b.type) { const m = typeToDb(b.type, b.external_table); patch.input_type = m.input_type; patch.external_table = m.external_table; }
  if (typeof b.required === "boolean") patch.required = b.required;
  if (b.relation_filter !== undefined) patch.relation_filter = b.relation_filter ?? null;
  if (typeof b.help_text === "string") patch.help_text = b.help_text || null;
  if (typeof b.display_order === "number") patch.display_order = b.display_order;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("product_attribute_definitions").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "attribute_definition", entityId: b.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: patch });
  return NextResponse.json({ id: b.id, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  await admin.from("product_attribute_options").delete().eq("definition_id", id);
  const { error } = await admin.from("product_attribute_definitions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "attribute_definition", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
