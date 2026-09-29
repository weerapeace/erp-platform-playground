/**
 * GET /api/purchasing/goods-receipt/<id> — ใบรับ GR 1 ใบ (หัว + รายการ พร้อมรหัส/รูป SKU) ไว้พิมพ์ "ใบรับ"
 * <id> รับได้ทั้ง uuid และเลขใบ GR-2026-00001
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { SKU_COVER_SELECT, resolveSkuCover, coverUrl } from "@/lib/sku-cover";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export type GrDetail = {
  id: string; gr_no: string; po_id: string | null; po_no: string; seller_name: string; receive_date: string | null; receiver: string; note: string | null; status: string;
  currency: string; voucher_id: string | null; pv_no: string | null; voucher_status: string | null; receipt_doc_r2_key: string | null; bill_doc_r2_key: string | null;
  lines: { id: string; po_line_id: string | null; item_sku_id: string | null; code: string; item_name: string; uom: string; qty_ordered: number; qty_received: number; qty_defective: number; case_type: string; image_url: string | null; note: string | null }[];
  /** บรรทัดทั้งหมดของใบ PO (ไว้ให้ "เพิ่มรายการที่ลืมลง" ตอนแก้ใบรับ) */
  po_lines: { id: string; item_sku_id: string | null; code: string; item_name: string; uom: string; qty: number; qty_received: number; image_url: string | null }[];
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const q = admin.from("goods_receipts_v2").select("*");
  const { data: gr } = await (isUuid(id) ? q.eq("id", id) : q.eq("gr_no", id)).maybeSingle();
  if (!gr) return NextResponse.json({ error: "ไม่พบใบรับ" }, { status: 404 });
  const g = gr as Row;

  const [{ data: ls }, { data: po }, { data: pv }, { data: pls }] = await Promise.all([
    admin.from("goods_receipt_lines_v2").select("*").eq("gr_id", String(g.id)).not("is_active", "is", false).order("sort_order"),
    g.po_id ? admin.from("purchase_orders_v2").select("currency").eq("id", String(g.po_id)).maybeSingle() : Promise.resolve({ data: null }),
    g.voucher_id ? admin.from("purchase_vouchers_v2").select("pv_no, status").eq("id", String(g.voucher_id)).maybeSingle() : Promise.resolve({ data: null }),
    g.po_id ? admin.from("purchase_order_lines_v2").select("id, item_sku_id, item_name, uom, qty, qty_received, is_active, sort_order").eq("po_id", String(g.po_id)).not("is_active", "is", false).order("sort_order") : Promise.resolve({ data: [] as Row[] }),
  ]);
  const lines = (ls ?? []) as Row[];
  const poLines = (pls ?? []) as Row[];
  const skuIds = [...new Set([...lines, ...poLines].map((l) => String(l.item_sku_id ?? "")).filter(Boolean))];
  const skuMap = new Map<string, Row>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const { data: sk } = await admin.from("skus_v2").select("id, code, " + SKU_COVER_SELECT).in("id", skuIds.slice(i, i + 300));
    for (const s of (sk ?? []) as unknown as Row[]) skuMap.set(String(s.id), s);
  }
  const out: GrDetail = {
    id: String(g.id), gr_no: String(g.gr_no ?? ""), po_id: (g.po_id as string) ?? null, po_no: String(g.po_no ?? ""), seller_name: String(g.seller_name ?? ""),
    receive_date: (g.receive_date as string) ?? null, receiver: String(g.receiver ?? ""), note: (g.note as string) ?? null, status: String(g.status ?? ""),
    currency: String(((po as Row | null)?.currency as string) ?? "THB").toUpperCase(), voucher_id: (g.voucher_id as string) ?? null, pv_no: ((pv as Row | null)?.pv_no as string) ?? null,
    voucher_status: ((pv as Row | null)?.status as string) ?? null,
    receipt_doc_r2_key: (g.receipt_doc_r2_key as string) ?? null, bill_doc_r2_key: (g.bill_doc_r2_key as string) ?? null,
    lines: lines.map((l) => {
      const sku = l.item_sku_id ? skuMap.get(String(l.item_sku_id)) : undefined;
      return {
        id: String(l.id), po_line_id: (l.po_line_id as string) ?? null, item_sku_id: (l.item_sku_id as string) ?? null, code: sku ? String(sku.code ?? "") : "",
        item_name: String(l.item_name ?? ""), uom: String(l.uom ?? ""), qty_ordered: num(l.qty_ordered), qty_received: num(l.qty_received), qty_defective: num(l.qty_defective),
        case_type: String(l.case_type ?? ""), image_url: coverUrl(resolveSkuCover(sku).key), note: (l.note as string) ?? null,
      };
    }),
    po_lines: poLines.map((l) => {
      const sku = l.item_sku_id ? skuMap.get(String(l.item_sku_id)) : undefined;
      return { id: String(l.id), item_sku_id: (l.item_sku_id as string) ?? null, code: sku ? String(sku.code ?? "") : "", item_name: String(l.item_name ?? ""), uom: String(l.uom ?? ""), qty: num(l.qty), qty_received: num(l.qty_received), image_url: coverUrl(resolveSkuCover(sku).key) };
    }),
  };
  return NextResponse.json({ data: out, error: null });
}

