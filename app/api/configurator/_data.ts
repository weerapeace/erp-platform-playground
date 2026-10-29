/**
 * ตัวประกอบสินค้า — ตัวช่วยฝั่ง server ที่อ่าน/เขียนหลายตารางพร้อมกัน
 *   loadBundle()          = ข้อมูลครบ 1 ทรง (ทรง ช่อง ตัวเลือก ชั้น รูป กติกา) ให้สตูดิโอโหลดครั้งเดียว
 *   createFromBlueprint() = สร้างทรงใหม่ทั้งชุดจากแบบพิมพ์เขียว (สร้างทรงตัวอย่าง / สำเนาทรง) · พังกลางทาง = ลบทรงที่สร้างค้างทิ้ง
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Blueprint, CfgImage, CfgLayer, CfgModel, CfgOption, CfgRule, CfgSlot, ConfigData } from "@/lib/product-configurator";

type Db = ReturnType<typeof supabaseAdmin>;

const num = (v: unknown) => Number(v) || 0;
const normModel = (m: Record<string, unknown>): CfgModel => ({
  ...(m as unknown as CfgModel), base_price: num(m.base_price), lead_days: num(m.lead_days), sort_order: num(m.sort_order),
  views: Array.isArray(m.views) ? (m.views as CfgModel["views"]) : ["front"],
  canvas: (m.canvas as CfgModel["canvas"]) ?? { w: 3000, h: 3000 }, view_config: (m.view_config as CfgModel["view_config"]) ?? {},
});
const normOption = (o: Record<string, unknown>): CfgOption => ({ ...(o as unknown as CfgOption), price_delta: num(o.price_delta), lead_days: num(o.lead_days), sort_order: num(o.sort_order), attrs: (o.attrs as CfgOption["attrs"]) ?? {} });

export async function loadBundle(admin: Db, modelId: string): Promise<{ data: ConfigData | null; error: string | null }> {
  const { data: model, error } = await admin.from("configurator_models").select("*").eq("id", modelId).is("deleted_at", null).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!model) return { data: null, error: "ไม่พบทรงนี้ (อาจถูกลบไปแล้ว)" };
  const [slots, options, layers, rules] = await Promise.all([
    admin.from("configurator_slots").select("*").eq("model_id", modelId).order("sort_order"),
    admin.from("configurator_options").select("*").eq("model_id", modelId).is("deleted_at", null).order("sort_order"),
    admin.from("configurator_layers").select("*").eq("model_id", modelId).order("z_index"),
    admin.from("configurator_rules").select("*").eq("model_id", modelId).order("sort_order"),
  ]);
  const err = slots.error ?? options.error ?? layers.error ?? rules.error;
  if (err) return { data: null, error: err.message };
  const layerIds = (layers.data ?? []).map((l) => l.id as string);
  let images: CfgImage[] = [];
  // รูปอาจมีหลายพันไฟล์ → อ่านทีละ 1000 (เพดาน PostgREST)
  for (let from = 0; layerIds.length; from += 1000) {
    const { data, error: imErr } = await admin.from("configurator_layer_images").select("*").in("layer_id", layerIds).order("id").range(from, from + 999);
    if (imErr) return { data: null, error: imErr.message };
    images = images.concat((data ?? []) as CfgImage[]);
    if (!data || data.length < 1000) break;
  }
  return {
    data: {
      model: normModel(model), slots: (slots.data ?? []) as CfgSlot[], options: (options.data ?? []).map(normOption),
      layers: (layers.data ?? []) as CfgLayer[], images, rules: (rules.data ?? []) as CfgRule[],
    },
    error: null,
  };
}

/** หา "รหัสทรง" ที่ยังว่างในร้าน (TOTE → TOTE-2 → TOTE-3 …) */
export async function freeModelCode(admin: Db, shopId: string, want: string): Promise<string> {
  const { data } = await admin.from("configurator_models").select("code").eq("shop_id", shopId).is("deleted_at", null);
  const taken = new Set((data ?? []).map((r) => r.code as string));
  if (!taken.has(want)) return want;
  const base = want.replace(/-\d+$/, "");
  for (let i = 2; i < 200; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now() % 100000}`;
}

export async function createFromBlueprint(admin: Db, shopId: string, bp: Blueprint): Promise<{ modelId: string | null; error: string | null; counts?: Record<string, number> }> {
  const { data: model, error } = await admin.from("configurator_models").insert({ ...bp.model, shop_id: shopId }).select("id").single();
  if (error || !model) return { modelId: null, error: error?.message ?? "สร้างทรงไม่สำเร็จ" };
  const modelId = model.id as string;
  const fail = async (msg: string) => { await admin.from("configurator_models").delete().eq("id", modelId); return { modelId: null, error: msg }; };

  const slotRows = bp.slots.map(({ options: _o, ...s }) => ({ ...s, model_id: modelId }));
  const { data: slots, error: sErr } = slotRows.length ? await admin.from("configurator_slots").insert(slotRows).select("id, code") : { data: [], error: null };
  if (sErr) return fail(sErr.message);
  const slotId = new Map((slots ?? []).map((s) => [s.code as string, s.id as string]));

  const optionRows = bp.slots.flatMap((s) => s.options.map((o) => ({ ...o, model_id: modelId, slot_id: slotId.get(s.code) })));
  if (optionRows.length) { const { error: oErr } = await admin.from("configurator_options").insert(optionRows); if (oErr) return fail(oErr.message); }

  const layerRows = bp.layers.map(({ images: _im, ...l }) => ({ ...l, model_id: modelId }));
  const { data: layers, error: lErr } = layerRows.length ? await admin.from("configurator_layers").insert(layerRows).select("id, view, code") : { data: [], error: null };
  if (lErr) return fail(lErr.message);
  const layerId = new Map((layers ?? []).map((l) => [`${l.view}:${l.code}`, l.id as string]));

  const imageRows = bp.layers.flatMap((l) => l.images.map((im) => ({ ...im, layer_id: layerId.get(`${l.view}:${l.code}`) })));
  for (let i = 0; i < imageRows.length; i += 500) {
    const { error: iErr } = await admin.from("configurator_layer_images").insert(imageRows.slice(i, i + 500));
    if (iErr) return fail(iErr.message);
  }
  if (bp.rules.length) { const { error: rErr } = await admin.from("configurator_rules").insert(bp.rules.map((r) => ({ ...r, model_id: modelId }))); if (rErr) return fail(rErr.message); }

  return { modelId, error: null, counts: { slots: slotRows.length, options: optionRows.length, layers: layerRows.length, images: imageRows.length, rules: bp.rules.length } };
}
