/**
 * วัตถุดิบ "ทุกตัว" ใน BOM ของใบสั่งผลิต + สถานะการซื้อ — /api/mo/material-status?mo_no=MO-xxxx
 * ใช้ในแท็บ "ใบสั่งผลิต" หน้าขอซื้อ: ต้องซื้อ (บน) → ขอแล้ว/สั่งแล้ว → รับแล้ว/มีของ/เตรียมแล้ว (ล่าง)
 *   ยอดต้องซื้อ = สูตรเดียวกับ /api/mo/purchase-needs (qty_per × จำนวนสั่ง − มีอยู่ หรือค่า override − ขอซื้อแล้ว)
 *   ขอซื้อแล้ว = ใบขอซื้อที่ผูกใบงานนี้ (m2m source_mo_nos) จับรหัสด้วย lib/pr-line-code
 *   สั่งแล้ว   = ใบขอซื้อที่ออก PO แล้ว — PO ร่างนับว่าสั่งแล้ว (เจ้าของตัดสิน 2026-10-25)
 *   รับแล้ว    = บรรทัด PO ที่ผูกใบขอซื้อนั้นจบหมด (รับครบ/ปิดยอด) และได้ของพอ
 *   ปิดยอดแต่ของขาด → ส่วนที่ขาดกลับไป "ต้องซื้อ" (นับเท่าที่รับจริง)
 *   links[] มี po_id/po_line_id/สถานะรับ → การ์ดกดดู PO + รับของได้ (ReceiveLineModal)
 * ของกลาง: guardApi(products.view) + supabaseAdmin + prLineCodeResolver
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { prLineCodeResolver } from "@/lib/pr-line-code";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
export type MoMaterialStatus = {
  summary_id: string; code: string | null; name: string | null; image: string | null; type: string | null; uom: string | null;
  qty_per: number; required: number; on_hand: number; to_purchase_stored: number | null; is_ready: boolean;
  want: number; requested: number; remaining: number; received: number;
  status: MatStatus; links: MatPurchaseLink[];
};
export type MoMaterialStatusResult = { mo_no: string; mo_qty: number; items: MoMaterialStatus[] };

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const EPS = 0.0001;
const LINE_CLOSED = ["received", "short_closed", "closed_short", "cancelled"];   // ชุดเดียวกับ /api/purchasing/cancel-line
type Row = Record<string, unknown>;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const moNo = (new URL(request.url).searchParams.get("mo_no") ?? "").trim();
  if (!moNo) return NextResponse.json({ data: null, error: "ต้องระบุเลขใบสั่งผลิต" }, { status: 400 });
  const admin = supabaseAdmin();

  const [{ data: mo }, { data: sums, error: sErr }, { data: prs }] = await Promise.all([
    admin.from("manufacturing_orders").select("mo_no, qty").eq("mo_no", moNo).eq("is_active", true).maybeSingle(),
    admin.from("mo_material_summary")
      .select("id, component_sku, component_name, material_type, uom, qty_per, on_hand_qty, to_purchase_qty, is_ready, sequence")
      .eq("mo_no", moNo).eq("is_active", true)
      .order("sequence", { ascending: true, nullsFirst: false }).order("id", { ascending: true }),
    admin.from("purchase_requests_v2")
      .select("id, pr_no, item_name, item_sku_id, qty, status, po_id")
      .contains("source_mo_nos", [moNo]).eq("is_active", true).not("status", "in", "(rejected,cancelled)")
      .order("created_at", { ascending: true }),
  ]);
  if (sErr) return NextResponse.json({ data: null, error: "โหลดวัตถุดิบของใบสั่งผลิตไม่สำเร็จ" }, { status: 500 });
  if (!mo) return NextResponse.json({ data: null, error: "ไม่พบใบสั่งผลิตนี้" }, { status: 404 });
  const moQty = Number((mo as Row).qty) || 0;
  const prRows = (prs ?? []) as Row[];

  // ใบขอซื้อ → PO (เลขใบ/สถานะ/วันของถึง) + บรรทัด PO (รับแล้วเท่าไร)
  const poIds = [...new Set(prRows.map((p) => p.po_id).filter(Boolean).map(String))];
  const prIds = prRows.map((p) => String(p.id));
  const [{ data: pos }, { data: poLines }, prCode] = await Promise.all([
    poIds.length ? admin.from("purchase_orders_v2").select("id, po_no, status, expected_date, seller_name").in("id", poIds) : Promise.resolve({ data: [] as Row[] }),
    prIds.length ? admin.from("purchase_order_lines_v2").select("id, pr_id, qty, qty_received, qty_defective, line_status").in("pr_id", prIds).eq("is_active", true) : Promise.resolve({ data: [] as Row[] }),
    prLineCodeResolver(admin, prRows),
  ]);
  const poById = new Map(((pos ?? []) as Row[]).map((p) => [String(p.id), p]));
  const lineByPr = new Map<string, Row>();
  for (const l of (poLines ?? []) as Row[]) if (!lineByPr.has(String(l.pr_id))) lineByPr.set(String(l.pr_id), l);
  const linksByCode = new Map<string, MatPurchaseLink[]>();
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
    linksByCode.set(code, [...(linksByCode.get(code) ?? []), link]);
  }

  // รูปวัตถุดิบ (cover SKU → fallback Parent)
  const codes = [...new Set(((sums ?? []) as Row[]).map((s) => String(s.component_sku ?? "").trim()).filter(Boolean))];
  const imgByCode = new Map<string, string>();
  if (codes.length) {
    const { data: skus } = await admin.from("skus_v2").select("code, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("code", codes).eq("is_active", true);
    for (const sk of (skus ?? []) as Row[]) {
      const parRel = sk.parent_skus_v2;
      const par = (Array.isArray(parRel) ? parRel[0] : parRel) as { cover_image_r2_key?: string | null } | null;
      const key = (sk.cover_image_r2_key as string | null) || par?.cover_image_r2_key || "";
      if (key) imgByCode.set(String(sk.code), `/api/r2-image?key=${encodeURIComponent(key)}`);
    }
  }

  const items: MoMaterialStatus[] = ((sums ?? []) as Row[]).map((s) => {
    const code = (s.component_sku as string) ?? null;
    const qtyPer = Number(s.qty_per) || 0;
    const required = r4(qtyPer * moQty);
    const onHand = Number(s.on_hand_qty) || 0;
    const base = Math.max(0, r4(required - onHand));
    const stored = s.to_purchase_qty != null ? Number(s.to_purchase_qty) : null;
    const want = stored != null && Math.round(stored * 10000) !== Math.round(base * 10000) ? stored : base;   // override ถ้ามี (เหมือน purchase-needs)
    const links = code ? linksByCode.get(code) ?? [] : [];
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
      summary_id: String(s.id), code, name: (s.component_name as string) ?? null, image: code ? imgByCode.get(code) ?? null : null,
      type: (s.material_type as string) ?? null, uom: (s.uom as string) ?? null,
      qty_per: qtyPer, required, on_hand: onHand, to_purchase_stored: stored, is_ready: isReady,
      want: r4(want), requested, remaining, received, status, links,
    };
  });

  const data: MoMaterialStatusResult = { mo_no: moNo, mo_qty: moQty, items };
  return NextResponse.json({ data, error: null });
}