/**
 * PATCH /api/purchasing/goods-receipt/<id> — แก้ใบรับที่ลงผิด (วันที่/ผู้รับ/จำนวนรับ/เสีย · ลบบรรทัด · เพิ่มบรรทัดที่ลืมลง · เปลี่ยนไฟล์แนบ)
 * body: { receive_date?, receiver?, note?, receipt_doc_r2_key?, bill_doc_r2_key?, lines?: [{ id, qty_received, qty_defective, case_type? }], add_lines?: [{ po_line_id, qty_received, qty_defective, case_type? }] }
 *   ไฟล์แนบ (ใบรับของ / บิล) = เปลี่ยนเป็นไฟล์ใหม่ได้ แต่เอาออกให้ว่างไม่ได้ (เป็นเอกสารบังคับตอนรับของ)
 * ทำให้ครบทุกที่ที่ตอนรับของเขียนไว้ (ไม่งั้นตัวเลขไม่ตรงกัน):
 *   1. บรรทัด GR   2. บรรทัด PO (qty_received/qty_defective/line_status ตามส่วนต่าง)   3. สถานะ PO รวม
 *   4. สต๊อก: โพสต์ส่วนต่างเป็น in/out ลงคลังเดิมของใบรับ (ledger กลาง erp_stock_post_internal)
 *   5. ใบสำคัญรับที่ยังเป็นร่าง: อัปเดตจำนวนตาม · ยืนยันแล้ว = แก้ไม่ได้ (ราคาเขียนกลับระบบไปแล้ว)
 *   6. audit log เก็บ old/new ทุกบรรทัด
 */
const CASE_STATUS: Record<string, string> = { full: "received", partial_close: "short_closed", partial_wait: "partial", full_defective: "received" };
type LineIn = { id?: string; po_line_id?: string; qty_received?: unknown; qty_defective?: unknown; case_type?: string };

function nextLineStatus(old: string | null, ordered: number, received: number, caseType?: string): string {
  if (caseType && CASE_STATUS[caseType]) return CASE_STATUS[caseType];
  if (ordered > 0 && received >= ordered) return "received";
  if (old === "short_closed" || old === "closed_short") return old;   // ปิดยอดไว้แล้ว คงไว้
  if (received > 0) return "partial";
  return old && !["received", "partial"].includes(old) ? old : "pending";
}

type EditBody = { receive_date?: string | null; receiver?: string | null; note?: string | null; receipt_doc_r2_key?: string | null; bill_doc_r2_key?: string | null; lines?: LineIn[]; add_lines?: LineIn[]; actor?: string };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  let body: EditBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  return editGoodsReceipt(request, id, body, {});
}

