/**
 * สถานะการซื้อของวัตถุดิบในใบสั่งผลิต — ของกลาง (server-side เท่านั้น ใช้ supabaseAdmin)
 * ใช้ร่วมกัน 2 ที่ → ตัวเลขตรงกันเสมอ:
 *   - /api/mo/material-status   (ระดับ 2: ทุกบรรทัด BOM ของใบเดียว)
 *   - /api/mo/material-progress (ระดับ 1: สรุปแถบสีของทุกใบที่ยังเปิด)
 *
 * กติกา (เจ้าของตัดสิน 2026-10-25):
 *   ยอดต้องซื้อ = qty_per × จำนวนสั่ง − มีอยู่ (หรือค่า override) − ที่ขอ/สั่ง/ได้แล้ว
 *   ขอซื้อแล้ว = ใบขอซื้อที่ผูกใบงาน (m2m source_mo_nos) จับรหัสด้วย lib/pr-line-code
 *   สั่งแล้ว   = ใบขอซื้อที่ออก PO แล้ว — PO ร่างนับว่าสั่งแล้ว
 *   รับแล้ว    = บรรทัด PO ที่ผูกใบขอซื้อนั้นจบหมด (รับครบ/ปิดยอด) และได้ของพอ
 *   ปิดยอดแต่ของขาด → ส่วนที่ขาดกลับไป "ต้องซื้อ" (นับเท่าที่รับจริง)
 *   ติ๊ก "เตรียมแล้ว" = ของอยู่หน้างาน ไม่ต้องซื้อ
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { prLineCodeResolver } from "@/lib/pr-line-code";
import { fetchAllPages } from "@/lib/fetch-all";

/** buy=ต้องซื้อ · requested=ขอแล้วรออนุมัติ · ordered=มี PO แล้ว · received=รับของครบ · have=มีของแล้ว · ready=เตรียมแล้ว · skip=ไม่ต้องซื้อ */
export type MatStatus = "buy" | "requested" | "ordered" | "received" | "have" | "ready" | "skip";
export type MatPurchaseLink = {
  pr_no: string | null; pr_status: string; qty: number;
  po_id: string | null; po_no: string | null; po_status: string | null; expected_date: string | null; seller_name: string | null;
  /** บรรทัด PO ที่ออกจากใบขอซื้อนี้ (ไว้เปิดป๊อปรับของ) — null = ยังไม่ออก PO */
  po_line_id: string | null; line_qty: number; qty_received: number; qty_defective: number; line_status: string | null;
  /** บรรทัดจบแล้ว (รับครบ / ปิดยอด / ยกเลิก) — ไม่รอของเพิ่ม */
  line_closed: boolean;
};
/** ผลคำนวณของวัตถุดิบ 1 บรรทัด (ไม่รวมชื่อ/รูป/สต๊อก) */
export type MatStatusCalc = {
  qty_per: number; required: number; on_hand: number; to_purchase_stored: number | null; is_ready: boolean;
  want: number; requested: number; remaining: number; received: number; status: MatStatus;
};

export const r4 = (n: number) => Math.round(n * 10000) / 10000;
const EPS = 0.0001;
const LINE_CLOSED = ["received", "short_closed", "closed_short", "cancelled"];   // ชุดเดียวกับ /api/purchasing/cancel-line
const CHUNK = 200;   // กัน URL ยาวเกินตอน .in(...) หลายร้อย id
type Row = Record<string, unknown>;

/** key ของ links: ใบสั่งผลิต + รหัสวัตถุดิบ */
export const linkKey = (moNo: string, code: string) => `${moNo}|${code}`;

const chunks = <T,>(arr: T[]) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
  return out;
};

/**
 * ใบขอซื้อที่ผูกใบสั่งผลิต (ไม่นับที่ไม่อนุมัติ/ยกเลิก) → links ต่อ (ใบ, รหัสวัตถุดิบ) พร้อม PO + บรรทัด PO (รับแล้วเท่าไร)
 * ใบขอซื้อ 1 ใบผูกหลายใบงานได้ → ได้ link ในทุกใบที่ผูก (ของใช้ร่วมกัน m2m)
 */
