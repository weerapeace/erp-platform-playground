/**
 * ต้นทุน/กำไรต่อใบสั่งผลิต — /api/mo/<id>/cost
 * รวมข้อมูลคิดต้นทุน: ราคาขาย(list_price) · ต้นทุนวัตถุดิบ(Σ qty_per × standard_price)
 *   · ค่าแรงกลาง(เพดาน จาก bom_labor_rates) · ค่าแรงผลิตที่ตั้งจริง(est_labor_cost)
 * (งานเหมา ฝั่งหน้าใช้ /api/mo/piecework ที่โหลดอยู่แล้ว — ไม่ดึงซ้ำที่นี่)
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export type MoCostMaterial = { sku: string | null; name: string | null; material_type: string | null; uom: string | null; qty_per: number; unit_cost: number; line_pp: number; has_price: boolean };
// ค่าทดลองคำนวณต้นทุน (บันทึกต่อใบ) — ค่าแรงทดลอง "แทน" ค่าแรงระบบ · ค่าอื่นๆ "บวกเพิ่ม"
// งานเหมา 1 รายการ — เลือกได้ว่าเป็น "เหมา ฿/ชิ้น" หรือ "ประกอบที่โต๊ะ (เงินเดือน)"
export type PieceJob = {
  label: string;
  kind: "piece" | "table";
  rate: number;        // kind=piece: บาท/ชิ้น
  qty_per: number;     // จำนวนครั้ง/ชิ้น (default 1)
  salary: number;      // kind=table: เงินเดือนโต๊ะ
  workdays: number;    // kind=table: วันทำงาน/เดือน
  days: number;        // kind=table: จำนวนวันที่ใช้ทำงานนี้
  dept_name: string;   // kind=table: ชื่อโต๊ะ (แสดง)
};
// วัตถุดิบทดแทน (ตัวแทน) — แทนวัสดุรหัส orig_sku ด้วย sub_sku ตอนคิดต้นทุน (ไม่แตะ BOM จริง)
export type CostSubstitute = { orig_sku: string; sub_sku: string; sub_name: string; unit_cost: number };
export type CostScenario = {
  labor_mode: "system" | "piece" | "table" | "target";  // ใช้ค่าแรงแบบไหน (+target=คิดย้อนจากกำไร/ต้นทุนเป้าหมาย)
  piece_rate: number;                                 // (legacy) งานเหมา/ชิ้น ช่องเดียวเดิม
  piece_jobs?: PieceJob[];                            // ใหม่: รายการงานเหมา (โหมด piece)
  // โหมดจ่ายโต๊ะ: เลือกทั้งโต๊ะ หรือ เลือกบางคน (multi-pick) → เงินเดือนรวม · 2 ทาง (ใส่วัน หรือ ใส่ค่าแรงเป้าหมาย→ได้วันสูงสุด)
  table: { salary: number; workdays: number; capacity: number; dept_name?: string; calc?: "days" | "target"; days?: number; target_pp?: number; pick_mode?: "table" | "workers"; worker_ids?: string[] };
  extras: { label: string; amount: number; per: "piece" | "mo" }[];   // ค่าส่ง/ค่าจิปาถะ ฯลฯ
  // โหมด target: ใส่เป้าหมาย → คิดงบค่าแรงที่จ่ายได้
  target?: { type: "margin_pct" | "profit_pp" | "cost_pp"; value: number } | null;
  substitutes?: CostSubstitute[];                     // วัตถุดิบทดแทน (คิดต้นทุนด้วยราคาตัวแทน)
  // "BOM ทดลอง": บรรทัดวัตถุดิบที่เก็บไว้ในใบคิดต้นทุนนี้เท่านั้น — ไม่แตะสูตรจริง
  //   mat_mode = ใช้ชุดไหนคิดต้นทุน (real = จาก BOM จริง · trial = จากบรรทัดทดลอง)
  mat_mode?: "real" | "trial";
  trial_lines?: CostTrialLine[];
};
/** 1 บรรทัดวัตถุดิบทดลอง (โครงเดียวกับ TrialLine ใน components/trial-bom) */
export type CostTrialLine = {
  key: string; sku: string | null; name: string; uom: string | null; unit_cost: number;
  mode: "nest" | "manual";
  face_width_cm: number; cut_width: number; cut_length: number; pieces: number;
  waste_percent: number; divisor: number; allow_rotate: boolean; qty_per: number;
  cut?: CostLineJob; print?: CostLineJob;   // ค่าตัด/ค่าพิมพ์ของบรรทัดนี้
};
/** ค่าแรงต่อบรรทัด (ตัด/พิมพ์) — เหมา ฿/ชิ้น หรือคิดจากค่าแรงรายวันของคนที่เลือก */
export type CostLineJob = {
  on: boolean; mode: "piece" | "daily"; rate: number;
  worker_ids: string[]; wage_month: number; workdays: number; per_day: number;
};
export type MoCost = {
  product_sku: string | null; product_name: string | null; qty: number;
  sell_price: number;                 // ราคาขาย/ชิ้น (list_price)
  material_cost_pp: number;           // ต้นทุนวัตถุดิบ/ชิ้น
  materials: MoCostMaterial[]; missing_price: number;
  central_rate: number;               // ค่าแรงกลาง/ชิ้น (เพดานห้ามเกิน)
  est_labor_total: number; est_labor_pp: number;   // ค่าแรงผลิตที่ตั้งจริง (รวม/ต่อชิ้น)
  scenario: CostScenario | null;      // ค่าทดลองที่บันทึกไว้ (ต่อใบนี้)
  parent_code: string | null;         // รหัส Parent SKU (ไว้บันทึกกลับเป็นต้นทุนมาตรฐาน)
  default_scenario: CostScenario | null;   // ต้นทุนมาตรฐานของสินค้า (ใช้เป็นค่าตั้งต้นถ้าใบนี้ยังไม่เคยคิด)
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: mo } = await admin.from("manufacturing_orders")
    .select("id, mo_no, product_sku, product_name, qty, bom_code, est_labor_cost, cost_scenario").eq("id", id).maybeSingle();
  if (!mo) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต" }, { status: 404 });
  const m = mo as Record<string, unknown>;
  const qty = num(m.qty);

  const { data: mats } = await admin.from("mo_material_summary")
    .select("component_sku, component_name, material_type, uom, qty_per").eq("mo_no", String(m.mo_no)).eq("is_active", true).order("sequence", { ascending: true });
  const matRows = (mats ?? []) as Record<string, unknown>[];

  // ราคา: standard_price(ต้นทุนวัตถุดิบ) + list_price(ราคาขายสินค้า) จาก skus_v2
  const codes = new Set<string>(); if (m.product_sku) codes.add(String(m.product_sku));
  for (const x of matRows) if (x.component_sku) codes.add(String(x.component_sku));
  const priceMap = new Map<string, { std: number; list: number }>();
  if (codes.size) {
    const { data: skus } = await admin.from("skus_v2").select("code, standard_price, list_price").in("code", [...codes]);
    for (const s of (skus ?? []) as Record<string, unknown>[]) priceMap.set(String(s.code), { std: num(s.standard_price), list: num(s.list_price) });
  }

  const sell_price = priceMap.get(String(m.product_sku))?.list ?? 0;
  let material_cost_pp = 0, missing_price = 0;
  const materials: MoCostMaterial[] = matRows.map((x) => {
    const sku = (x.component_sku as string) ?? null; const qp = num(x.qty_per);
    const unit = sku ? (priceMap.get(sku)?.std ?? 0) : 0; const line = r4(unit * qp);
    const has = unit > 0; if (!has) missing_price += 1; material_cost_pp += line;
    return { sku, name: (x.component_name as string) ?? null, material_type: (x.material_type as string) ?? null, uom: (x.uom as string) ?? null, qty_per: qp, unit_cost: unit, line_pp: line, has_price: has };
  });
  material_cost_pp = r4(material_cost_pp);

  const { data: lr } = await admin.from("bom_labor_rates").select("rate")
    .eq("bom_code", (m.bom_code as string) ?? "").is("craftsman_id", null).eq("is_current", true).eq("is_active", true).maybeSingle();
  const central_rate = num((lr as { rate?: number } | null)?.rate);
  const est_labor_total = num(m.est_labor_cost);
  const est_labor_pp = qty > 0 ? r4(est_labor_total / qty) : 0;

  // Parent SKU + ต้นทุนมาตรฐานของสินค้า (module คำนวณต้นทุน) — ใช้เป็นค่าตั้งต้นถ้าใบนี้ยังไม่เคยคิด
  let parent_code: string | null = null;
  let default_scenario: CostScenario | null = null;
  if (m.product_sku) {
    const { data: sk } = await admin.from("skus_v2").select("parent_sku_id").eq("code", String(m.product_sku)).maybeSingle();
    const pid = (sk as { parent_sku_id?: string } | null)?.parent_sku_id ?? null;
    if (pid) { const { data: pp } = await admin.from("parent_skus_v2").select("code").eq("id", pid).maybeSingle(); parent_code = (pp as { code?: string } | null)?.code ?? null; }
    if (!m.cost_scenario) {
      const pick = async (type: string, code: string): Promise<CostScenario | null> => {
        if (!code) return null;
        const { data } = await admin.from("product_costings").select("scenario").eq("target_type", type).eq("target_code", code).eq("is_current", true).eq("is_active", true).maybeSingle();
        return (data as { scenario?: CostScenario } | null)?.scenario ?? null;
      };
      default_scenario = (await pick("sku", String(m.product_sku))) ?? (parent_code ? await pick("parent", parent_code) : null);
    }
  }

  const data: MoCost = {
    product_sku: (m.product_sku as string) ?? null, product_name: (m.product_name as string) ?? null, qty,
    sell_price, material_cost_pp, materials, missing_price, central_rate, est_labor_total, est_labor_pp,
    scenario: (m.cost_scenario as CostScenario) ?? null,
    parent_code, default_scenario,
  };
  return NextResponse.json({ data, error: null });
}

// บันทึกค่าทดลองคำนวณต้นทุน (cost_scenario) ต่อใบ — เรื่องเงิน ต้องตามรอยได้
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  let body: { scenario?: CostScenario | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const { error } = await admin.from("manufacturing_orders").update({ cost_scenario: body.scenario ?? null }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "update_cost_scenario", entityType: "manufacturing_order", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { cleared: body.scenario == null } });
  return NextResponse.json({ data: { ok: true }, error: null });
}
