/**
 * แยกใบกลับ — ย้อนการรวมใบสำคัญรับ (★ 2026-11-21 ข้อเสนอ 2)
 *   GET  /api/purchasing/vouchers/<id>/split → แยกได้ไหม + ใบที่จะได้คืน (หน้าใบโชว์ปุ่ม "แยกใบกลับ")
 *   POST /api/purchasing/vouchers/<id>/split → คืนใบที่ถูกรวมพร้อมเลขเดิม/สถานะเดิม + ย้ายรายการ/บิลร้าน/ใบส่งของ/ใบรับกลับใบเดิม
 * ใช้ข้อมูลที่จดไว้ตอนรวม (audit "merge" → metadata.split_data) · การรวมก่อนมีระบบนี้ = แยกอัตโนมัติไม่ได้ (บอกตรง ๆ)
 * แยกได้เมื่อ: ใบหลักยังไม่จ่าย · ใบหลักเป็นร่าง หรือยืนยันแล้วแต่อยู่ในโหมดแก้ไข (แยกแล้วกด บันทึก/ยกเลิกการแก้ ต่อได้)
 * ใบร่างที่ถูกรวมเคยคืนเลขไปแล้ว → ได้เลขเดิมคืนถ้ายังว่าง · ถูกใช้ไปแล้ว = ออกเลขใหม่ตามวันที่ใบ · ลงประวัติทุกครั้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { recomputeVoucher, assignVoucherNumber, findOpenMerge } from "@/lib/purchase-voucher-server";
import { syncSellerBillExtras } from "@/lib/seller-bill";
import { voucherPaidReason } from "@/lib/voucher-merge-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;
type SplitSource = { id: string; header: Row; lines: { id: string; sort_order: number | null }[]; bills: string[]; grs: string[] };
type SplitData = { version: number; target_before: Row; sources: SplitSource[] };

async function loadState(id: string) {
  const admin = supabaseAdmin();
  const { data: t } = await admin.from("purchase_vouchers_v2").select("id, pv_no, status, is_active, editing_at, china_bill_id, shipping_bill_id, shipping_payment_status").eq("id", id).maybeSingle();
  const target = t as Row | null;
  if (!target) return { admin, target: null, merge: null, split: null, can: false, reason: "ไม่พบใบสำคัญรับ" };
  const merge = await findOpenMerge(admin, id);
  if (!merge) return { admin, target, merge: null, split: null, can: false, reason: "ใบนี้ไม่มีการรวมใบที่แยกกลับได้" };
  const split = (merge.metadata.split_data ?? null) as SplitData | null;
  if (!split || !Array.isArray(split.sources)) return { admin, target, merge, split: null, can: false, reason: "ใบนี้รวมก่อนมีระบบแยกกลับ (ไม่ได้จดที่มาของแต่ละแถว) — แยกอัตโนมัติไม่ได้" };
  const paid = voucherPaidReason(target as never);
  if (paid) return { admin, target, merge, split, can: false, reason: `ใบหลัก${paid} — แยกกลับไม่ได้` };
  if (target.status === "cancelled") return { admin, target, merge, split, can: false, reason: "ใบนี้ถูกยกเลิกแล้ว" };
  if (target.status === "confirmed" && !target.editing_at) return { admin, target, merge, split, can: false, reason: "ใบนี้ยืนยันแล้ว — กด \"แก้ไขใบ\" ก่อน แล้วค่อยแยกใบกลับ" };
  return { admin, target, merge, split, can: true, reason: null };
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.cost.view"); if (denied) return denied;
  const { id } = await params;
  const st = await loadState(id);
  const merged = st.split ? st.split.sources.map((s) => (s.header?.pv_no as string) ?? "ใบร่าง") : ((st.merge?.metadata.merged_pv_nos as (string | null)[] | undefined) ?? []).map((x) => x ?? "ใบร่าง");
  return NextResponse.json({ data: { has_merge: !!st.merge, can: st.can, reason: st.reason, merged }, error: null });
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const st = await loadState(id);
  if (!st.can || !st.split || !st.merge || !st.target) return NextResponse.json({ error: st.reason ?? "แยกกลับไม่ได้" }, { status: 400 });
  const { admin, split, merge, target } = st;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorName = (user?.user_metadata?.name as string) || user?.email || null;
  const now = new Date().toISOString();

  // ใบที่ถูกรวมต้องยังเป็น "ยกเลิก" อยู่ (มีคนกู้/แก้ไปแล้ว = หยุด กันข้อมูลชนกัน)
  const srcIds = split.sources.map((s) => s.id);
  const { data: srcRows } = await admin.from("purchase_vouchers_v2").select("id, status, pv_no").in("id", srcIds);
  const notCancelled = ((srcRows ?? []) as Row[]).filter((r) => r.status !== "cancelled");
  if (notCancelled.length) return NextResponse.json({ error: `ใบที่ถูกรวม ${notCancelled.map((r) => r.pv_no ?? "ใบร่าง").join(", ")} ไม่ได้อยู่ในสถานะยกเลิกแล้ว — แยกกลับอัตโนมัติไม่ได้` }, { status: 409 });

  const restored: { id: string; pv_no: string | null; status: string; lines: number; bills: number; grs: number }[] = [];
  for (const s of split.sources) {
    const h = s.header ?? {};
    // 1) บิล + ใบรับ ที่ยังอยู่ในใบหลัก → กลับใบเดิม · รายการ = ที่จดไว้ + ที่บิลเหล่านั้นอ้างถึงตอนนี้ (กันบิลถูกลงใบใหม่ระหว่างรวม)
    const { data: billRows } = s.bills.length ? await admin.from("purchase_delivery_bills").select("id, lines").in("id", s.bills).eq("voucher_id", id) : { data: [] };
    const billIds = ((billRows ?? []) as Row[]).map((b) => String(b.id));
    const refLines = new Set<string>();
    for (const b of (billRows ?? []) as Row[]) for (const l of (Array.isArray(b.lines) ? (b.lines as Row[]) : [])) for (const vid of (Array.isArray(l.voucher_line_ids) ? (l.voucher_line_ids as unknown[]) : [])) refLines.add(String(vid));
    const sortOf = new Map(s.lines.map((l) => [l.id, l.sort_order]));
    const wantLines = [...new Set([...s.lines.map((l) => l.id), ...refLines])];
    const { data: inTarget } = wantLines.length ? await admin.from("purchase_voucher_lines_v2").select("id").in("id", wantLines).eq("voucher_id", id) : { data: [] };
    let nLines = 0;
    for (const l of (inTarget ?? []) as Row[]) {
      const lid = String(l.id);
      const p: Row = { voucher_id: s.id, updated_at: now };
      const so = sortOf.get(lid); if (so != null) p.sort_order = so;
      await admin.from("purchase_voucher_lines_v2").update(p).eq("id", lid).eq("voucher_id", id);
      nLines++;
    }
    if (billIds.length) await admin.from("purchase_delivery_bills").update({ voucher_id: s.id, updated_at: now }).in("id", billIds).eq("voucher_id", id);
    const { data: mg } = s.grs.length ? await admin.from("goods_receipts_v2").update({ voucher_id: s.id }).in("id", s.grs).eq("voucher_id", id).select("id") : { data: [] };

    // 2) หัวใบเดิม — เลขเดิม (ร่างที่เคยคืนเลข: ใช้เลขเดิมถ้ายังว่าง ไม่งั้นออกใหม่ตามวันที่) · สถานะเดิม · โหมดแก้เดิม
    let pvNo = (h.pv_no as string | null) ?? null;
    if (pvNo) {
      const { data: taken } = await admin.from("purchase_vouchers_v2").select("id").eq("pv_no", pvNo).neq("id", s.id).limit(1);
      if (((taken ?? []) as Row[]).length) pvNo = null;
    }
    await admin.from("purchase_vouchers_v2").update({
      status: h.status ?? "draft", is_active: h.is_active === false ? false : true, pv_no: pvNo, voucher_date: h.voucher_date ?? undefined,
      note: h.note ?? null, editing_at: h.editing_at ?? null, editing_by: h.editing_by ?? null, edit_reason: h.edit_reason ?? null,
      china_bill_id: h.china_bill_id ?? null, seller_ship_foreign: h.seller_ship_foreign ?? null, pay_fee_thb: h.pay_fee_thb ?? null,
      paid_total_thb: h.paid_total_thb ?? null, fx_rate: h.fx_rate ?? null, updated_at: now,
    }).eq("id", s.id);
    if (!pvNo && (h.status === "draft" || h.pv_no)) await assignVoucherNumber(admin, s.id);
    await recomputeVoucher(admin, s.id);
    try { await syncSellerBillExtras(admin, s.id); } catch { /* ไม่มีสรุปบิล */ }
    const { data: after } = await admin.from("purchase_vouchers_v2").select("pv_no, status").eq("id", s.id).maybeSingle();
    const a = (after ?? {}) as Row;
    restored.push({ id: s.id, pv_no: (a.pv_no as string) ?? null, status: String(a.status ?? h.status ?? ""), lines: nLines, bills: billIds.length, grs: (mg ?? []).length });
    await writeAudit(admin, { action: "unmerge", entityType: "purchase_vouchers_v2", entityId: s.id, actorId: user?.id ?? null, actorName,
      metadata: { note: `แยกกลับจาก ${target.pv_no ?? "ใบหลัก"}`, from: id, merge_audit_id: merge.id, pv_no_before_merge: h.pv_no ?? null, pv_no_now: a.pv_no ?? null, moved_back: { lines: nLines, bills: billIds.length, grs: (mg ?? []).length } } });
  }

  // 3) ใบหลัก: คืนค่าที่การรวมเปลี่ยน (ยอดสรุปบิล/หมายเหตุ/บิลโอนจีน/วันที่) · โหมดแก้ไขคงไว้ (กด บันทึก หรือ ยกเลิกการแก้ ต่อเอง)
  const tb = split.target_before ?? {};
  const md = merge.metadata;
  const tp: Row = { seller_ship_foreign: tb.seller_ship_foreign ?? null, pay_fee_thb: tb.pay_fee_thb ?? null, paid_total_thb: tb.paid_total_thb ?? null, note: tb.note ?? null, china_bill_id: tb.china_bill_id ?? null, updated_at: now };
  const dateChanged = md.date_before && md.date_after && String(md.date_before) !== String(md.date_after);
  if (dateChanged) tp.voucher_date = tb.voucher_date ?? md.date_before;
  await admin.from("purchase_vouchers_v2").update(tp).eq("id", id);
  if (dateChanged && target.status === "draft") await assignVoucherNumber(admin, id);
  await recomputeVoucher(admin, id);
  try { await syncSellerBillExtras(admin, id); } catch { /* ไม่มีสรุปบิล */ }

  await writeAudit(admin, { action: "split", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName,
    metadata: { note: "แยกใบกลับ (ย้อนการรวม)", merge_audit_id: merge.id, restored, split_at: now, merged_at: md.merged_at ?? merge.created_at } });
  return NextResponse.json({ ok: true, restored, still_editing: target.status === "confirmed", error: null });
}