export async function loadMoPurchaseLinks(admin: SupabaseClient, moNos: string[]): Promise<Map<string, MatPurchaseLink[]>> {
  const out = new Map<string, MatPurchaseLink[]>();
  if (moNos.length === 0) return out;
  const prRows = await fetchAllPages<Row>((from, to) => {
    let q = admin.from("purchase_requests_v2").select("id, pr_no, item_name, item_sku_id, qty, status, po_id, source_mo_nos");
    q = moNos.length === 1 ? q.contains("source_mo_nos", moNos) : q.overlaps("source_mo_nos", moNos);
    return q.eq("is_active", true).not("status", "in", "(rejected,cancelled)")
      .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
  });
  if (prRows.length === 0) return out;

  const poIds = [...new Set(prRows.map((p) => p.po_id).filter(Boolean).map(String))];
  const prIds = prRows.map((p) => String(p.id));
  const [poRes, lineRes, prCode] = await Promise.all([
    Promise.all(chunks(poIds).map((c) => admin.from("purchase_orders_v2").select("id, po_no, status, expected_date, seller_name").in("id", c))),
    Promise.all(chunks(prIds).map((c) => admin.from("purchase_order_lines_v2").select("id, pr_id, qty, qty_received, qty_defective, line_status").in("pr_id", c).eq("is_active", true))),
    prLineCodeResolver(admin, prRows),
  ]);
  const poById = new Map(poRes.flatMap((r) => (r.data ?? []) as Row[]).map((p) => [String(p.id), p]));
  const lineByPr = new Map<string, Row>();
  for (const l of lineRes.flatMap((r) => (r.data ?? []) as Row[])) if (!lineByPr.has(String(l.pr_id))) lineByPr.set(String(l.pr_id), l);

  const wanted = new Set(moNos);
  for (const p of prRows) {
    const code = prCode(p); if (!code) continue;
    const po = p.po_id ? poById.get(String(p.po_id)) : undefined;
    const ln = lineByPr.get(String(p.id));
    const lineStatus = ln ? String(ln.line_status ?? "") : null;
    const lineQty = Number(ln?.qty) || 0;
    const rec = r4(Number(ln?.qty_received) || 0);
    const link: MatPurchaseLink = {
      pr_no: (p.pr_no as string) ?? null, pr_status: String(p.status ?? ""), qty: Number(p.qty) || 0,
      po_id: p.po_id ? String(p.po_id) : null, po_no: (po?.po_no as string) ?? null, po_status: (po?.status as string) ?? null,
      expected_date: (po?.expected_date as string) ?? null, seller_name: (po?.seller_name as string) ?? null,
      po_line_id: ln ? String(ln.id) : null, line_qty: lineQty, qty_received: rec, qty_defective: r4(Number(ln?.qty_defective) || 0),
      line_status: lineStatus, line_closed: !!ln && (LINE_CLOSED.includes(lineStatus ?? "") || (lineQty > 0 && rec >= lineQty - EPS)),
    };
    const nos = Array.isArray(p.source_mo_nos) ? [...new Set((p.source_mo_nos as unknown[]).map(String))] : [];
    for (const mo of nos) {
      if (!wanted.has(mo)) continue;
      const k = linkKey(mo, code);
      out.set(k, [...(out.get(k) ?? []), link]);
    }
  }
  return out;
}

/** คำนวณสถานะของวัตถุดิบ 1 บรรทัด (แถว mo_material_summary) จากจำนวนสั่งของใบ + ใบขอซื้อที่ผูก */
export function computeMatStatus(s: Row, moQty: number, links: MatPurchaseLink[]): MatStatusCalc {
  const qtyPer = Number(s.qty_per) || 0;
  const required = r4(qtyPer * moQty);
  const onHand = Number(s.on_hand_qty) || 0;
  const base = Math.max(0, r4(required - onHand));
  const stored = s.to_purchase_qty != null ? Number(s.to_purchase_qty) : null;
  const want = stored != null && Math.round(stored * 10000) !== Math.round(base * 10000) ? stored : base;   // override ถ้ามี (เหมือน purchase-needs)
  // ยอดที่ "ขอ/สั่ง/ได้แล้ว" ต่อใบขอซื้อ: บรรทัด PO จบแล้ว (ปิดยอด/ยกเลิก) = นับเท่าที่รับจริง ส่วนที่ขาดถือว่าไม่มาแล้ว → กลับไป "ต้องซื้อ"
  //   ยังค้างรับ = จำนวนในบรรทัด PO (แก้ได้ที่หน้ารับของ) · ยังไม่ออก PO = จำนวนในใบขอซื้อ
  const effQty = (l: MatPurchaseLink) => (l.po_line_id ? (l.line_closed ? l.qty_received : Math.max(l.line_qty, l.qty_received)) : l.qty);
  const requested = r4(links.reduce((n, l) => n + effQty(l), 0));
  const received = r4(links.reduce((n, l) => n + l.qty_received, 0));
  const remaining = Math.max(0, r4(want - requested));
  const isReady = !!s.is_ready;
  const status: MatStatus =
    isReady ? "ready"                                                     // เตรียมแล้ว = ของอยู่หน้างาน ไม่ต้องซื้อ
    : remaining > EPS ? "buy"
    : links.length === 0 ? (required > 0 && onHand >= required - EPS ? "have" : "skip")
    : links.every((l) => l.line_closed) ? "received"                     // ทุกบรรทัด PO จบแล้ว + ได้ของพอ
    : links.some((l) => l.po_no || l.pr_status === "rfq_created") ? "ordered"
    : "requested";
  return {
    qty_per: qtyPer, required, on_hand: onHand, to_purchase_stored: stored, is_ready: isReady,
    want: r4(want), requested, remaining, received, status,
  };
}
