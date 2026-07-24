/**
 * GET /api/mo/[id]/status — สรุป "สถานะงานผลิต" ของใบสั่งผลิต (สำหรับ Popup สถานะ)
 *
 * คำนวณสถานะ 9 ขั้น + รายละเอียดที่ต้องโชว์ในแต่ละขั้น จากข้อมูลจริง:
 *   เตรียม/ตัด (mo_materials) · จ่ายงาน (mo_work_orders) · รับคืน (received_qty) · งานเหมา (mo_piecework)
 *
 * กติกา (ตามที่เจ้าของกำหนด): "จ่าย/ส่ง" ชนะเสมอ — แต่ถ้าเตรียม/ตัดยังไม่ครบ จะแนบ note เตือนไว้
 * ค่าแรง: labor_cost = ยอดรวมต่อใบจ่ายงาน → ราคาต่อชิ้น = labor_cost / qty
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MoStatusDesk = {
  desk: string; qty: number; labor_total: number; rate_per_piece: number;
  dispatch_date: string | null; days_since: number | null; received: number;
};
export type MoStatusMissing = { sku: string | null; name: string; required: number; on_hand: number; to_purchase: number; uom: string | null; purchase_status: string | null };
export type MoStatusCut = { sku: string | null; name: string; block: string | null; pieces: number };
export type MoStatusPiece = { job: string; assignee: string | null; rate: number; qty: number; total: number; done: boolean };
export type MoStatusPurchase = { item_name: string; qty: number; uom: string | null; pr_no: string | null; po_no: string | null; label: string; tone: "wait" | "ordered" | "done"; is_urgent: boolean };

export type MoStatus = {
  mo_no: string; product_sku: string | null; product_name: string | null; qty: number;
  due_date: string | null; delivery_confirmed: boolean;
  code: number;            // 1..9
  label: string;           // ชื่อสถานะ
  note: string | null;     // เตือนเมื่อจ่าย/ส่งแล้วแต่ของยังไม่ครบ
  prep: { done: number; total: number };
  cut: { done: number; total: number };
  dispatched: number; received: number; remaining_to_dispatch: number; remaining_to_receive: number;
  last_receive_date: string | null;
  missing: MoStatusMissing[];      // ของที่ยังไม่เตรียม (ขั้น 2/4)
  pending_cut: MoStatusCut[];      // รอตัด (ขั้น 3/4)
  desks: MoStatusDesk[];           // โต๊ะที่จ่าย (ขั้น 6/7)
  labor_total: number;             // รวมค่าแรงทั้งใบ
  piecework: MoStatusPiece[];      // งานเหมา (กล่องล่าง)
  purchases: MoStatusPurchase[];   // สถานะของซื้อ (PR/PO ที่ผูกใบนี้)
};

const n = (v: unknown) => { const x = Number(v); return isFinite(x) ? x : 0; };
const daysSince = (d: string | null) => d ? Math.max(0, Math.floor((Date.now() - new Date(d + "T00:00:00").getTime()) / 86400000)) : null;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: mo } = await admin.from("manufacturing_orders")
    .select("id, mo_no, product_sku, product_name, qty, due_date, delivery_confirmed").eq("id", id).maybeSingle();
  if (!mo) return NextResponse.json({ data: null, error: "ไม่พบใบสั่งผลิต" }, { status: 404 });
  const moNo = String(mo.mo_no);

  const [matsR, wosR, pcsR, prsR] = await Promise.all([
    admin.from("mo_materials")
      .select("component_sku, component_name, required_qty, uom, on_hand_qty, to_purchase_qty, is_ready, cut_block_code, cut_done, pieces")
      .eq("mo_no", moNo).eq("is_active", true),
    admin.from("mo_work_orders")
      .select("department_name, assignee_name, qty, received_qty, labor_cost, dispatch_date, status")
      .eq("mo_no", moNo).eq("is_active", true),
    admin.from("mo_piecework")
      .select("job_name, assignee_name, rate, total_qty, status").eq("mo_no", moNo).eq("is_active", true),
    admin.from("purchase_requests_v2")
      .select("pr_no, item_name, qty, uom, status, is_urgent, po_id")
      .contains("source_mo_nos", [moNo]).eq("is_active", true).order("created_at", { ascending: true }),
  ]);

  const mats = (matsR.data ?? []) as Record<string, unknown>[];
  const wos = ((wosR.data ?? []) as Record<string, unknown>[]).filter((w) => w.status !== "cancelled");
  const pcs = (pcsR.data ?? []) as Record<string, unknown>[];

  // ---- สถานะของซื้อ (PR/PO ที่ผูกใบนี้) + label + จับคู่กับของที่ขาดตามชื่อ ----
  const prs = (prsR.data ?? []) as Record<string, unknown>[];
  const poIds = [...new Set(prs.map((p) => p.po_id).filter(Boolean))] as string[];
  const poMap = new Map<string, { po_no: string; status: string; expected_date: string | null }>();
  if (poIds.length) {
    const { data: pos } = await admin.from("purchase_orders_v2").select("id, po_no, status, expected_date").in("id", poIds);
    for (const po of (pos ?? []) as Record<string, unknown>[]) poMap.set(String(po.id), { po_no: String(po.po_no ?? ""), status: String(po.status ?? ""), expected_date: (po.expected_date as string) ?? null });
  }
  const fmtD = (dt: string | null) => dt ? new Date(dt + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "";
  const purchases: MoStatusPurchase[] = prs.map((p) => {
    const po = p.po_id ? poMap.get(String(p.po_id)) : undefined;
    const prSt = String(p.status ?? "");
    let label = "ขอซื้อแล้ว"; let tone: MoStatusPurchase["tone"] = "wait";
    if (!po) {
      if (prSt === "waiting") label = "🛒 ขอซื้อ — รออนุมัติ";
      else if (prSt === "approved") label = "✅ อนุมัติแล้ว — รอออก PO";
      else if (prSt === "rejected") label = "❌ ถูกปฏิเสธ";
    } else {
      const eta = po.expected_date ? ` · เข้า ${fmtD(po.expected_date)}` : "";
      if (po.status === "draft") { label = `🧾 ออก PO แล้ว (ยังไม่สั่ง)${eta}`; tone = "wait"; }
      else if (po.status === "received") { label = "📦 ของเข้าแล้ว"; tone = "done"; }
      else { label = `🚚 สั่งซื้อแล้ว${eta}`; tone = "ordered"; }
    }
    return { item_name: String(p.item_name ?? ""), qty: n(p.qty), uom: (p.uom as string) ?? null, pr_no: (p.pr_no as string) ?? null, po_no: po?.po_no ?? null, label, tone, is_urgent: !!p.is_urgent };
  });
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const purchaseFor = (name: string): string | null => {
    const b = norm(name); if (!b) return null;
    const hit = purchases.find((pu) => { const a = norm(pu.item_name); return !!a && (a.includes(b) || b.includes(a)); });
    return hit?.label ?? null;
  };

  // ---- เตรียม / ตัด ----
  const prepTotal = mats.length;
  const prepDone = mats.filter((m) => m.is_ready === true).length;
  const cutLines = mats.filter((m) => !!m.cut_block_code);
  const cutTotal = cutLines.length;
  const cutDone = cutLines.filter((m) => m.cut_done === true).length;

  // ---- จ่าย / รับคืน ----
  const qty = n(mo.qty);
  const dispatched = wos.reduce((a, w) => a + n(w.qty), 0);
  const received = wos.reduce((a, w) => a + n(w.received_qty), 0);
  const laborTotal = wos.reduce((a, w) => a + n(w.labor_cost), 0);

  // รวมต่อโต๊ะ
  const byDesk = new Map<string, MoStatusDesk>();
  for (const w of wos) {
    const desk = String(w.department_name || w.assignee_name || "ไม่ระบุโต๊ะ");
    const cur = byDesk.get(desk) ?? { desk, qty: 0, labor_total: 0, rate_per_piece: 0, dispatch_date: null, days_since: null, received: 0 };
    cur.qty += n(w.qty);
    cur.labor_total += n(w.labor_cost);
    cur.received += n(w.received_qty);
    const d = (w.dispatch_date as string) ?? null;
    if (d && (!cur.dispatch_date || d < cur.dispatch_date)) cur.dispatch_date = d;   // วันจ่ายแรกสุดของโต๊ะนี้
    byDesk.set(desk, cur);
  }
  const desks = [...byDesk.values()].map((d) => ({
    ...d,
    rate_per_piece: d.qty > 0 ? Math.round((d.labor_total / d.qty) * 100) / 100 : 0,
    days_since: daysSince(d.dispatch_date),
  }));

  // ---- สถานะ 9 ขั้น (จ่าย/ส่ง ชนะ) ----
  const prepOk = prepTotal > 0 && prepDone >= prepTotal;
  const cutOk = cutTotal === 0 || cutDone >= cutTotal;
  let code = 1, label = "ยังไม่เริ่ม";
  if (qty > 0 && received >= qty)      { code = 9; label = "ส่งครบแล้ว"; }
  else if (received > 0)               { code = 8; label = "ส่งแล้วบางส่วน"; }
  else if (qty > 0 && dispatched >= qty) { code = 6; label = "จ่ายครบแล้ว — กำลังผลิต"; }
  else if (dispatched > 0)             { code = 7; label = "จ่ายบางส่วน — ยังจ่ายไม่ครบ"; }
  else if (prepOk && cutOk)            { code = 5; label = "พร้อมจ่าย"; }
  else if (cutDone > 0 && !prepOk)     { code = 4; label = "ตัดแล้วแต่ของยังไม่ครบ"; }
  else if (prepOk && cutDone === 0)    { code = 3; label = "เตรียมครบ รอตัด"; }
  else if (prepDone > 0)               { code = 2; label = "ของไม่ครบ"; }

  // note: จ่าย/ส่งแล้วแต่เตรียม/ตัดยังไม่ครบ
  let note: string | null = null;
  if (code >= 6) {
    const bits: string[] = [];
    if (!prepOk && prepTotal > 0) bits.push(`เตรียม ${prepDone}/${prepTotal}`);
    if (!cutOk) bits.push(`ตัด ${cutDone}/${cutTotal}`);
    if (bits.length) note = `⚠ ของยังไม่ครบ — ${bits.join(" · ")}`;
  }

  const data: MoStatus = {
    mo_no: moNo,
    product_sku: (mo.product_sku as string) ?? null,
    product_name: (mo.product_name as string) ?? null,
    qty, due_date: (mo.due_date as string) ?? null, delivery_confirmed: !!mo.delivery_confirmed,
    code, label, note,
    prep: { done: prepDone, total: prepTotal },
    cut: { done: cutDone, total: cutTotal },
    dispatched, received,
    remaining_to_dispatch: Math.max(0, qty - dispatched),
    remaining_to_receive: Math.max(0, qty - received),
    last_receive_date: null,
    missing: mats.filter((m) => m.is_ready !== true).slice(0, 100).map((m) => {
      const nm = String(m.component_name ?? m.component_sku ?? "—");
      return {
        sku: (m.component_sku as string) ?? null, name: nm,
        required: n(m.required_qty), on_hand: n(m.on_hand_qty), to_purchase: n(m.to_purchase_qty),
        uom: (m.uom as string) ?? null, purchase_status: purchaseFor(nm),
      };
    }),
    pending_cut: cutLines.filter((m) => m.cut_done !== true).slice(0, 100).map((m) => ({
      sku: (m.component_sku as string) ?? null,
      name: String(m.component_name ?? m.component_sku ?? "—"),
      block: (m.cut_block_code as string) ?? null, pieces: n(m.pieces),
    })),
    desks,
    labor_total: laborTotal,
    piecework: pcs.map((p) => ({
      job: String(p.job_name ?? "—"),
      assignee: (p.assignee_name as string) ?? null,
      rate: n(p.rate), qty: n(p.total_qty),
      total: Math.round(n(p.rate) * n(p.total_qty) * 100) / 100,
      done: p.status === "done",
    })),
    purchases,
  };

  return NextResponse.json({ data, error: null }, { headers: { "Cache-Control": "private, max-age=15" } });
}
