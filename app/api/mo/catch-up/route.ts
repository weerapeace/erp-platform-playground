/**
 * ภาพรวมใบสั่งผลิต 1 ใบ สำหรับโหมด "🔄 อัปเดตงาน" (บอร์ดจ่ายงาน) — GET /api/mo/catch-up?mo_no=MO-xxxx
 * รวมทุกอย่างที่ป๊อปต้องรู้ว่า "ระบบบันทึกถึงขั้นไหนแล้ว" ในคำขอเดียว:
 *   ซื้อของ (กติกาเดียวกับ /api/mo/material-progress) · เตรียม/ตัด (นับแบบเดียวกับ /api/mo/work-board)
 *   ใบจ่ายงาน (จ่าย/คืน/ดึงเข้า QC แล้ว) · ของบนชั้น QC · รายชื่อชั้น QC
 * อ่านอย่างเดียว — การบันทึกจริงไปผ่าน API เดิมของแต่ละขั้น (ดู app/master/work-board/catch-up.ts)
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { needsCut, type CutFields } from "@/lib/cut-rules";
import { loadMoPurchaseLinks, computeMatStatus, linkKey } from "@/lib/mo-material-status";
import { parseSkipped, type MoSkipped } from "@/lib/mo-skip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
export type CatchUpWo = {
  id: string; wo_no: string; qty: number; received_qty: number; qc_pulled_qty: number; status: string;
  department_name: string | null; assignee_name: string | null; dispatch_date: string | null; created_at: string;
};
export type CatchUpSnapshot = {
  mo: {
    id: string; mo_no: string; product_sku: string | null; product_name: string | null; qty: number; status: string;
    due_date: string | null; internal_due_date: string | null;
    has_bom: boolean; prep_total: number; prep_ready: number; cut_total: number; cut_ready: number;
    prep_done: boolean; cut_done: boolean; skipped: MoSkipped;
  };
  /** null = ใบยังไม่มีสูตร (ไม่มีรายการวัตถุดิบ) */
  progress: { total: number; buy: number; requested: number; ordered: number } | null;
  /** ใบจ่ายงานที่ยังใช้อยู่ (ไม่นับที่ยกเลิก) เรียงเก่า → ใหม่ */
  wos: CatchUpWo[];
  shelves: { id: string; name: string; kind: string }[];
  /** ของของใบนี้ที่อยู่บนชั้น QC ตอนนี้ */
  shelf: { good: number; defect: number; repairing: number };
};

const n = (v: unknown) => Number(v) || 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const moNo = (new URL(request.url).searchParams.get("mo_no") ?? "").trim();
  if (!moNo) return NextResponse.json({ data: null, error: "ไม่ได้ระบุใบสั่งผลิต" }, { status: 400 });
  const admin = supabaseAdmin();

  const { data: mo } = await admin.from("manufacturing_orders")
    .select("id, mo_no, product_sku, product_name, qty, status, due_date, internal_due_date, prep_done, cut_done, skipped_stages")
    .eq("mo_no", moNo).eq("is_active", true).maybeSingle();
  if (!mo) return NextResponse.json({ data: null, error: "ไม่พบใบสั่งผลิตนี้" }, { status: 404 });
  const m = mo as Row;
  const skipped = parseSkipped(m.skipped_stages);

  const [sumsRes, matsRes, wosRes, shelvesRes, itemsRes, links] = await Promise.all([
    admin.from("mo_material_summary").select("id, mo_no, component_sku, qty_per, on_hand_qty, to_purchase_qty, is_ready").eq("mo_no", moNo).eq("is_active", true),
    admin.from("mo_materials").select("material_type, cut_block_code, cut_length, pieces, cut_done").eq("mo_no", moNo).eq("is_active", true),
    admin.from("mo_work_orders").select("id, wo_no, qty, received_qty, qc_pulled_qty, status, department_name, assignee_name, dispatch_date, created_at")
      .eq("mo_no", moNo).eq("is_active", true).neq("status", "cancelled").order("created_at", { ascending: true }),
    admin.from("qc_shelves").select("id, name, kind, sort_order").eq("is_active", true).order("sort_order"),
    admin.from("qc_warehouse_items").select("qty, status").eq("mo_no", moNo),
    loadMoPurchaseLinks(admin, [moNo]),
  ]);
  if (sumsRes.error || wosRes.error) return NextResponse.json({ data: null, error: "โหลดข้อมูลใบงานไม่สำเร็จ" }, { status: 500 });

  // ซื้อของ — กติกาเดียวกับ material-progress (ข้ามซื้อของ = ของครบทุกบรรทัด)
  const sums = (sumsRes.data ?? []) as Row[];
  let progress: CatchUpSnapshot["progress"] = null;
  if (sums.length > 0) {
    progress = { total: 0, buy: 0, requested: 0, ordered: 0 };
    for (const s of sums) {
      progress.total += 1;
      if (skipped.buy) continue;
      const code = (s.component_sku as string) ?? null;
      const { status } = computeMatStatus(s, n(m.qty), code ? links.get(linkKey(moNo, code)) ?? [] : []);
      if (status === "buy") progress.buy += 1;
      else if (status === "requested") progress.requested += 1;
      else if (status === "ordered") progress.ordered += 1;
    }
  }

  // เตรียม/ตัด — นับแบบเดียวกับ work-board (ไม่นับอะไหล่ในยอดต้องตัด · ป้ายข้าม = นับครบ)
  const prepTotal = sums.length, prepDone = sums.filter((s) => s.is_ready).length;
  const cuts = ((matsRes.data ?? []) as Row[]).filter((x) => needsCut(x as CutFields));
  const cutTotal = cuts.length, cutDone = cuts.filter((x) => x.cut_done).length;

  const shelf = { good: 0, defect: 0, repairing: 0 };
  for (const it of (itemsRes.data ?? []) as Row[]) {
    const st = String(it.status) as keyof typeof shelf;
    if (st in shelf) shelf[st] += n(it.qty);
  }

  const data: CatchUpSnapshot = {
    mo: {
      id: String(m.id), mo_no: moNo, product_sku: (m.product_sku as string) ?? null, product_name: (m.product_name as string) ?? null,
      qty: n(m.qty), status: String(m.status ?? ""), due_date: (m.due_date as string) ?? null, internal_due_date: (m.internal_due_date as string) ?? null,
      has_bom: prepTotal > 0,
      prep_total: prepTotal, prep_ready: skipped.prep ? prepTotal : prepDone,
      cut_total: cutTotal, cut_ready: skipped.cut ? cutTotal : cutDone,
      prep_done: m.prep_done === true || !!skipped.prep, cut_done: m.cut_done === true || !!skipped.cut, skipped,
    },
    progress,
    wos: ((wosRes.data ?? []) as Row[]).map((w) => ({
      id: String(w.id), wo_no: String(w.wo_no ?? ""), qty: n(w.qty), received_qty: n(w.received_qty), qc_pulled_qty: n(w.qc_pulled_qty),
      status: String(w.status ?? ""), department_name: (w.department_name as string) ?? null, assignee_name: (w.assignee_name as string) ?? null,
      dispatch_date: (w.dispatch_date as string) ?? null, created_at: String(w.created_at ?? ""),
    })),
    shelves: ((shelvesRes.data ?? []) as Row[]).map((s) => ({ id: String(s.id), name: String(s.name ?? ""), kind: String(s.kind ?? "") })),
    shelf,
  };
  return NextResponse.json({ data, error: null });
}
