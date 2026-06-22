/**
 * ข้อมูลบอร์ดจ่ายงาน (whiteboard) — เฟส D (รื้อใหม่)
 * GET /api/mo/work-board
 *   → departments: โซนแผนก
 *   → workOrders: ใบจ่ายงาน active (+ แบรนด์/สี/รูป/แผนก) — ซ่อน done ฝั่ง client
 *   → pending: ใบสั่งผลิตที่ยังจ่ายไม่ครบ (การ์ดโซน "รอจ่าย") + ยอดจ่ายแล้ว/เหลือ
 * อ่านผ่าน supabaseAdmin + guardApi (join ข้ามตาราง master)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

type SkuInfo = { image_url: string | null; brand: string | null; brand_color: string | null };

async function skuInfoMap(admin: ReturnType<typeof supabaseAdmin>, skus: string[]): Promise<Map<string, SkuInfo>> {
  const map = new Map<string, SkuInfo>();
  const list = [...new Set(skus.filter(Boolean))];
  for (let i = 0; i < list.length; i += 300) {
    const chunk = list.slice(i, i + 300);
    const { data } = await admin.from("skus_v2")
      .select("code, cover_image_r2_key, parent:parent_skus_v2!parent_sku_id ( brand:brands!brand_id ( name, color ) )")
      .in("code", chunk);
    for (const s of (data ?? []) as Record<string, unknown>[]) {
      const parent = (Array.isArray(s.parent) ? s.parent[0] : s.parent) as { brand?: unknown } | null;
      const brand = (parent && (Array.isArray(parent.brand) ? parent.brand[0] : parent.brand)) as { name?: string; color?: string } | null;
      const key = s.cover_image_r2_key as string | null;
      map.set(String(s.code), {
        image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
        brand: brand?.name ?? null, brand_color: brand?.color ?? null,
      });
    }
  }
  return map;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const [{ data: depts }, { data: wos }, { data: mos }] = await Promise.all([
    admin.from("departments").select("id, name, status, note, show_note, display_order, show_on_board").order("display_order", { ascending: true, nullsFirst: false }).order("name", { ascending: true }),
    admin.from("mo_work_orders").select("*").eq("is_active", true).order("created_at", { ascending: true }).limit(2000),
    admin.from("manufacturing_orders").select("id, mo_no, product_sku, product_name, qty, status, due_date, prep_done, cut_done, est_labor_cost, bom_code").eq("is_active", true).not("status", "in", "(cancelled,done)").limit(1000),
  ]);

  const departments = (depts ?? []).filter((d: Record<string, unknown>) => !d.status || d.status === "active")
    .map((d: Record<string, unknown>) => ({ id: String(d.id), name: (d.name as string) ?? "—", note: (d.note as string) ?? null, show_note: !!d.show_note, show_on_board: d.show_on_board !== false }));

  const workOrders = (wos ?? []) as Record<string, unknown>[];
  const moList = (mos ?? []) as Record<string, unknown>[];

  // ── คำนวณชุดข้อมูลนำเข้า (sync) ก่อนยิง query รอบสอง ──
  const dispatchedByMo = new Map<string, number>();          // ยอดจ่ายแล้วต่อ MO (ไม่นับยกเลิก)
  const prodActualByMo = new Map<string, number>();          // ผลิต-จริง = ผลรวม labor_cost ใบจ่ายงาน
  for (const w of workOrders) {
    if (w.status === "cancelled") continue;
    const k = String(w.mo_no);
    dispatchedByMo.set(k, (dispatchedByMo.get(k) ?? 0) + (Number(w.qty) || 0));
    prodActualByMo.set(k, (prodActualByMo.get(k) ?? 0) + (Number(w.labor_cost) || 0));
  }
  const allSkus = [...workOrders.map((w) => w.product_sku as string), ...moList.map((m) => m.product_sku as string)].filter(Boolean) as string[];
  const moIdByNo = new Map<string, string>();
  const estByMo = new Map<string, number>(); const moQtyByNo = new Map<string, number>(); const bomByMo = new Map<string, string>();
  for (const m of moList) {
    moIdByNo.set(String(m.mo_no), String(m.id));
    estByMo.set(String(m.mo_no), Number(m.est_labor_cost) || 0);
    moQtyByNo.set(String(m.mo_no), Number(m.qty) || 0);
    if (m.bom_code) bomByMo.set(String(m.mo_no), String(m.bom_code));
  }
  const missingMoNos = [...new Set(workOrders.map((w) => String(w.mo_no)).filter(Boolean))].filter((n) => !moIdByNo.has(n));
  const bomCodes = [...new Set([...bomByMo.values()])];
  const allMoNos = [...new Set([...workOrders.map((w) => String(w.mo_no)), ...moList.map((m) => String(m.mo_no))].filter(Boolean))];
  // MO ที่ยังเหลือต้องจ่าย (remaining>0) → ใช้ดึงเช็กลิสต์วัตถุดิบ
  const pendingMoNos = moList.filter((m) => Math.max(0, (Number(m.qty) || 0) - (dispatchedByMo.get(String(m.mo_no)) ?? 0)) > 0.0001).map((m) => String(m.mo_no));
  const noData = { data: [] as Record<string, unknown>[] };

  // ── ยิง query รอบสองพร้อมกัน (เดิมยิงทีละตัว 5-6 รอบ = waterfall) ──
  const [info, extraMoRes, lrRes, pcsRes, sumsRes, matsRes] = await Promise.all([
    skuInfoMap(admin, allSkus),
    missingMoNos.length ? admin.from("manufacturing_orders").select("id, mo_no").in("mo_no", missingMoNos) : Promise.resolve(noData),
    bomCodes.length ? admin.from("bom_labor_rates").select("bom_code, rate").in("bom_code", bomCodes).is("craftsman_id", null).eq("is_current", true).eq("is_active", true) : Promise.resolve(noData),
    allMoNos.length ? admin.from("mo_piecework").select("mo_no, total_qty, rate, status").in("mo_no", allMoNos).eq("is_active", true) : Promise.resolve(noData),
    pendingMoNos.length ? admin.from("mo_material_summary").select("mo_no, is_ready").in("mo_no", pendingMoNos).eq("is_active", true) : Promise.resolve(noData),
    pendingMoNos.length ? admin.from("mo_materials").select("mo_no, cut_block_code, cut_length, pieces, cut_done").in("mo_no", pendingMoNos).eq("is_active", true) : Promise.resolve(noData),
  ]);

  for (const m of (extraMoRes.data ?? []) as Record<string, unknown>[]) moIdByNo.set(String(m.mo_no), String(m.id));
  const centralRateByBom = new Map<string, number>();
  for (const r of (lrRes.data ?? []) as Record<string, unknown>[]) centralRateByBom.set(String(r.bom_code), Number(r.rate) || 0);
  const centralRateOf = (moNo: string) => centralRateByBom.get(bomByMo.get(moNo) ?? "") ?? 0;
  const piecePlanByMo = new Map<string, number>(); const pieceActualByMo = new Map<string, number>();
  for (const p of (pcsRes.data ?? []) as Record<string, unknown>[]) {
    const k = String(p.mo_no); const amt = (Number(p.total_qty) || 0) * (Number(p.rate) || 0);
    piecePlanByMo.set(k, (piecePlanByMo.get(k) ?? 0) + amt);
    if (p.status === "done") pieceActualByMo.set(k, (pieceActualByMo.get(k) ?? 0) + amt);
  }
  const laborOfMo = (moNo: string) => ({
    prod_plan: r2(estByMo.get(moNo) ?? 0), prod_actual: r2(prodActualByMo.get(moNo) ?? 0),
    piece_plan: r2(piecePlanByMo.get(moNo) ?? 0), piece_actual: r2(pieceActualByMo.get(moNo) ?? 0),
  });

  const enrichedWO = workOrders.map((w) => {
    const inf = info.get(String(w.product_sku)) ?? { image_url: null, brand: null, brand_color: null };
    const moNo = String(w.mo_no);
    // ใบจ่ายงาน 1 ใบ = ส่วนแบ่งตามจำนวนของทั้งใบสั่งผลิต (กันนับซ้ำเมื่อ MO แตกหลายใบจ่ายงาน)
    const moQty = moQtyByNo.get(moNo) || dispatchedByMo.get(moNo) || (Number(w.qty) || 0);
    const share = moQty > 0 ? (Number(w.qty) || 0) / moQty : 1;
    const ml = laborOfMo(moNo);
    const labor = {
      prod_plan: r2(ml.prod_plan * share), prod_actual: Number(w.labor_cost) || 0,
      piece_plan: r2(ml.piece_plan * share), piece_actual: r2(ml.piece_actual * share),
    };
    return { ...w, ...inf, mo_id: moIdByNo.get(moNo) ?? null, labor, central_rate: centralRateOf(moNo) };
  });

  const pending = (mos ?? []).map((m: Record<string, unknown>) => {
    const qty = Number(m.qty) || 0;
    const dispatched = dispatchedByMo.get(String(m.mo_no)) ?? 0;
    const remaining = r2(Math.max(0, qty - dispatched));
    const inf = info.get(String(m.product_sku)) ?? { image_url: null, brand: null, brand_color: null };
    return { id: String(m.id), mo_no: m.mo_no, product_sku: m.product_sku, product_name: m.product_name,
      qty, dispatched: r2(dispatched), remaining, due_date: m.due_date ?? null, status: m.status,
      prep_done: !!m.prep_done, cut_done: !!m.cut_done, bom_code: (m.bom_code as string) ?? null, ...inf, labor: laborOfMo(String(m.mo_no)), central_rate: centralRateOf(String(m.mo_no)) };
  }).filter((m) => m.remaining > 0.0001);   // ซ่อน MO ที่จ่ายครบแล้ว

  // เช็กลิสต์วัตถุดิบจาก BOM ต่อใบ (ดึงมาแล้วในรอบ parallel ข้างบน: sumsRes/matsRes) — เตรียม=is_ready, ตัด=cut_done
  const prog = new Map<string, { prepTotal: number; prepDone: number; cutTotal: number; cutDone: number }>();
  for (const s of (sumsRes.data ?? []) as Record<string, unknown>[]) {
    const k = String(s.mo_no);
    const p = prog.get(k) ?? { prepTotal: 0, prepDone: 0, cutTotal: 0, cutDone: 0 };
    p.prepTotal += 1; if (s.is_ready) p.prepDone += 1;
    prog.set(k, p);
  }
  for (const x of (matsRes.data ?? []) as Record<string, unknown>[]) {
    if (!(x.cut_block_code != null || x.cut_length != null || x.pieces != null)) continue;
    const k = String(x.mo_no);
    const p = prog.get(k) ?? { prepTotal: 0, prepDone: 0, cutTotal: 0, cutDone: 0 };
    p.cutTotal += 1; if (x.cut_done) p.cutDone += 1;
    prog.set(k, p);
  }
  const pendingEnriched = pending.map((p) => {
    const pr = prog.get(String(p.mo_no));
    if (pr && pr.prepTotal > 0) {
      const ready = pr.prepDone >= pr.prepTotal && pr.cutDone >= pr.cutTotal;
      return { ...p, has_bom: true, prep_total: pr.prepTotal, prep_ready: pr.prepDone, cut_total: pr.cutTotal, cut_ready: pr.cutDone, ready };
    }
    return { ...p, has_bom: false, prep_total: 0, prep_ready: 0, cut_total: 0, cut_ready: 0, ready: p.prep_done && p.cut_done };
  });

  return NextResponse.json({ departments, workOrders: enrichedWO, pending: pendingEnriched, error: null });
}