/**
 * DELETE /api/purchasing/goods-receipt/<id> — ลบใบรับทั้งใบ (soft delete)
 * = ตั้งทุกบรรทัดเป็น 0 ผ่านตัวคิดส่วนต่างเดียวกับการแก้ไข (คืน PO/สต๊อก/ใบสำคัญร่าง) แล้วปิดใบ · ใบสำคัญยืนยันแล้ว = ลบไม่ได้
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  return editGoodsReceipt(request, id, {}, { deleteWhole: true });
}

async function editGoodsReceipt(request: NextRequest, id: string, body: EditBody, opts: { deleteWhole?: boolean }): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = String(body.actor ?? "") || (user?.user_metadata?.name as string) || user?.email || "system";
  const admin = supabaseAdmin();

  const q = admin.from("goods_receipts_v2").select("*");
  const { data: gr } = await (isUuid(id) ? q.eq("id", id) : q.eq("gr_no", id)).maybeSingle();
  if (!gr) return NextResponse.json({ error: "ไม่พบใบรับ" }, { status: 404 });
  const g = gr as Row;
  const grId = String(g.id);
  if (g.voucher_id) {
    const { data: v } = await admin.from("purchase_vouchers_v2").select("status, pv_no").eq("id", String(g.voucher_id)).maybeSingle();
    if ((v as Row | null)?.status === "confirmed") return NextResponse.json({ error: `ใบรับนี้ออกใบสำคัญ ${(v as Row).pv_no} และยืนยันแล้ว แก้ไม่ได้ (ราคาถูกเขียนกลับระบบแล้ว) — ถ้าจำเป็นให้ยกเลิก/ปรับที่ใบสั่งซื้อและสต๊อกโดยตรง` }, { status: 400 });
  }

  const [{ data: gls }, { data: pls }, { data: mv }] = await Promise.all([
    admin.from("goods_receipt_lines_v2").select("*").eq("gr_id", grId).not("is_active", "is", false),
    g.po_id ? admin.from("purchase_order_lines_v2").select("id, qty, qty_received, qty_defective, line_status, item_sku_id, item_name, uom, price_est, currency").eq("po_id", String(g.po_id)) : Promise.resolve({ data: [] as Row[] }),
    admin.from("erp_playground_stock_movements").select("to_warehouse_id").eq("reference_type", "goods_receipt").eq("reference_id", grId).limit(1),
  ]);
  const grLines = new Map(((gls ?? []) as Row[]).map((l) => [String(l.id), l]));
  const poLines = new Map(((pls ?? []) as Row[]).map((l) => [String(l.id), l]));
  // ลบทั้งใบ = ทุกบรรทัดเป็น 0 (ส่วนต่างติดลบ → คืน PO + ตัดสต๊อกกลับ)
  if (opts.deleteWhole) body = { ...body, lines: [...grLines.values()].map((l) => ({ id: String(l.id), qty_received: 0, qty_defective: 0 })), add_lines: [] };
  // คลังที่ของเข้าตอนรับ (จาก ledger) → ไม่มี = คลังวัตถุดิบ WH-RAW
  let whId = String(((mv ?? [])[0] as Row | undefined)?.to_warehouse_id ?? "") || null;
  if (!whId) { const { data: w } = await admin.from("erp_playground_warehouses").select("id").eq("code", "WH-RAW").maybeSingle(); whId = (w as Row | null)?.id ? String((w as Row).id) : null; }
  const skuIds = [...new Set([...poLines.values()].map((p) => String(p.item_sku_id ?? "")).filter(Boolean))];
  const stdMap = new Map<string, number>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const { data: sc } = await admin.from("skus_v2").select("id, standard_price").in("id", skuIds.slice(i, i + 300));
    for (const s of (sc ?? []) as Row[]) stdMap.set(String(s.id), num(s.standard_price));
  }
  const unitCostOf = (pl: Row) => {
    const cur = String(pl.currency ?? "").toUpperCase();
    const isTHB = !cur || ["THB", "บาท", "BAHT"].includes(cur);
    const p = num(pl.price_est);
    return isTHB && p > 0 ? p : (stdMap.get(String(pl.item_sku_id ?? "")) ?? 0);
  };
  const stockWarnings: string[] = [];
  const postStock = async (pl: Row, delta: number, label: string) => {
    if (!pl.item_sku_id || delta === 0) return;
    if (!whId) { stockWarnings.push("ไม่พบคลัง — ยังไม่ได้ปรับสต๊อก"); return; }
    const { error } = await admin.rpc("erp_stock_post_internal", {
      p_movement_type: delta > 0 ? "in" : "out", p_product_id: pl.item_sku_id, p_to_warehouse_id: delta > 0 ? whId : null, p_from_warehouse_id: delta < 0 ? whId : null,
      p_qty: Math.abs(delta), p_unit_cost: unitCostOf(pl), p_reference_type: "goods_receipt", p_reference_id: grId, p_reference_label: `${g.gr_no} (แก้ไข)`,
      p_note: label, p_actor: actor,
    });
    if (error) stockWarnings.push(`${pl.item_name ?? pl.item_sku_id}: ${error.message}`);
  };
  const applyPoDelta = async (pl: Row, dR: number, dD: number, caseType?: string) => {
    const newR = Math.max(0, num(pl.qty_received) + dR), newD = Math.max(0, num(pl.qty_defective) + dD);
    const st = nextLineStatus((pl.line_status as string) ?? null, num(pl.qty), newR, caseType);
    const { error } = await admin.from("purchase_order_lines_v2").update({ qty_received: newR, qty_defective: newD, line_status: st }).eq("id", String(pl.id));
    if (error) throw new Error("อัปเดตบรรทัด PO ไม่สำเร็จ: " + error.message);
    pl.qty_received = newR; pl.qty_defective = newD; pl.line_status = st;
  };

  const changes: Row[] = [];
  const voucherDraft = g.voucher_id ? String(g.voucher_id) : null;
  try {
    // 1) แก้บรรทัดเดิม
    for (const l of body.lines ?? []) {
      const gl = l.id ? grLines.get(String(l.id)) : undefined; if (!gl) continue;
      const nR = Math.max(0, num(l.qty_received)), nD = Math.max(0, num(l.qty_defective));
      const oR = num(gl.qty_received), oD = num(gl.qty_defective);
      const caseType = l.case_type && CASE_STATUS[l.case_type] ? l.case_type : undefined;
      if (nR === oR && nD === oD && !caseType) continue;
      const pl = gl.po_line_id ? poLines.get(String(gl.po_line_id)) : undefined;
      if (nR <= 0 && nD <= 0) {
        await admin.from("goods_receipt_lines_v2").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", String(gl.id));
        if (voucherDraft) await admin.from("purchase_voucher_lines_v2").update({ is_active: false }).eq("gr_line_id", String(gl.id)).eq("voucher_id", voucherDraft);
      } else {
        await admin.from("goods_receipt_lines_v2").update({ qty_received: nR, qty_defective: nD, ...(caseType ? { case_type: caseType } : {}), updated_at: new Date().toISOString() }).eq("id", String(gl.id));
        if (voucherDraft) await admin.from("purchase_voucher_lines_v2").update({ qty: nR }).eq("gr_line_id", String(gl.id)).eq("voucher_id", voucherDraft);
      }
      if (pl) { await applyPoDelta(pl, nR - oR, nD - oD, caseType); await postStock(pl, nR - oR, `แก้ใบรับ ${g.gr_no}: รับ ${oR} → ${nR}`); }
      changes.push({ gr_line_id: gl.id, item_name: gl.item_name, old: { qty_received: oR, qty_defective: oD }, new: { qty_received: nR, qty_defective: nD }, removed: nR <= 0 && nD <= 0 });
    }
    // 2) เพิ่มบรรทัดที่ลืมลง (จาก PO เดียวกัน)
    let sort = Math.max(0, ...[...grLines.values()].map((l) => num(l.sort_order))) + 1;
    for (const l of body.add_lines ?? []) {
      const pl = l.po_line_id ? poLines.get(String(l.po_line_id)) : undefined; if (!pl) continue;
      if ([...grLines.values()].some((x) => String(x.po_line_id) === String(pl.id))) continue;   // มีอยู่แล้ว → ใช้ทางแก้จำนวนแทน
      const nR = Math.max(0, num(l.qty_received)), nD = Math.max(0, num(l.qty_defective));
      if (nR <= 0 && nD <= 0) continue;
      const caseType = l.case_type && CASE_STATUS[l.case_type] ? l.case_type : (nR >= Math.max(0, num(pl.qty) - num(pl.qty_received)) ? "full" : "partial_wait");
      const { data: ins, error } = await admin.from("goods_receipt_lines_v2").insert({
        gr_id: grId, po_line_id: String(pl.id), item_sku_id: pl.item_sku_id ?? null, item_name: pl.item_name, qty_ordered: num(pl.qty), qty_received: nR, qty_defective: nD, case_type: caseType, uom: pl.uom ?? null, sort_order: sort++,
      }).select("id").single();
      if (error || !ins) throw new Error("เพิ่มรายการไม่สำเร็จ: " + (error?.message ?? ""));
      await applyPoDelta(pl, nR, nD, caseType); await postStock(pl, nR, `แก้ใบรับ ${g.gr_no}: เพิ่มรายการ`);
      if (voucherDraft) {
        await admin.from("purchase_voucher_lines_v2").insert({
          voucher_id: voucherDraft, gr_id: grId, gr_line_id: String((ins as Row).id), po_id: g.po_id ?? null, po_line_id: String(pl.id), po_no: g.po_no ?? null, gr_no: g.gr_no ?? null,
          item_sku_id: pl.item_sku_id ?? null, item_name: pl.item_name, uom: pl.uom ?? null, qty: nR, unit_price: num(pl.price_est) > 0 ? num(pl.price_est) : null, price_source: num(pl.price_est) > 0 ? "po" : "none", sort_order: 999,
        });
      }
      changes.push({ gr_line_id: (ins as Row).id, item_name: pl.item_name, old: null, new: { qty_received: nR, qty_defective: nD }, added: true });
    }
    // 3) หัวใบ
    const hp: Row = { updated_at: new Date().toISOString() };
    if (body.receive_date !== undefined && body.receive_date) hp.receive_date = body.receive_date;
    if (body.receiver !== undefined) hp.receiver = String(body.receiver ?? "").trim() || null;
    if (body.note !== undefined) hp.note = body.note ? String(body.note) : null;
    // ไฟล์แนบ: รับเฉพาะ "เปลี่ยนเป็นไฟล์ใหม่" (ค่าว่าง = ไม่แตะของเดิม)
    for (const k of ["receipt_doc_r2_key", "bill_doc_r2_key"] as const) {
      const v = typeof body[k] === "string" ? String(body[k]).trim() : "";
      if (v && v !== String(g[k] ?? "")) { hp[k] = v; changes.push({ field: k, old: g[k] ?? null, new: v }); }
    }
    if (opts.deleteWhole) { hp.is_active = false; hp.status = "cancelled"; hp.voucher_id = null; }   // ปิดใบ + ปล่อยจากใบสำคัญร่าง
    await admin.from("goods_receipts_v2").update(hp).eq("id", grId);
    // 4) สถานะ PO รวม (สูตรเดียวกับตอนรับของ)
    if (g.po_id) {
      const { data: after } = await admin.from("purchase_order_lines_v2").select("line_status, qty_received, is_active").eq("po_id", String(g.po_id));
      const all = ((after ?? []) as Row[]).filter((l) => l.is_active !== false);
      const allClosed = all.length > 0 && all.every((l) => l.line_status === "received" || l.line_status === "short_closed" || l.line_status === "closed_short");
      const anyReceived = all.some((l) => num(l.qty_received) > 0 || l.line_status === "received" || l.line_status === "short_closed");
      await admin.from("purchase_orders_v2").update({ status: allClosed ? "received" : anyReceived ? "partial" : "confirmed" }).eq("id", String(g.po_id));
    }
    // 5) ใบสำคัญร่าง → คิดใหม่
    if (voucherDraft) { const { recomputeVoucher } = await import("@/lib/purchase-voucher-server"); await recomputeVoucher(admin, voucherDraft); }
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e), stock_warnings: stockWarnings }, { status: 400 });
  }

  await writeAudit(admin, { action: opts.deleteWhole ? "delete" : "update", entityType: "goods_receipts_v2", entityId: grId, actorId: user?.id ?? null, actorName: actor, metadata: { gr_no: g.gr_no, po_no: g.po_no, header: { receive_date: body.receive_date, receiver: body.receiver, note: body.note }, changes, stock_warnings: stockWarnings, snapshot: opts.deleteWhole ? { header: g, lines: [...grLines.values()] } : undefined } });
  return NextResponse.json({ ok: true, deleted: !!opts.deleteWhole, changes: changes.length, stock_warnings: stockWarnings, error: null });
}
