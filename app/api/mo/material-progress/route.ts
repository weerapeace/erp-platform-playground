/**
 * สรุปความคืบหน้าการซื้อวัตถุดิบ "ทุกใบสั่งผลิตที่ยังเปิด" ในคำขอเดียว — /api/mo/material-progress
 * ใช้วาดแถบสีบนการ์ดใบงาน (แท็บ "ใบสั่งผลิต" ระดับ 1 หน้าขอซื้อ) โดยไม่ต้องยิง /api/mo/material-status ทีละใบ
 *   ต่อใบ: นับบรรทัด BOM ตามสถานะ ต้องซื้อ / ขอแล้วรออนุมัติ / สั่งแล้ว / มีของ-ได้ของ-เตรียมแล้ว
 *   linked = จำนวนบรรทัดที่มีใบขอซื้อผูกแล้ว (0 = ยังไม่ได้เริ่มซื้ออะไรเลย)
 * กติกาสถานะ = ของกลาง lib/mo-material-status (ตัวเดียวกับ /api/mo/material-status → ตัวเลขตรงกับหน้ารายละเอียดใบ)
 * ของกลาง: guardApi(products.view) + supabaseAdmin + fetchAllPages
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { loadMoPurchaseLinks, computeMatStatus, linkKey } from "@/lib/mo-material-status";
import { parseSkipped } from "@/lib/mo-skip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MoProgress = {
  total: number;       // บรรทัด BOM ทั้งหมด
  buy: number;         // ต้องซื้อ
  requested: number;   // ขอแล้ว รออนุมัติ
  ordered: number;     // สั่งแล้ว (มี PO — PO ร่างนับด้วย)
  done: number;        // มีของ / ได้ของแล้ว / เตรียมแล้ว / ไม่ต้องซื้อ
  linked: number;      // บรรทัดที่มีใบขอซื้อผูกแล้ว
  /** ของที่สั่งแล้วจะถึงครบประมาณวันไหน = วันของถึงช้าสุดของบรรทัด "สั่งแล้ว" (null = ไม่มีของรอ หรือ PO ไม่ได้ใส่วัน) */
  eta: string | null;
  eta_unknown: number; // บรรทัด "สั่งแล้ว" ที่ PO ยังไม่ระบุวันของถึง
  /** แอดมินข้ามขั้น "ซื้อของ" (lib/mo-skip) → นับทุกบรรทัดเป็นของครบ */
  skipped?: boolean;
};
/** mo_no → ความคืบหน้า (ใบที่ไม่มี BOM ไม่อยู่ในผลลัพธ์) */
export type MoProgressResult = Record<string, MoProgress>;

type Row = Record<string, unknown>;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  // ชุดใบเดียวกับ /api/mo/purchase-needs (ใบที่ยังเปิด)
  const { data: mos, error: mErr } = await admin.from("manufacturing_orders")
    .select("mo_no, qty, skipped_stages").eq("is_active", true).not("status", "in", "(cancelled,done)").limit(1000);
  if (mErr) return NextResponse.json({ data: null, error: "โหลดใบสั่งผลิตไม่สำเร็จ" }, { status: 500 });
  const qtyByMo = new Map(((mos ?? []) as Row[]).map((m) => [String(m.mo_no), Number(m.qty) || 0]));
  const buySkipped = new Set(((mos ?? []) as Row[]).filter((m) => parseSkipped(m.skipped_stages).buy).map((m) => String(m.mo_no)));
  const moNos = [...qtyByMo.keys()];
  if (moNos.length === 0) return NextResponse.json({ data: {}, error: null });

  // ⚠️ แถวโตตามจำนวนใบ → ไล่ทีละหน้า (กันโดนตัดที่ 1,000 แถว)
  const [sums, linksByKey] = await Promise.all([
    fetchAllPages<Row>((from, to) => admin.from("mo_material_summary")
      .select("id, mo_no, component_sku, qty_per, on_hand_qty, to_purchase_qty, is_ready")
      .in("mo_no", moNos).eq("is_active", true)
      .order("mo_no", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    loadMoPurchaseLinks(admin, moNos),
  ]);

  const data: MoProgressResult = {};
  for (const s of sums) {
    const moNo = String(s.mo_no);
    const code = (s.component_sku as string) ?? null;
    const links = code ? linksByKey.get(linkKey(moNo, code)) ?? [] : [];
    const { status } = computeMatStatus(s, qtyByMo.get(moNo) ?? 0, links);
    const p = data[moNo] ?? (data[moNo] = { total: 0, buy: 0, requested: 0, ordered: 0, done: 0, linked: 0, eta: null, eta_unknown: 0 });
    p.total += 1;
    if (buySkipped.has(moNo)) { p.skipped = true; p.done += 1; if (links.length > 0) p.linked += 1; continue; }   // ข้ามซื้อของ = ของครบ
    if (status === "buy") p.buy += 1;
    else if (status === "requested") p.requested += 1;
    else if (status === "ordered") {
      p.ordered += 1;
      const d = links.filter((l) => l.po_id && !l.line_closed).map((l) => l.expected_date).filter((x): x is string => !!x).sort().pop() ?? null;
      if (!d) p.eta_unknown += 1;
      else if (!p.eta || d > p.eta) p.eta = d;
    }
    else p.done += 1;
    if (links.length > 0) p.linked += 1;
  }
  return NextResponse.json({ data, error: null });
}
