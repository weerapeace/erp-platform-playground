/**
 * /api/sku-trade-history — ประวัติ "ซื้อ" และ "ขาย" ของ SKU ตัวเดียว (แท็บ 📜 ประวัติซื้อ-ขาย ในหน้า SKU)
 *
 * GET ?sku_id=<uuid>
 *   purchases: บรรทัดใบสั่งซื้อ (purchase_order_lines_v2 + purchase_orders_v2) + ใบขอซื้อที่ยังไม่ออก PO (purchase_requests_v2)
 *   sales:     บรรทัดใบขาย (erp_playground_so_lines + erp_playground_sales_orders) + ใบเสนอราคา (erp_playground_quote_lines + quotations)
 *   summary:   รวมจำนวนซื้อ/ขาย · ราคาซื้อ-ขายล่าสุด
 *
 * สิทธิ์: products.view · ราคาซื้อ (ต้นทุน) ส่งเฉพาะคนมี products.cost.view (ตัดที่ server)
 * หมายเหตุ: ฝั่งขายอ้าง SKU ด้วย product_id (uuid) เป็นหลัก และ fallback ด้วยรหัส (sku text)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi, apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { computeMoStatus } from "@/lib/mo-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type TradeRow = {
  id: string;                 // id ของบรรทัด
  doc_id: string | null;      // id ของใบ (ไว้เปิดใบ)
  kind: "po" | "pr" | "so" | "quote";
  doc_no: string | null;
  date: string | null;        // วันที่ใบ (ISO date)
  partner: string | null;     // ร้าน / ลูกค้า
  qty: number | null;
  uom: string | null;
  price: number | null;       // ราคาต่อหน่วย (ซื้อ = null ถ้าไม่มีสิทธิ์ดูต้นทุน)
  total: number | null;
  currency: string | null;
  status: string | null;
  extra: string | null;       // เช่น เลขใบกำกับ / รับแล้วกี่ชิ้น
};
export type TradeSummary = {
  buy_qty: number; buy_docs: number; last_buy: { price: number; currency: string; date: string | null } | null;
  sell_qty: number; sell_docs: number; last_sell: { price: number; date: string | null } | null;
  made_qty: number; made_docs: number;        // ผลิตสินค้านี้: รับคืนแล้วรวม / จำนวนใบสั่งผลิต
  material_docs: number;                      // ถูกใช้เป็นวัตถุดิบในกี่ใบสั่งผลิต
};
/** ประวัติผลิต — 1 แถว = 1 ใบสั่งผลิต (MO) */
export type ProductionRow = {
  mo_id: string | null; mo_no: string;
  role: "product" | "material";       // product = ผลิตสินค้านี้ · material = ใช้สินค้านี้เป็นวัตถุดิบ
  product_sku: string | null; product_name: string | null;   // (role=material) สินค้าที่ผลิต
  qty: number | null;                 // product: จำนวนสั่งผลิต · material: จำนวนที่ต้องใช้รวม
  uom: string | null;
  dispatched: number; received: number;   // จ่ายงานแล้ว / รับคืนแล้ว (ของ MO นั้น)
  status_label: string; status_tone: string;   // สถานะ 9 ขั้นของกลาง (lib/mo-status)
  order_date: string | null; due_date: string | null;
  so_order_no: string | null;
  extra: string | null;               // เช่น "ตัดแล้ว" / "ของพร้อม"
};

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const skuId = (request.nextUrl.searchParams.get("sku_id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(skuId)) return NextResponse.json({ error: "ต้องระบุ sku_id" }, { status: 400 });
  const admin = supabaseAdmin();
  const canCost = await apiCan(request, "products.cost.view");

  const { data: sku } = await admin.from("skus_v2").select("id, code, name_th").eq("id", skuId).maybeSingle();
  if (!sku) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const code = String(sku.code ?? "");

  type PoLine = { id: string; po_id: string | null; qty: unknown; uom: string | null; price_est: unknown; line_total: unknown; currency: string | null; qty_received: unknown; line_status: string | null; created_at: string };
  type Po = { id: string; po_no: string | null; seller_name: string | null; order_date: string | null; status: string | null; currency: string | null };
  type Pr = { id: string; pr_no: string | null; requester: string | null; status: string | null; order_date: string | null; created_at: string; qty: unknown; uom: string | null; price_est: unknown; seller_name: string | null; currency: string | null; po_id: string | null };
  type SoLine = { id: string; so_id: string; qty: unknown; unit: string | null; unit_price: unknown; line_total: unknown; created_at: string };
  type So = { id: string; so_number: string | null; customer_name: string | null; order_date: string | null; status: string | null; tax_invoice_no: string | null; currency: string | null };
  type QLine = { id: string; quote_id: string; qty: unknown; unit: string | null; unit_price: unknown; line_total: unknown; created_at: string };
  type Quote = { id: string; quote_number: string | null; customer_name: string | null; quote_date: string | null; status: string | null; currency: string | null; converted_so_id: string | null };

  // ฝั่งขายอ้างด้วย product_id หรือรหัส — ดึงทั้งสองแบบแล้วรวม (กันเคสรหัสถูกพิมพ์เอง)
  // รหัส SKU 43% มี # และอาจมี , ( ) . → ครอบด้วยเครื่องหมายคำพูดตามกติกา PostgREST (escape \" ข้างใน)
  const quoted = `"${code.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const skuMatch = code ? `product_id.eq.${skuId},sku.eq.${quoted}` : `product_id.eq.${skuId}`;

  const [poLinesRes, prRes, soLinesRes, qLinesRes] = await Promise.all([
    admin.from("purchase_order_lines_v2").select("id, po_id, qty, uom, price_est, line_total, currency, qty_received, line_status, created_at").eq("item_sku_id", skuId).not("is_active", "is", false),
    admin.from("purchase_requests_v2").select("id, pr_no, requester, status, order_date, created_at, qty, uom, price_est, seller_name, currency, po_id").eq("item_sku_id", skuId).is("po_id", null).not("is_active", "is", false),
    admin.from("erp_playground_so_lines").select("id, so_id, qty, unit, unit_price, line_total, created_at").or(skuMatch),
    admin.from("erp_playground_quote_lines").select("id, quote_id, qty, unit, unit_price, line_total, created_at").or(skuMatch),
  ]);
  const poLines = (poLinesRes.data ?? []) as PoLine[];
  const prs = (prRes.data ?? []) as Pr[];
  const soLines = (soLinesRes.data ?? []) as SoLine[];
  const qLines = (qLinesRes.data ?? []) as QLine[];

  // หัวใบ — ดึงรอบเดียวต่อชนิด
  const poIds = [...new Set(poLines.map((l) => l.po_id).filter((x): x is string => !!x))];
  const soIds = [...new Set(soLines.map((l) => l.so_id))];
  const qIds = [...new Set(qLines.map((l) => l.quote_id))];
  const [poRes, soRes, qRes] = await Promise.all([
    poIds.length ? admin.from("purchase_orders_v2").select("id, po_no, seller_name, order_date, status, currency").in("id", poIds) : Promise.resolve({ data: [] }),
    soIds.length ? admin.from("erp_playground_sales_orders").select("id, so_number, customer_name, order_date, status, tax_invoice_no, currency").in("id", soIds) : Promise.resolve({ data: [] }),
    qIds.length ? admin.from("erp_playground_quotations").select("id, quote_number, customer_name, quote_date, status, currency, converted_so_id").in("id", qIds) : Promise.resolve({ data: [] }),
  ]);
  const poMap = new Map(((poRes.data ?? []) as Po[]).map((p) => [p.id, p]));
  const soMap = new Map(((soRes.data ?? []) as So[]).map((s) => [s.id, s]));
  const qMap = new Map(((qRes.data ?? []) as Quote[]).map((q) => [q.id, q]));

  const purchases: TradeRow[] = [
    ...poLines.map((l): TradeRow => {
      const h = l.po_id ? poMap.get(l.po_id) : undefined;
      const rec = num(l.qty_received);
      return {
        id: l.id, doc_id: l.po_id, kind: "po", doc_no: h?.po_no ?? null, date: h?.order_date ?? l.created_at.slice(0, 10),
        partner: h?.seller_name ?? null, qty: num(l.qty), uom: l.uom,
        price: canCost ? num(l.price_est) : null, total: canCost ? num(l.line_total) : null, currency: l.currency ?? h?.currency ?? null,
        status: h?.status ?? l.line_status ?? null, extra: rec && rec > 0 ? `รับแล้ว ${rec.toLocaleString("th-TH")}` : null,
      };
    }),
    ...prs.map((p): TradeRow => ({
      id: p.id, doc_id: p.id, kind: "pr", doc_no: p.pr_no, date: p.order_date ?? p.created_at.slice(0, 10),
      partner: p.seller_name ?? null, qty: num(p.qty), uom: p.uom,
      price: canCost ? num(p.price_est) : null, total: canCost && num(p.price_est) != null && num(p.qty) != null ? (num(p.price_est) as number) * (num(p.qty) as number) : null,
      currency: p.currency ?? null, status: p.status, extra: p.requester ? `ผู้ขอ ${p.requester}` : null,
    })),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const sales: TradeRow[] = [
    ...soLines.map((l): TradeRow => {
      const h = soMap.get(l.so_id);
      return {
        id: l.id, doc_id: l.so_id, kind: "so", doc_no: h?.so_number ?? null, date: h?.order_date ?? l.created_at.slice(0, 10),
        partner: h?.customer_name ?? null, qty: num(l.qty), uom: l.unit, price: num(l.unit_price), total: num(l.line_total),
        currency: h?.currency ?? "THB", status: h?.status ?? null, extra: h?.tax_invoice_no ? `ใบกำกับ ${h.tax_invoice_no}` : null,
      };
    }),
    ...qLines.map((l): TradeRow => {
      const h = qMap.get(l.quote_id);
      return {
        id: l.id, doc_id: l.quote_id, kind: "quote", doc_no: h?.quote_number ?? null, date: h?.quote_date ?? l.created_at.slice(0, 10),
        partner: h?.customer_name ?? null, qty: num(l.qty), uom: l.unit, price: num(l.unit_price), total: num(l.line_total),
        currency: h?.currency ?? "THB", status: h?.status ?? null, extra: h?.converted_so_id ? "แปลงเป็นใบขายแล้ว" : null,
      };
    }),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // ───── 🏭 ประวัติผลิต — ใบสั่งผลิต (manufacturing_orders) อ้างสินค้าด้วย "รหัส" ไม่ใช่ id ─────
  type Mo = { id: string; mo_no: string; product_sku: string | null; product_name: string | null; qty: unknown; status: string | null; due_date: string | null; order_date: string | null; so_order_no: string | null; created_at: string; finished_received: boolean | null; delivery_confirmed: boolean | null };
  type Mat = { mo_no: string; required_qty: unknown; uom: string | null; cut_done: boolean | null; is_ready: boolean | null };
  type Wo = { mo_no: string; qty: unknown; received_qty: unknown; status: string | null };
  const production: ProductionRow[] = [];
  if (code) {
    const [moRes, matRes] = await Promise.all([
      admin.from("manufacturing_orders").select("id, mo_no, product_sku, product_name, qty, status, due_date, order_date, so_order_no, created_at, finished_received, delivery_confirmed").eq("product_sku", code).not("is_active", "is", false),
      admin.from("mo_materials").select("mo_no, required_qty, uom, cut_done, is_ready").eq("component_sku", code).not("is_active", "is", false),
    ]);
    const asProduct = (moRes.data ?? []) as Mo[];
    const mats = (matRes.data ?? []) as Mat[];
    // รวมวัตถุดิบต่อ MO (แถวไซส์หลายแถว → 1 แถวต่อใบ)
    const matByMo = new Map<string, { qty: number; uom: string | null; cut: number; rows: number; ready: number }>();
    for (const m of mats) {
      const cur = matByMo.get(m.mo_no) ?? { qty: 0, uom: m.uom, cut: 0, rows: 0, ready: 0 };
      cur.qty += num(m.required_qty) ?? 0; cur.rows++; if (m.cut_done) cur.cut++; if (m.is_ready) cur.ready++;
      matByMo.set(m.mo_no, cur);
    }
    const matMoNos = [...matByMo.keys()].filter((n) => !asProduct.some((m) => m.mo_no === n));
    const matMos = matMoNos.length
      ? ((await admin.from("manufacturing_orders").select("id, mo_no, product_sku, product_name, qty, status, due_date, order_date, so_order_no, created_at, finished_received, delivery_confirmed").in("mo_no", matMoNos).not("is_active", "is", false)).data ?? []) as Mo[]
      : [];
    const allMos = [...asProduct, ...matMos];
    const allNos = [...new Set(allMos.map((m) => m.mo_no))];
    // สถานะ 9 ขั้น (ของกลางเดียวกับบอร์ดจ่ายงาน/Dashboard ผลิต): เตรียม-ตัด จาก RPC + จ่าย/รับคืน จากใบงาน
    const [pcRes, woRes] = allNos.length ? await Promise.all([
      admin.rpc("erp_mo_prep_cut", { p_mo_nos: allNos }),
      admin.from("mo_work_orders").select("mo_no, qty, received_qty, status").in("mo_no", allNos).eq("is_active", true),
    ]) : [{ data: null }, { data: [] }];
    const prepCut = (pcRes.data ?? {}) as Record<string, { pd: number; pt: number; cd: number; ct: number }>;
    const disp = new Map<string, number>(); const recv = new Map<string, number>();
    for (const w of (woRes.data ?? []) as Wo[]) {
      if (w.status === "cancelled") continue;
      disp.set(w.mo_no, (disp.get(w.mo_no) ?? 0) + (num(w.qty) ?? 0));
      recv.set(w.mo_no, (recv.get(w.mo_no) ?? 0) + (num(w.received_qty) ?? 0));
    }
    const rowOf = (m: Mo, role: ProductionRow["role"]): ProductionRow => {
      const pc = prepCut[m.mo_no] ?? { pd: 0, pt: 0, cd: 0, ct: 0 };
      const dispatched = disp.get(m.mo_no) ?? 0, received = recv.get(m.mo_no) ?? 0;
      const st = m.status === "cancelled" ? { label: "ยกเลิก", tone: "gray" } : computeMoStatus({ prepDone: pc.pd, prepTotal: pc.pt, cutDone: pc.cd, cutTotal: pc.ct, qty: num(m.qty) ?? 0, dispatched, received });
      const mat = matByMo.get(m.mo_no);
      return {
        mo_id: m.id, mo_no: m.mo_no, role, product_sku: m.product_sku, product_name: m.product_name,
        qty: role === "product" ? num(m.qty) : (mat?.qty ?? null), uom: role === "product" ? null : (mat?.uom ?? null),
        dispatched, received, status_label: st.label, status_tone: st.tone,
        order_date: m.order_date ?? m.created_at.slice(0, 10), due_date: m.due_date, so_order_no: m.so_order_no,
        extra: role === "material" && mat ? (mat.cut >= mat.rows && mat.rows > 0 ? "ตัดแล้ว" : mat.ready >= mat.rows && mat.rows > 0 ? "ของพร้อม" : null) : (m.delivery_confirmed ? "ยืนยันส่งแล้ว" : null),
      };
    };
    for (const m of asProduct) production.push(rowOf(m, "product"));
    for (const m of matMos) production.push(rowOf(m, "material"));
    production.sort((a, b) => (b.order_date ?? "").localeCompare(a.order_date ?? ""));
  }

  // สรุป — นับเฉพาะเอกสารจริง (PO ที่ไม่ใช่ร่าง / ใบขายที่ไม่ยกเลิก-ไม่ร่าง)
  const realBuys = purchases.filter((r) => r.kind === "po" && r.status !== "draft" && r.status !== "cancelled");
  const realSells = sales.filter((r) => r.kind === "so" && r.status !== "cancelled" && r.status !== "draft");
  const lastBuy = purchases.find((r) => r.kind === "po" && r.price != null && r.price > 0) ?? null;
  const lastSell = realSells.find((r) => r.price != null && r.price > 0) ?? null;
  const summary: TradeSummary = {
    buy_qty: realBuys.reduce((a, r) => a + (r.qty ?? 0), 0), buy_docs: new Set(realBuys.map((r) => r.doc_id)).size,
    last_buy: lastBuy ? { price: lastBuy.price as number, currency: lastBuy.currency ?? "THB", date: lastBuy.date } : null,
    sell_qty: realSells.reduce((a, r) => a + (r.qty ?? 0), 0), sell_docs: new Set(realSells.map((r) => r.doc_id)).size,
    last_sell: lastSell ? { price: lastSell.price as number, date: lastSell.date } : null,
    made_qty: production.filter((r) => r.role === "product").reduce((a, r) => a + r.received, 0),
    made_docs: production.filter((r) => r.role === "product").length,
    material_docs: production.filter((r) => r.role === "material").length,
  };

  return NextResponse.json({ sku: { id: sku.id, code, name: sku.name_th ?? "" }, purchases, sales, production, summary, cost_allowed: canCost, error: null });
}
