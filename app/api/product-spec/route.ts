/**
 * รายละเอียดสั่งงาน (Product Spec / Work Instructions) — อ่านอย่างเดียว (เฟส 1)
 * GET /api/product-spec?sku=BBP08-08
 *   resolve: SKU → Parent → คืน สเปกร่วม (Parent) + วัตถุดิบต่อสี (SKU)
 *   แหล่งข้อมูล: (1) ระบบ attribute ใหม่ (product_*_attribute_values+definitions+options)
 *               (2) ช่องเดิมบน parent_skus_v2 (materials/zipper/logo/...) — ใช้ระหว่างย้าย
 * ของกลาง: supabaseAdmin + guardApi (join ข้ามตาราง master)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SpecField = { key: string; label: string; value: string; order: number };
export type ProductSpec = {
  parent: { code: string | null; name: string | null; family: string | null; size_summary: string | null; work_instruction_notes: string | null; image_url: string | null } | null;
  legacy: SpecField[];        // ช่องเดิมบน Parent (materials/zipper/...)
  model_attrs: SpecField[];   // attribute ระดับ Parent (สเปกร่วม)
  sku_attrs: SpecField[];     // attribute ระดับ SKU (ต่อสี/แบบ)
  error: string | null;
};

const LEGACY: { col: string; label: string }[] = [
  { col: "materials", label: "วัตถุดิบ" }, { col: "lining", label: "ซับใน" }, { col: "zipper", label: "ซิป" },
  { col: "strap", label: "สาย/สายสะพาย" }, { col: "thread", label: "ด้าย" }, { col: "spares", label: "อะไหล่" },
  { col: "logo", label: "โลโก้/พิมพ์" },
];

const str = (v: unknown) => (v == null ? "" : String(v)).trim();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sku = (new URL(request.url).searchParams.get("sku") ?? "").trim();
  if (!sku) return NextResponse.json({ parent: null, legacy: [], model_attrs: [], sku_attrs: [], error: "ต้องระบุ sku" }, { status: 400 });
  const admin = supabaseAdmin();

  const { data: skuRow } = await admin.from("skus_v2").select("id, code, parent_sku_id, cover_image_r2_key").eq("code", sku).maybeSingle();
  if (!skuRow) return NextResponse.json({ parent: null, legacy: [], model_attrs: [], sku_attrs: [], error: null });

  const { data: parent } = skuRow.parent_sku_id
    ? await admin.from("parent_skus_v2").select("id, code, sku_name, name_th, product_family, size_summary, work_instruction_notes, cover_image_r2_key, materials, lining, zipper, strap, thread, spares, logo").eq("id", skuRow.parent_sku_id).maybeSingle()
    : { data: null };

  // ช่องเดิม (legacy)
  const legacy: SpecField[] = [];
  if (parent) LEGACY.forEach((f, i) => { const v = str((parent as Record<string, unknown>)[f.col]); if (v && v !== "-") legacy.push({ key: f.col, label: f.label, value: v, order: i }); });

  // attribute values (ทั้ง model + sku) → join definitions + options
  const [{ data: mVals }, { data: sVals }] = await Promise.all([
    parent ? admin.from("product_model_attribute_values").select("definition_id, option_id, option_ids, text_value, number_value, boolean_value").eq("product_model_id", (parent as { id: string }).id) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from("product_sku_attribute_values").select("definition_id, option_id, option_ids, text_value, number_value, boolean_value").eq("product_sku_id", skuRow.id),
  ]);
  type Val = Record<string, unknown> & { _scope: "model" | "sku" };
  const allVals: Val[] = [
    ...((mVals ?? []) as Record<string, unknown>[]).map((v): Val => ({ ...v, _scope: "model" })),
    ...((sVals ?? []) as Record<string, unknown>[]).map((v): Val => ({ ...v, _scope: "sku" })),
  ];

  // ดึง definitions + options ที่เกี่ยวข้อง
  const defIds = [...new Set(allVals.map((v) => v.definition_id).filter(Boolean) as string[])];
  const optIds = [...new Set(allVals.flatMap((v) => [v.option_id as string, ...((Array.isArray(v.option_ids) ? v.option_ids : []) as string[])]).filter(Boolean))];
  const defMap = new Map<string, { label: string; order: number }>();
  if (defIds.length) { const { data } = await admin.from("product_attribute_definitions").select("id, label, display_order").in("id", defIds); for (const d of (data ?? []) as Record<string, unknown>[]) defMap.set(String(d.id), { label: str(d.label), order: Number(d.display_order) || 0 }); }
  const optMap = new Map<string, string>();
  if (optIds.length) { const { data } = await admin.from("product_attribute_options").select("id, label").in("id", optIds); for (const o of (data ?? []) as Record<string, unknown>[]) optMap.set(String(o.id), str(o.label)); }

  const resolve = (v: Record<string, unknown>): string => {
    if (v.option_id && optMap.has(String(v.option_id))) return optMap.get(String(v.option_id))!;
    if (Array.isArray(v.option_ids) && v.option_ids.length) return (v.option_ids as string[]).map((id) => optMap.get(String(id))).filter(Boolean).join(", ");
    if (str(v.text_value)) return str(v.text_value);
    if (v.number_value != null) return String(v.number_value);
    if (v.boolean_value != null) return v.boolean_value ? "ใช่" : "ไม่";
    return "";
  };

  const model_attrs: SpecField[] = [];
  const sku_attrs: SpecField[] = [];
  for (const v of allVals) {
    const def = defMap.get(String(v.definition_id)); if (!def) continue;
    const val = resolve(v); if (!val) continue;
    const field: SpecField = { key: String(v.definition_id), label: def.label, value: val, order: def.order };
    (v._scope === "model" ? model_attrs : sku_attrs).push(field);
  }
  model_attrs.sort((a, b) => a.order - b.order);
  sku_attrs.sort((a, b) => a.order - b.order);

  const pkey = parent ? (parent as Record<string, unknown>).cover_image_r2_key as string | null : null;
  const imgKey = pkey ?? skuRow.cover_image_r2_key ?? null;

  return NextResponse.json({
    parent: parent ? {
      code: (parent as Record<string, unknown>).code as string ?? null,
      name: ((parent as Record<string, unknown>).sku_name as string) ?? ((parent as Record<string, unknown>).name_th as string) ?? null,
      family: (parent as Record<string, unknown>).product_family as string ?? null,
      size_summary: str((parent as Record<string, unknown>).size_summary) || null,
      work_instruction_notes: str((parent as Record<string, unknown>).work_instruction_notes) || null,
      image_url: imgKey ? `/api/r2-image?key=${encodeURIComponent(imgKey)}` : null,
    } : null,
    legacy, model_attrs, sku_attrs, error: null,
  });
}
