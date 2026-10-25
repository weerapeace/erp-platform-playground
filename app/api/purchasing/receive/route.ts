/**
 * POST /api/purchasing/receive
 * รับสินค้าเข้า (Goods Receipt) ตามใบสั่งซื้อ (PO) — ทำงานราย "บรรทัดสินค้า"
 *
 * body: {
 *   po_id, receive_date?, receiver?, note?, actor?,
 *   lines: [{ po_line_id, qty_received, qty_defective?, case_type }]
 * }
 * case_type: full | partial_close | partial_wait | full_defective
 * ต้องส่ง receipt_doc_r2_key + bill_doc_r2_key เสมอ ยกเว้น source: "scan" (หน้าสแกน QR)
 *   และ source: "backfill" (รับย้อนหลัง/เคลียร์ของค้างเก่า) — ต้องมีสิทธิ์ po.receive_backfill + reason · skip_stock=true ไม่บวกสต๊อก · ไม่แจ้งไลน์
 * ชุดรับของ (ตะกร้าเดียว หลายใบสั่งซื้อ): ใบแรกส่ง new_batch=true → ได้ receipt_batch_no กลับ · ใบถัดไปส่ง receipt_batch_no เดิม
 *   batch_last=true ที่ใบสุดท้าย → แจ้งไลน์ครั้งเดียวทั้งชุด (ใบอื่นในชุดไม่แจ้ง ประหยัดโควตาไลน์)
 *
 * ผล:
 *  - สร้างเอกสาร GR (หัว + รายการ) เก็บประวัติการรับครั้งนี้
 *  - อัปเดตบรรทัด PO: qty_received += , qty_defective += , line_status ตามเคส
 *  - อัปเดตสถานะ PO รวม (partial / received)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardApi } from "@/lib/api-auth";
import { pushLineText } from "@/lib/board-notify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

type InLine = { po_line_id: string; qty_received: number; qty_defective?: number; case_type: string };

// เคส → สถานะบรรทัด
const CASE_STATUS: Record<string, string> = {
  full: "received",
  partial_close: "short_closed",
  partial_wait: "partial",
  full_defective: "received",
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { po_id?: string; warehouse_id?: string; receive_date?: string; receiver?: string; note?: string; actor?: string; lines?: unknown; receipt_doc_r2_key?: string; bill_doc_r2_key?: string; source?: string;
    reason?: string; skip_stock?: boolean; new_batch?: boolean; receipt_batch_no?: string; batch_last?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // รับย้อนหลัง (เคลียร์ของค้างเก่า) — เจ้าของอนุมัติ 2026-10-25: ไม่บังคับแนบ แต่ต้องมีสิทธิ์เฉพาะ + บังคับเหตุผล (เก็บลง note + audit)
  const backfill = body.source === "backfill";
  const reason = String(body.reason ?? "").trim();
  if (backfill) {
    const noPerm = await guardApi(request, "po.receive_backfill"); if (noPerm) return noPerm;
    if (reason.length < 3) return NextResponse.json({ error: "ต้องใส่เหตุผลการรับย้อนหลัง" }, { status: 400 });
  }

  // กติกากลาง: ต้องแนบ ใบรับของ + บิล ทุกครั้ง (หน้ารับของ / การ์ดแท็บใบสั่งผลิต / ช่องทางใหม่ในอนาคต)
  // ยกเว้นหน้าสแกน QR (source=scan) — เจ้าของตัดสิน 2026-10-25 ให้รับหน้างานได้โดยไม่ต้องแนบ · และรับย้อนหลัง (backfill) ด้านบน
  if (body.source !== "scan" && !backfill && (!body.receipt_doc_r2_key || !body.bill_doc_r2_key)) {
    return NextResponse.json({ error: "ต้องแนบ ใบรับของ + บิล ให้ครบก่อนบันทึก" }, { status: 400 });
  }

  const poId = body.po_id;
  const inLines = Array.isArray(body.lines) ? (body.lines as InLine[]) : [];
  if (!poId) return NextResponse.json({ error: "ไม่ระบุ PO" }, { status: 400 });
  const valid = inLines.filter((l) => l && l.po_line_id && (num(l.qty_received) > 0 || num(l.qty_defective) > 0));
  if (valid.length === 0) return NextResponse.json({ error: "ไม่มีรายการรับ (กรอกจำนวนรับ/เสียอย่างน้อย 1 รายการ)" }, { status: 400 });

  const admin = supabaseAdmin();

  // โหลด PO + บรรทัด
  const { data: po, error: poErr } = await admin
    .from("purchase_orders_v2").select("id, po_no, seller_name").eq("id", poId).maybeSingle();
  if (poErr || !po) return NextResponse.json({ error: "ไม่พบใบสั่งซื้อ" }, { status: 404 });

  const { data: poLines, error: plErr } = await admin
    .from("purchase_order_lines_v2")
    .select("id, item_sku_id, item_name, qty, uom, qty_received, qty_defective, price_est, currency")
    .eq("po_id", poId);
  if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 });
  const lineById = new Map((poLines ?? []).map((l) => [String(l.id), l as Record<string, unknown>]));

  const actor = body.actor ?? user.email ?? "system";
  const now = new Date();
  // เลขใบรับ: ใช้ระบบเลขเอกสารกลาง erp_next_number('gr') — atomic กันเลขซ้ำ
  const { data: grNo, error: numErr } = await admin.rpc("erp_next_number", { p_key: "gr" });
  if (numErr || !grNo) return NextResponse.json({ error: "ออกเลขใบรับไม่สำเร็จ: " + (numErr?.message ?? "") }, { status: 500 });
  const receiveDate = body.receive_date || now.toISOString().slice(0, 10);

  // เลขชุดรับของ: ใบแรกของตะกร้าขอเลขใหม่ (เลขกลาง 'rb') · ใบถัดไปส่งเลขเดิมมา · ออกเลขไม่ได้ = รับต่อได้ (แค่ไม่มีชุด)
  let batchNo: string | null = null;
  if (body.new_batch) {
    const { data: rb, error: rbErr } = await admin.rpc("erp_next_number", { p_key: "rb" });
    if (rbErr || !rb) console.error("[receive] ออกเลขชุดรับไม่สำเร็จ:", rbErr?.message); else batchNo = String(rb);
  } else if (typeof body.receipt_batch_no === "string" && /^RB-[\w-]{1,30}$/.test(body.receipt_batch_no)) {
    batchNo = body.receipt_batch_no;
  }
  const note = backfill ? `รับย้อนหลัง (ไม่มีเอกสาร): ${reason}${body.note ? ` · ${body.note}` : ""}` : (body.note ?? null);

  // 1) หัว GR
  const { data: gr, error: grErr } = await admin
    .from("goods_receipts_v2")
    .insert({ gr_no: grNo, po_id: poId, po_no: po.po_no, seller_name: po.seller_name, receive_date: receiveDate, receiver: body.receiver ?? actor, note, status: "done", receipt_doc_r2_key: body.receipt_doc_r2_key ?? null, bill_doc_r2_key: body.bill_doc_r2_key ?? null, receipt_batch_no: batchNo, is_backfill: backfill })
    .select("id").single();
  if (grErr || !gr) return NextResponse.json({ error: "สร้างใบรับไม่สำเร็จ: " + (grErr?.message ?? "") }, { status: 500 });

  // 2) รายการ GR + อัปเดตบรรทัด PO
  const grLines: Record<string, unknown>[] = [];
  let i = 0;
  for (const l of valid) {
    const pl = lineById.get(String(l.po_line_id));
    if (!pl) continue;
    const recNow = num(l.qty_received);
    const defNow = num(l.qty_defective);
    const caseType = CASE_STATUS[l.case_type] ? l.case_type : "partial_wait";
    grLines.push({
      gr_id: gr.id, po_line_id: l.po_line_id, item_sku_id: pl.item_sku_id, item_name: pl.item_name,
      qty_ordered: num(pl.qty), qty_received: recNow, qty_defective: defNow, case_type: caseType,
      uom: pl.uom, sort_order: i++,
    });
    const newReceived = num(pl.qty_received) + recNow;
    const newDefective = num(pl.qty_defective) + defNow;
    const { error: updErr } = await admin
      .from("purchase_order_lines_v2")
      .update({ qty_received: newReceived, qty_defective: newDefective, line_status: CASE_STATUS[caseType] })
      .eq("id", l.po_line_id);
    if (updErr) return NextResponse.json({ error: "อัปเดตบรรทัด PO ไม่สำเร็จ: " + updErr.message }, { status: 500 });
  }
  if (grLines.length > 0) {
    const { error: glErr } = await admin.from("goods_receipt_lines_v2").insert(grLines);
    if (glErr) return NextResponse.json({ error: "บันทึกรายการรับไม่สำเร็จ: " + glErr.message }, { status: 500 });
  }

  // 3) สถานะ PO รวม — โหลดบรรทัดล่าสุดแล้วสรุป
  const { data: after } = await admin
    .from("purchase_order_lines_v2").select("line_status, qty_received").eq("po_id", poId);
  const all = after ?? [];
  const allClosed = all.length > 0 && all.every((l) => l.line_status === "received" || l.line_status === "short_closed");
  const anyReceived = all.some((l) => num(l.qty_received) > 0 || l.line_status === "received" || l.line_status === "short_closed");
  const poStatus = allClosed ? "received" : anyReceived ? "partial" : "confirmed";
  await admin.from("purchase_orders_v2").update({ status: poStatus }).eq("id", poId);

  // 3.5) รับเข้าสต็อก — ลงบัญชีเดินสต๊อก (ledger แยกคลัง) type "in" เข้าคลังปลายทาง
  // เฉพาะ "ของดี" (qty_received) · ของเสีย/บรรทัดไม่มี SKU จริง → ข้าม
  // คลังปลายทาง: ใช้ที่เลือกมา หรือ default โซนวัตถุดิบ (WH-RAW)
  let toWarehouseId = body.warehouse_id ?? null;
  if (!toWarehouseId) {
    const { data: mainWh } = await admin.from("erp_playground_warehouses").select("id").eq("code", "WH-RAW").maybeSingle();
    toWarehouseId = (mainWh as { id?: string } | null)?.id ?? null;
  }
  let stockedLines = 0;
  const stockWarnings: string[] = [];
  const skipStock = backfill && body.skip_stock === true;   // รับย้อนหลังเลือก "ไม่บวกสต๊อก" ได้ (ของใช้ไปแล้ว/นับใหม่ทีหลัง)
  if (skipStock) {
    // ไม่บวกสต๊อก — ตั้งใจ ไม่ใช่ข้อผิดพลาด
  } else if (!toWarehouseId) {
    stockWarnings.push("ไม่พบคลังปลายทาง (WH-RAW) — ยังไม่ได้บวกสต๊อก");
  } else {
    // ต้นทุน: ราคาซื้อจาก PO (price_est เฉพาะสกุลบาท) ก่อน → ไม่มี ใช้ต้นทุนมาตรฐาน (skus_v2.standard_price)
    const skuIds = [...new Set(valid.map((l) => lineById.get(String(l.po_line_id))?.item_sku_id).filter(Boolean))] as string[];
    const { data: skuCosts } = skuIds.length ? await admin.from("skus_v2").select("id, standard_price").in("id", skuIds) : { data: [] as Record<string, unknown>[] };
    const stdMap = new Map(((skuCosts ?? []) as Record<string, unknown>[]).map((s) => [String(s.id), num(s.standard_price)]));
    for (const l of valid) {
      const pl = lineById.get(String(l.po_line_id));
      if (!pl || !pl.item_sku_id) continue;
      const recQty = num(l.qty_received);
      if (recQty <= 0) continue;
      // สกุลต่างประเทศ (เช่นหยวน) ไม่เอา price_est มาปนบาท → ใช้ต้นทุนมาตรฐานแทน
      const cur = String(pl.currency ?? "").toUpperCase();
      const isTHB = !cur || ["THB", "บาท", "BAHT"].includes(cur);
      const poPrice = num(pl.price_est);
      const unitCost = isTHB && poPrice > 0 ? poPrice : (stdMap.get(String(pl.item_sku_id)) ?? 0);
      const { error: stkErr } = await admin.rpc("erp_stock_post_internal", {
        p_movement_type:   "in",
        p_product_id:      pl.item_sku_id as string,
        p_to_warehouse_id: toWarehouseId,
        p_from_warehouse_id: null,
        p_qty:             recQty,
        p_unit_cost:       unitCost,
        p_reference_type:  "goods_receipt",
        p_reference_id:    gr.id,
        p_reference_label: grNo,
        p_actor:           actor,
      });
      if (stkErr) { console.error("[receive] บวกสต๊อกไม่สำเร็จ:", stkErr.message); stockWarnings.push(`${pl.item_name ?? pl.item_sku_id}: ${stkErr.message}`); }
      else stockedLines += 1;
    }
  }

  // 4) audit — 1 แถวต่อ 1 ใบรับ (ของกลาง, เขียนลงตาราง audit_logs จริง)
  await writeAudit(admin, {
    action:     "receive",
    entityType: "goods_receipts_v2",
    entityId:   gr.id,
    actorId:    user.id,
    actorName:  actor,
    metadata:   { gr_no: grNo, po_no: po.po_no, lines: grLines.length, po_status: poStatus, stocked_lines: stockedLines,
                  ...(batchNo ? { receipt_batch_no: batchNo } : {}), ...(backfill ? { backfill: true, reason, skip_stock: skipStock } : {}) },
  });

  // ---- เตือนไลน์: "รับของเข้า" → กลุ่มรับของ (fallback กลุ่มขอซื้อ) · best-effort ----
  // รับย้อนหลัง = ไม่แจ้ง (ของเก่า กันไลน์ท่วม) · ชุดรับของ = แจ้งครั้งเดียวที่ใบสุดท้ายของชุด (สรุปทั้งชุด)
  try {
    if (backfill || (batchNo && !body.batch_last)) { /* ข้าม */ }
    else if (batchNo) {
      const { data: bgr } = await admin.from("goods_receipts_v2").select("id, po_no, seller_name").eq("receipt_batch_no", batchNo).not("is_active", "is", false);
      const bRows = (bgr ?? []) as { id: string; po_no: string | null; seller_name: string | null }[];
      const { count } = bRows.length ? await admin.from("goods_receipt_lines_v2").select("id", { count: "exact", head: true }).in("gr_id", bRows.map((r) => r.id)) : { count: 0 };
      const sellers = [...new Set(bRows.map((r) => r.seller_name).filter(Boolean))].join(", ");
      const lineText = `📥 รับของเข้าแล้ว · ชุด ${batchNo}\n${sellers}\n${bRows.length} ใบสั่งซื้อ · ${count ?? 0} รายการ\nPO: ${bRows.map((r) => r.po_no).filter(Boolean).join(", ")}\nผู้รับ: ${body.receiver ?? actor}`;
      await pushLineText(admin, ["goods_receipt", "purchase_request"], lineText, "goods_received");
    } else {
      const statusTh = poStatus === "received" ? "รับครบแล้ว ✅" : poStatus === "partial" ? "รับบางส่วน (ยังไม่ครบ)" : "รับแล้ว";
      const lineText = `📥 รับของเข้าแล้ว · ${grNo}\nPO ${po.po_no} · ${po.seller_name}\nรับ ${grLines.length} รายการ · เข้าสต๊อก ${stockedLines} รายการ\nสถานะใบสั่งซื้อ: ${statusTh}\nผู้รับ: ${body.receiver ?? actor}`;
      await pushLineText(admin, ["goods_receipt", "purchase_request"], lineText, "goods_received");
    }
  } catch (e) { console.warn("[receive] LINE notify failed:", e); }

  return NextResponse.json({ ok: true, gr_no: grNo, po_status: poStatus, line_count: grLines.length, stocked_lines: stockedLines, stock_warnings: stockWarnings, receipt_batch_no: batchNo, error: null });
}
