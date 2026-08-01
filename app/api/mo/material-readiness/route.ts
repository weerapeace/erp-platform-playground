/**
 * ความพร้อมวัตถุดิบของทุกใบสั่งผลิต — /api/mo/material-readiness  (เฟส 1 ของโมดูล "เตรียมของ")
 * GET → { summary, mos[], missing[] }
 *   • mos[]     = ใบสั่งผลิตที่ยังไม่จบ + % ความพร้อม + สถานะ (พร้อม/กำลังเตรียม/รอของ/ติดของหลัก)
 *   • missing[] = อันดับวัตถุดิบที่ขาด (รวมทุกใบ) → รู้ว่าควรซื้ออะไรก่อน
 *   • summary   = ตัวเลขหัวแดชบอร์ด
 * ระดับความสำคัญมาจาก material_groups.criticality (critical / required / consumable)
 *   - critical ไม่ครบ = "ติดของหลัก" (ผลิตไม่ได้) · consumable ไม่นับใน % (ของสิ้นเปลือง)
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type Criticality = "critical" | "required" | "consumable";
export type ReadinessLine = {
  summary_id: string | null;
  component_sku: string | null;
  component_name: string | null;
  material_type: string | null;
  uom: string | null;
  image: string | null;
  required: number;
  on_hand: number;
  to_purchase: number;
  is_ready: boolean;
  criticality: Criticality;
};
export type ReadinessMo = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  image: string | null; qty: number; due_date: string | null; status: string | null;
  total: number; ready: number; pct: number;                 // นับเฉพาะ critical+required (ไม่รวมสิ้นเปลือง)
  critical_total: number; critical_ready: number;
  blocked: boolean;                                          // ของหลักยังไม่ครบ = ผลิตไม่ได้
  state: "ready" | "preparing" | "waiting" | "no_bom";
  missing_count: number;
  lines: ReadinessLine[];
};
/** ของที่สั่งซื้อไปแล้วแต่ยังไม่เข้า — กันสั่งซ้ำ */
export type Incoming = { qty: number; expected: string | null; po_nos: string[] };
export type MissingRow = {
  component_sku: string | null; component_name: string | null; image: string | null;
  uom: string | null; criticality: Criticality;
  total_missing: number; mo_count: number; mo_nos: string[];
  incoming: Incoming | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: mos } = await admin.from("manufacturing_orders")
    .select("id, mo_no, qty, product_sku, product_name, due_date, status")
    .eq("is_active", true).not("status", "in", "(cancelled,done)").limit(1000);
  const moList = (mos ?? []) as Record<string, unknown>[];
  if (moList.length === 0) {
    return NextResponse.json({ summary: { total: 0, ready: 0, preparing: 0, waiting: 0, blocked: 0, no_bom: 0 }, mos: [], missing: [], error: null });
  }
  const moNos = moList.map((m) => String(m.mo_no));

  const { data: sums } = await admin.from("mo_material_summary")
    .select("id, mo_no, component_sku, component_name, material_type, uom, qty_per, required_qty, on_hand_qty, to_purchase_qty, is_ready")
    .in("mo_no", moNos).eq("is_active", true);
  const sumList = (sums ?? []) as Record<string, unknown>[];

  // วัตถุดิบ → รูป + ระดับความสำคัญ (skus_v2.material_group_id → material_groups.criticality)
  const matCodes = [...new Set([
    ...sumList.map((s) => String(s.component_sku ?? "").trim()),
    ...moList.map((m) => String(m.product_sku ?? "").trim()),
  ].filter(Boolean))];
  const [{ data: skus }, { data: groups }] = await Promise.all([
    matCodes.length
      ? admin.from("skus_v2").select("id, code, cover_image_r2_key, material_group_id").in("code", matCodes.slice(0, 2000))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from("material_groups").select("id, criticality"),
  ]);
  const critByGroup = new Map((groups ?? []).map((g) => [String((g as Record<string, unknown>).id), String((g as Record<string, unknown>).criticality ?? "required") as Criticality]));
  const imgByCode = new Map<string, string>();
  const critByCode = new Map<string, Criticality>();
  const codeBySkuId = new Map<string, string>();
  for (const s of (skus ?? []) as Record<string, unknown>[]) {
    const code = String(s.code);
    if (s.cover_image_r2_key) imgByCode.set(code, `/api/r2-image?key=${encodeURIComponent(String(s.cover_image_r2_key))}&w=120`);
    critByCode.set(code, critByGroup.get(String(s.material_group_id ?? "")) ?? "required");
    if (s.id) codeBySkuId.set(String(s.id), code);
  }

  // "ของกำลังมา" — ใบสั่งซื้อที่สั่งแล้วแต่ยังรับไม่ครบ (กันสั่งซ้ำ)
  const incomingByCode = new Map<string, Incoming>();
  const skuIds = [...codeBySkuId.keys()];
  if (skuIds.length > 0) {
    const { data: poLines } = await admin.from("purchase_order_lines_v2")
      .select("item_sku_id, qty, qty_received, line_status, po:purchase_orders_v2!po_id ( po_number, expected_date, is_active )")
      .in("item_sku_id", skuIds.slice(0, 2000)).eq("is_active", true)
      .not("line_status", "in", "(received,short_closed,closed_short,cancelled)");   // ⚠️ DB มีทั้ง short_closed/closed_short — รับทั้งสองแบบ
    for (const l of (poLines ?? []) as Record<string, unknown>[]) {
      const poRel = l.po as Record<string, unknown> | Record<string, unknown>[] | null;
      const po = (Array.isArray(poRel) ? poRel[0] : poRel) ?? null;
      if (!po || po.is_active === false) continue;
      const left = num(l.qty) - num(l.qty_received);
      if (left <= 0) continue;
      const code = codeBySkuId.get(String(l.item_sku_id));
      if (!code) continue;
      const prev = incomingByCode.get(code) ?? { qty: 0, expected: null, po_nos: [] };
      prev.qty = r2(prev.qty + left);
      const exp = (po.expected_date as string) ?? null;
      if (exp && (!prev.expected || exp < prev.expected)) prev.expected = exp;   // เอาวันที่ใกล้สุด
      const poNo = (po.po_number as string) ?? "";
      if (poNo && !prev.po_nos.includes(poNo) && prev.po_nos.length < 10) prev.po_nos.push(poNo);
      incomingByCode.set(code, prev);
    }
  }

  const linesByMo = new Map<string, ReadinessLine[]>();
  for (const s of sumList) {
    const moNo = String(s.mo_no);
    const code = String(s.component_sku ?? "").trim();
    const mo = moList.find((m) => String(m.mo_no) === moNo);
    const moQty = num(mo?.qty);
    const required = num(s.required_qty) > 0 ? num(s.required_qty) : r2(num(s.qty_per) * moQty);
    const onHand = num(s.on_hand_qty);
    const line: ReadinessLine = {
      summary_id: s.id ? String(s.id) : null,
      component_sku: code || null,
      component_name: (s.component_name as string) ?? null,
      material_type: (s.material_type as string) ?? null,
      uom: (s.uom as string) ?? null,
      image: imgByCode.get(code) ?? null,
      required: r2(required),
      on_hand: r2(onHand),
      to_purchase: r2(num(s.to_purchase_qty)),
      // "พร้อม" = พนักงานติ๊กเตรียมแล้ว หรือ ของที่มีพอกับที่ต้องใช้
      is_ready: !!s.is_ready || (required > 0 && onHand >= required),
      criticality: critByCode.get(code) ?? "required",
    };
    (linesByMo.get(moNo) ?? linesByMo.set(moNo, []).get(moNo)!).push(line);
  }

  const out: ReadinessMo[] = moList.map((m) => {
    const moNo = String(m.mo_no);
    const lines = (linesByMo.get(moNo) ?? []).sort((a, b) =>
      Number(a.is_ready) - Number(b.is_ready) || a.criticality.localeCompare(b.criticality) || String(a.component_name).localeCompare(String(b.component_name), "th"));
    const counted = lines.filter((l) => l.criticality !== "consumable");   // ของสิ้นเปลืองไม่นับใน %
    const ready = counted.filter((l) => l.is_ready).length;
    const crit = counted.filter((l) => l.criticality === "critical");
    const critReady = crit.filter((l) => l.is_ready).length;
    const pct = counted.length === 0 ? 0 : Math.round((ready / counted.length) * 100);
    const blocked = crit.length > 0 && critReady < crit.length;
    const state: ReadinessMo["state"] = lines.length === 0 ? "no_bom" : pct === 100 ? "ready" : ready === 0 ? "waiting" : "preparing";
    return {
      id: String(m.id), mo_no: moNo,
      product_sku: (m.product_sku as string) ?? null, product_name: (m.product_name as string) ?? null,
      image: imgByCode.get(String(m.product_sku ?? "").trim()) ?? null,
      qty: num(m.qty), due_date: (m.due_date as string) ?? null, status: (m.status as string) ?? null,
      total: counted.length, ready, pct,
      critical_total: crit.length, critical_ready: critReady, blocked,
      state, missing_count: counted.length - ready,
      lines,
    };
  });

  // อันดับวัตถุดิบที่ขาด — รวมจากทุกใบที่ยังไม่พร้อม
  const missMap = new Map<string, MissingRow>();
  for (const mo of out) {
    for (const l of mo.lines) {
      if (l.is_ready || l.criticality === "consumable") continue;
      const key = l.component_sku ?? l.component_name ?? "?";
      const prev = missMap.get(key) ?? {
        component_sku: l.component_sku, component_name: l.component_name, image: l.image,
        uom: l.uom, criticality: l.criticality, total_missing: 0, mo_count: 0, mo_nos: [],
        incoming: (l.component_sku && incomingByCode.get(l.component_sku)) || null,
      };
      prev.total_missing = r2(prev.total_missing + Math.max(0, l.required - l.on_hand));
      prev.mo_count += 1;
      if (prev.mo_nos.length < 50) prev.mo_nos.push(mo.mo_no);
      missMap.set(key, prev);
    }
  }
  const missing = [...missMap.values()].sort((a, b) => b.mo_count - a.mo_count || b.total_missing - a.total_missing);

  const summary = {
    total: out.length,
    ready: out.filter((m) => m.state === "ready").length,
    preparing: out.filter((m) => m.state === "preparing").length,
    waiting: out.filter((m) => m.state === "waiting").length,
    blocked: out.filter((m) => m.blocked).length,
    no_bom: out.filter((m) => m.state === "no_bom").length,
    missing_items: missing.length,
    missing_ordered: missing.filter((r) => r.incoming && r.incoming.qty > 0).length,   // ขาดแต่สั่งซื้อไปแล้ว
  };

  return NextResponse.json({ summary, mos: out, missing, error: null });
}
