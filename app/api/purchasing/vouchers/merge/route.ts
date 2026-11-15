/**
 * รวมใบร่างหลายใบเป็นใบเดียว
 *   POST /api/purchasing/vouchers/merge  { ids: string[], target_id?: string, voucher_date?: string }
 * ★ 2026-11-15 เจ้าของ: "บิลนี้เป็น 3 บิล แต่ส่งของมารอบเดียว" → แบบ A รวมใบเดียว
 *   - รวมได้เฉพาะใบร่าง ร้านเดียวกัน สกุลเดียวกัน (ตัวตรวจกลาง checkDraftMerge ใน lib/voucher-merge-plan)
 *   - ย้ายบิลร้าน/ใบส่งของ (purchase_delivery_bills) + รายการ (purchase_voucher_lines_v2) + ใบรับ (goods_receipts_v2) เข้าใบหลัก — ไม่ต้องให้ AI อ่านบิลใหม่
 *   - ใบที่เหลือ = ยกเลิก + คืนเลข (เหมือนยกเลิกใบร่าง) · จดในหมายเหตุว่ารวมเข้าใบไหน
 *   - ส่ง voucher_date = เปลี่ยนวันที่ใบหลัก (เช่น วันที่ของมาถึง) แล้วเลขใบย้ายตามวัน
 *   - คิดยอดใหม่ทั้งใบ + ดึงค่าส่งในจีน/ค่าธรรมเนียม/ยอดจ่ายจากสรุปของทุกบิล + บันทึกประวัติ (audit "merge")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { recomputeVoucher, assignVoucherNumber } from "@/lib/purchase-voucher-server";
import { syncSellerBillExtras } from "@/lib/seller-bill";
import { checkDraftMerge, type DraftForMerge } from "@/lib/voucher-merge-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { ids?: unknown; target_id?: unknown; voucher_date?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((x) => String(x)).filter(Boolean))];
  const date = typeof body.voucher_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.voucher_date) ? body.voucher_date : null;
  if (body.voucher_date && !date) return NextResponse.json({ error: "วันที่ใบไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: vs, error: vErr } = await admin.from("purchase_vouchers_v2")
    .select("id, pv_no, status, voucher_date, seller_name, seller_partner_id, currency, fx_rate, seller_ship_foreign, pay_fee_thb, paid_total_thb, china_bill_id, editing_at, note, is_active")
    .in("id", ids);
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  const rows = ((vs ?? []) as Row[]).filter((v) => v.is_active !== false);
  if (rows.length !== ids.length) return NextResponse.json({ error: "บางใบไม่พบหรือถูกยกเลิกไปแล้ว — รีเฟรชหน้าแล้วลองใหม่" }, { status: 400 });

  const check = checkDraftMerge(rows as unknown as DraftForMerge[]);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
  // ร้านในระบบ (ถ้าผูกไว้) ต้องตรงกันด้วย — ชื่อเหมือนแต่คนละร้าน = ไม่รวม
  const partners = new Set(rows.map((r) => r.seller_partner_id).filter(Boolean).map(String));
  if (partners.size > 1) return NextResponse.json({ error: "ร้านในระบบไม่ตรงกัน (ชื่อเหมือนแต่ผูกคนละร้าน) — รวมไม่ได้" }, { status: 400 });
  const chinaBills = new Set(rows.map((r) => r.china_bill_id).filter(Boolean).map(String));
  if (chinaBills.size > 1) return NextResponse.json({ error: "ใบเหล่านี้ผูกบิลจ่ายเงินจีนคนละใบ — รวมไม่ได้" }, { status: 400 });

  const targetId = body.target_id ? String(body.target_id) : check.targetId!;
  const target = rows.find((r) => String(r.id) === targetId);
  if (!target) return NextResponse.json({ error: "ใบหลักต้องเป็นหนึ่งในใบที่เลือก" }, { status: 400 });
  const sources = rows.filter((r) => String(r.id) !== targetId);
  const sourceIds = sources.map((r) => String(r.id));

  // 1) ย้ายรายการ (ต่อท้ายลำดับของใบหลัก)
  const { data: maxRow } = await admin.from("purchase_voucher_lines_v2").select("sort_order").eq("voucher_id", targetId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  let nextSort = (numOrNull((maxRow as Row | null)?.sort_order) ?? 0) + 1;
  let movedLines = 0;
  for (const sid of sourceIds) {
    const { data: ls } = await admin.from("purchase_voucher_lines_v2").select("id, sort_order").eq("voucher_id", sid).order("sort_order", { ascending: true });
    for (const l of (ls ?? []) as Row[]) {
      const { error } = await admin.from("purchase_voucher_lines_v2").update({ voucher_id: targetId, sort_order: nextSort++ }).eq("id", String(l.id));
      if (error) return NextResponse.json({ error: "ย้ายรายการไม่สำเร็จ: " + error.message }, { status: 500 });
      movedLines++;
    }
  }
  // 2) ย้ายบิลร้าน/ใบส่งของ + ใบรับ
  const { data: mb, error: bErr } = await admin.from("purchase_delivery_bills").update({ voucher_id: targetId }).in("voucher_id", sourceIds).select("id");
  if (bErr) return NextResponse.json({ error: "ย้ายบิลไม่สำเร็จ: " + bErr.message }, { status: 500 });
  const { data: mg, error: gErr } = await admin.from("goods_receipts_v2").update({ voucher_id: targetId }).in("voucher_id", sourceIds).select("id");
  if (gErr) return NextResponse.json({ error: "ย้ายใบรับไม่สำเร็จ: " + gErr.message }, { status: 500 });

  // 3) หัวใบหลัก: รวมค่าส่งในจีน/ค่าธรรมเนียม/ยอดจ่าย (ถ้าบิลมีสรุป ขั้น 5 จะคิดจากบิลทับให้) · หมายเหตุต่อกัน · วันที่ใหม่
  const sumOf = (k: string) => { const xs = rows.map((r) => numOrNull(r[k])).filter((x): x is number => x != null && x > 0); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100 : null; };
  const notes: string[] = [];
  for (const r of [target, ...sources]) for (const part of String(r.note ?? "").split(" · ").map((s) => s.trim()).filter(Boolean)) if (!notes.includes(part)) notes.push(part);
  const patch: Row = {
    seller_ship_foreign: sumOf("seller_ship_foreign"), pay_fee_thb: sumOf("pay_fee_thb"), paid_total_thb: sumOf("paid_total_thb"),
    note: notes.length ? notes.join(" · ") : null, updated_at: new Date().toISOString(),
  };
  if (target.fx_rate == null) { const fx = sources.map((r) => numOrNull(r.fx_rate)).find((x) => x != null && x > 0); if (fx) patch.fx_rate = fx; }
  if (!target.china_bill_id && chinaBills.size === 1) patch.china_bill_id = [...chinaBills][0];
  if (!target.seller_partner_id && partners.size === 1) patch.seller_partner_id = [...partners][0];
  if (date) patch.voucher_date = date;
  const { error: tErr } = await admin.from("purchase_vouchers_v2").update(patch).eq("id", targetId);
  if (tErr) return NextResponse.json({ error: "บันทึกใบหลักไม่สำเร็จ: " + tErr.message }, { status: 500 });

  // 4) ปิดใบที่เหลือ + คืนเลข
  const targetNo = String(target.pv_no ?? "");
  for (const s of sources) {
    const note = [String(s.note ?? "").trim(), `[รวมเข้า ${targetNo || "ใบหลัก"}]`].filter(Boolean).join(" ");
    await admin.from("purchase_vouchers_v2").update({ status: "cancelled", is_active: false, pv_no: null, china_bill_id: null, note, updated_at: new Date().toISOString() }).eq("id", String(s.id));
  }

  // 5) เลขใบตามวันที่ใหม่ (ใบร่างที่มีเลขแล้วเท่านั้น — เหมือนแก้วันที่ใบร่าง) + คิดยอดใหม่ + ดึงยอดจากสรุปของทุกบิล
  if (date && target.pv_no && date !== String(target.voucher_date ?? "").slice(0, 10)) await assignVoucherNumber(admin, targetId);
  await recomputeVoucher(admin, targetId);
  try { await syncSellerBillExtras(admin, targetId); } catch { /* ไม่มีสรุปบิล = ใช้ยอดที่รวมไว้ */ }

  const { data: after } = await admin.from("purchase_vouchers_v2").select("pv_no, voucher_date").eq("id", targetId).maybeSingle();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "merge", entityType: "purchase_vouchers_v2", entityId: targetId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      note: "รวมใบร่างเข้าใบนี้", merged_ids: sourceIds, merged_pv_nos: sources.map((s) => s.pv_no ?? null),
      pv_no_before: target.pv_no ?? null, pv_no_after: (after as Row | null)?.pv_no ?? null,
      date_before: target.voucher_date ?? null, date_after: (after as Row | null)?.voucher_date ?? null,
      moved: { lines: movedLines, bills: (mb ?? []).length, grs: (mg ?? []).length },
    },
  });
  for (const s of sources) {
    await writeAudit(admin, { action: "cancel", entityType: "purchase_vouchers_v2", entityId: String(s.id), actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { note: `รวมเข้าใบ ${(after as Row | null)?.pv_no ?? targetNo}`, merged_into: targetId, released_pv_no: s.pv_no ?? null } });
  }
  return NextResponse.json({ ok: true, target_id: targetId, pv_no: (after as Row | null)?.pv_no ?? null, moved: { lines: movedLines, bills: (mb ?? []).length, grs: (mg ?? []).length }, error: null });
}
