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

export type SpecField = { key: string; label: string; value: string; order: number; sku_code?: string | null };
export type BomMatGroup = { slot: string; label: string; items: { code: string; name: string; count: number }[] };
export type ProductSpec = {
  parent: { code: string | null; name: string | null; family: string | null; size_summary: string | null; work_instruction_notes: string | null; image_url: string | null } | null;
  legacy: SpecField[];          // ช่องเดิมบน Parent (materials/zipper/...)
  model_attrs: SpecField[];     // attribute ระดับ Parent (สเปกร่วม)
  sku_attrs: SpecField[];       // attribute ระดับ SKU (ต่อสี/แบบ)
  bom_materials: BomMatGroup[]; // วัตถุดิบจาก BOM เวอร์ชั่นหลัก จัดกลุ่มตามช่อง (slot_code)
  bom_version: string | null;
  error: string | null;
};

// ช่องวัตถุดิบ (slot_code) → ป้ายชื่อ (ตรงกับ SLOT_ROLES ใน bom/line-editor)
const SLOT_LABEL: Record<string, string> = { MATERIALS: "วัตถุดิบหลัก", LINING: "ซับใน", ZIPPER: "ซิป", LOGO: "โลโก้/พิมพ์", STRAP: "สาย", THREAD: "ด้าย", HARDWARE: "อะไหล่", OTHER: "อื่นๆ" };
const SLOT_ORDER = ["MATERIALS", "LINING", "ZIPPER", "LOGO", "STRAP", "THREAD", "HARDWARE", "OTHER"];

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

  // product_model_id ที่ถูกต้อง = product_models ที่อ้าง parent นี้ (source_parent_sku_id) ไม่ใช่ parent.id
  let productModelId: string | null = null;
  if (parent) { const { data: pm } = await admin.from("product_models").select("id").eq("source_parent_sku_id", (parent as { id: string }).id).maybeSingle(); productModelId = (pm as { id: string } | null)?.id ?? null; }

  // attribute values (ทั้ง model + sku) → join definitions + options
  const [{ data: mVals }, { data: sVals }] = await Promise.all([
    productModelId ? admin.from("product_model_attribute_values").select("definition_id, option_id, option_ids, text_value, number_value, boolean_value").eq("product_model_id", productModelId) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
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
  // ดึง definitions + options พร้อมกัน (เดิมทำทีละตัว)
  const [defRes, optRes] = await Promise.all([
    defIds.length ? admin.from("product_attribute_definitions").select("id, label, display_order, external_table").in("id", defIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    optIds.length ? admin.from("product_attribute_options").select("id, label").in("id", optIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const defMap = new Map<string, { label: string; order: number; external: string | null }>();
  for (const d of (defRes.data ?? []) as Record<string, unknown>[]) defMap.set(String(d.id), { label: str(d.label), order: Number(d.display_order) || 0, external: (d.external_table as string) ?? null });
  const optMap = new Map<string, string>();
  for (const o of (optRes.data ?? []) as Record<string, unknown>[]) optMap.set(String(o.id), str(o.label));

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
    const isSku = def.external === "skus_v2";
    const field: SpecField = { key: String(v.definition_id), label: def.label, value: val, order: def.order, sku_code: isSku ? val : null };
    (v._scope === "model" ? model_attrs : sku_attrs).push(field);
  }
  // ฟิลด์อ้างวัตถุดิบ: แปลงรหัส → ชื่อ SKU จริง
  const refCodes = [...new Set([...model_attrs, ...sku_attrs].filter((f) => f.sku_code).map((f) => f.sku_code as string))];
  if (refCodes.length) {
    const { data } = await admin.from("skus_v2").select("code, attribute_values").in("code", refCodes);
    const nameMap = new Map<string, string>();
    for (const s of (data ?? []) as Record<string, unknown>[]) { const dn = str((s.attribute_values as Record<string, unknown>)?.display_name).replace(/^\[[^\]]*\]\s*/, ""); nameMap.set(String(s.code), dn || String(s.code)); }
    for (const f of [...model_attrs, ...sku_attrs]) if (f.sku_code) f.value = nameMap.get(f.sku_code) ?? f.sku_code;
  }
  model_attrs.sort((a, b) => a.order - b.order);
  sku_attrs.sort((a, b) => a.order - b.order);

  const pkey = parent ? (parent as Record<string, unknown>).cover_image_r2_key as string | null : null;
  // ใช้รูปของ SKU รุ่นสีนั้นก่อน (ถ้าไม่มี ค่อย fallback รูป Parent)
  const imgKey = skuRow.cover_image_r2_key ?? pkey ?? null;

  // วัตถุดิบจาก BOM เวอร์ชั่นหลัก (is_default) → จัดกลุ่มตามช่อง (slot_code)
  let bom_materials: BomMatGroup[] = []; let bom_version: string | null = null;
  const { data: hdrs } = await admin.from("bom_headers").select("bom_code, version, is_default").eq("product_sku", sku).eq("is_active", true).order("is_default", { ascending: false }).order("created_at", { ascending: true });
  const hdr = (hdrs ?? [])[0] as { bom_code: string; version: string | null } | undefined;
  if (hdr) {
    bom_version = hdr.version ?? null;
    const { data: lines } = await admin.from("bom_lines").select("slot_code, component_sku, component_name").eq("bom_code", hdr.bom_code).eq("is_active", true).not("slot_code", "is", null);
    // รวมวัตถุดิบที่ซ้ำ (ตัวเดียวกันหลายบล็อก) → เหลือชื่อเดียว + นับจำนวนบล็อก
    const bySlot = new Map<string, Map<string, { code: string; name: string; count: number }>>();
    for (const l of (lines ?? []) as Record<string, unknown>[]) {
      const slot = str(l.slot_code); if (!slot) continue;
      const code = str(l.component_sku);
      const m = bySlot.get(slot) ?? bySlot.set(slot, new Map()).get(slot)!;
      const e = m.get(code);
      if (e) e.count += 1; else m.set(code, { code, name: str(l.component_name) || code, count: 1 });
    }
    bom_materials = [...bySlot.entries()].map(([slot, m]) => ({ slot, label: SLOT_LABEL[slot] ?? slot, items: [...m.values()] }))
      .sort((a, b) => (SLOT_ORDER.indexOf(a.slot) + 99) - (SLOT_ORDER.indexOf(b.slot) + 99));
  }

  return NextResponse.json({
    parent: parent ? {
      code: (parent as Record<string, unknown>).code as string ?? null,
      name: ((parent as Record<string, unknown>).sku_name as string) ?? ((parent as Record<string, unknown>).name_th as string) ?? null,
      family: (parent as Record<string, unknown>).product_family as string ?? null,
      size_summary: str((parent as Record<string, unknown>).size_summary) || null,
      work_instruction_notes: str((parent as Record<string, unknown>).work_instruction_notes) || null,
      image_url: imgKey ? `/api/r2-image?key=${encodeURIComponent(imgKey)}` : null,
    } : null,
    legacy, model_attrs, sku_attrs, bom_materials, bom_version, error: null,
  });
}
