/**
 * รวมใบสำคัญรับหลายใบเป็นใบเดียว
 *   POST /api/purchasing/vouchers/merge  { ids: string[], target_id?: string, voucher_date?: string }
 *   GET  /api/purchasing/vouchers/merge?for=<id>  → ใบอื่นของร้านเดียวกันที่น่าจะ "ส่งมาพร้อมกัน" (ถามตอนกดยืนยัน — ข้อเสนอ 1)
 * ★ 2026-11-15 เจ้าของ: "บิลนี้เป็น 3 บิล แต่ส่งของมารอบเดียว" → แบบ A รวมใบร่าง
 * ★ 2026-11-21 รวมใบ "ยืนยันแล้ว" ได้ด้วย (แบบ 1 + ข้อเสนอ 1, 2, 3) — ตัวตรวจกลาง checkVoucherMerge (lib/voucher-merge-plan)
 *   - ร้าน/สกุลเดียวกัน · ใบยืนยันแล้วต้องยังไม่จ่าย · ใบที่คนอื่นกำลังแก้ = กัน
 *   - ย้ายรายการ / บิลร้าน + ใบส่งของ / ใบรับ เข้าใบหลัก (ไม่ให้ AI อ่านใหม่ · ย้ายทั้งแถว ราคาเดิมไม่เปลี่ยน)
 *   - มีใบยืนยันแล้วในชุด + ใบหลักยืนยันแล้ว → ใบหลักเข้าโหมดแก้ไข (เก็บเวอร์ชันก่อนรวมไว้ · เหตุผล "รวมใบ PV…") → ใส่ค่าส่งแล้วกด บันทึกการแก้ไข
 *   - ใบที่ถูกรวม: ร่าง = ยกเลิก + คืนเลข (กติกาเดิม) · ยืนยันแล้ว = ยกเลิกแต่ "เก็บเลขไว้" (ข้อ 3 · ไม่คืนเลขไปใช้ซ้ำ) + หมายเหตุ [รวมเข้า PV…]
 *   - จดที่มาของทุกแถว (split_data ใน audit "merge") → ปุ่ม "แยกใบกลับ" (/api/purchasing/vouchers/<id>/split · ข้อ 2)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { recomputeVoucher, assignVoucherNumber, snapshotVoucher } from "@/lib/purchase-voucher-server";
import { syncSellerBillExtras } from "@/lib/seller-bill";
import { saveRevision, getRevision, VOUCHER_ENTITY } from "@/lib/document-revisions";
import { checkVoucherMerge, shipTogetherCandidates, SHIP_TOGETHER_DAYS, MERGE_HEADER_KEYS, type VoucherForMerge, type ShipTogetherRow } from "@/lib/voucher-merge-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Row = Record<string, unknown>;
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const pick = (r: Row) => Object.fromEntries(MERGE_HEADER_KEYS.map((k) => [k, r[k] ?? null]));
const SELECT = "id, pv_no, status, voucher_date, seller_name, seller_partner_id, currency, fx_rate, seller_ship_foreign, pay_fee_thb, paid_total_thb, china_bill_id, shipping_bill_id, shipping_payment_status, editing_at, editing_by, edit_reason, note, is_active, revision, confirmed_at, confirmed_by, ship_total_thb, grand_total_thb";

/** ข้อเสนอ 1: ใบอื่นของร้านเดียวกันที่ยังไม่มีค่าส่ง (ห่าง ≤ 14 วัน) — หน้าใบถามก่อนยืนยัน */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.cost.view"); if (denied) return denied;
  const id = String(request.nextUrl.searchParams.get("for") ?? "");
  if (!id) return NextResponse.json({ data: [], error: null });
  const admin = supabaseAdmin();
  const { data: me } = await admin.from("purchase_vouchers_v2").select(SELECT).eq("id", id).maybeSingle();
  const m = me as Row | null;
  if (!m || m.status !== "draft") return NextResponse.json({ data: [], error: null });
  const d = String(m.voucher_date ?? "").slice(0, 10);
  const shift = (days: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); };
  let q = admin.from("purchase_vouchers_v2").select(SELECT).not("is_active", "is", false).in("status", ["draft", "confirmed"])
    .gte("voucher_date", shift(-SHIP_TOGETHER_DAYS)).lte("voucher_date", shift(SHIP_TOGETHER_DAYS)).neq("id", id).limit(50);
  q = m.seller_partner_id ? q.eq("seller_partner_id", String(m.seller_partner_id)) : q.eq("seller_name", String(m.seller_name ?? ""));
  const { data: others } = await q;
  const list = shipTogetherCandidates(m as unknown as ShipTogetherRow, (others ?? []) as unknown as ShipTogetherRow[]);
  return NextResponse.json({ data: list.map((o) => ({ id: o.id, pv_no: o.pv_no, status: o.status, voucher_date: o.voucher_date, grand_total_thb: numOrNull((o as unknown as Row).grand_total_thb) ?? 0 })), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { ids?: unknown; target_id?: unknown; voucher_date?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((x) => String(x)).filter(Boolean))];
  const date = typeof body.voucher_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.voucher_date) ? body.voucher_date : null;
  if (body.voucher_date && !date) return NextResponse.json({ error: "วันที่ใบไม่ถูกต้อง" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorName = (user?.user_metadata?.name as string) || user?.email || null;   // เหมือนตอนเปิดแก้ (editing_by)

  const admin = supabaseAdmin();
  const { data: vs, error: vErr } = await admin.from("purchase_vouchers_v2").select(SELECT).in("id", ids);
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  const rows = ((vs ?? []) as Row[]).map((r) => ({ ...r }));   // สำเนาค่าก่อนรวม (ใช้จด target_before/สถานะเดิม หลังอัปเดตแล้ว)
  if (rows.length !== ids.length) return NextResponse.json({ error: "บางใบไม่พบ — รีเฟรชหน้าแล้วลองใหม่" }, { status: 400 });

  const check = checkVoucherMerge(rows as unknown as VoucherForMerge[], actorName);
  if (!check.ok) return NextResponse.json({ error: check.reason, blocks: check.blocks }, { status: 400 });
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
  const targetConfirmed = target.status === "confirmed";
  const startEditing = check.hasConfirmed && targetConfirmed && !target.editing_at;
  const now = new Date().toISOString();

  // 0) ใบหลักยืนยันแล้ว → เก็บเวอร์ชัน "ก่อนรวม" ไว้ก่อนย้ายอะไร (เหมือนกด แก้ไขใบ)
  if (startEditing) {
    const rev = Number(target.revision) || 1;
    if (!(await getRevision(admin, VOUCHER_ENTITY, targetId, rev))) {
      await saveRevision(admin, { entityType: VOUCHER_ENTITY, entityId: targetId, revNo: rev, action: rev === 1 ? "confirm" : "edit", reason: null,
        snapshot: await snapshotVoucher(admin, targetId), diff: null, actorId: null, actorName: rev === 1 ? ((target.confirmed_by as string) ?? null) : null,
        createdAt: rev === 1 && target.confirmed_at ? String(target.confirmed_at) : undefined });
    }
  }

  // 1) จดที่มาของทุกแถว (ข้อ 2 แยกใบกลับ) — รายการ + ลำดับเดิม · บิล · ใบรับ · หัวใบเดิม
  const splitSources: Row[] = [];
  for (const s of sources) {
    const sid = String(s.id);
    const [{ data: ls }, { data: bs }, { data: gs }] = await Promise.all([
      admin.from("purchase_voucher_lines_v2").select("id, sort_order").eq("voucher_id", sid),
      admin.from("purchase_delivery_bills").select("id").eq("voucher_id", sid),
      admin.from("goods_receipts_v2").select("id").eq("voucher_id", sid),
    ]);
    splitSources.push({ id: sid, header: pick(s), lines: ((ls ?? []) as Row[]).map((l) => ({ id: String(l.id), sort_order: numOrNull(l.sort_order) })),
      bills: ((bs ?? []) as Row[]).map((b) => String(b.id)), grs: ((gs ?? []) as Row[]).map((g) => String(g.id)) });
  }

  // 2) ย้ายรายการ (ต่อท้ายลำดับของใบหลัก) · บิลร้าน/ใบส่งของ · ใบรับ
  const { data: maxRow } = await admin.from("purchase_voucher_lines_v2").select("sort_order").eq("voucher_id", targetId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  let nextSort = (numOrNull((maxRow as Row | null)?.sort_order) ?? 0) + 1;
  let movedLines = 0;
  for (const ss of splitSources) {
    for (const l of [...(ss.lines as Row[])].sort((a, b) => (numOrNull(a.sort_order) ?? 0) - (numOrNull(b.sort_order) ?? 0))) {
      const { error } = await admin.from("purchase_voucher_lines_v2").update({ voucher_id: targetId, sort_order: nextSort++ }).eq("id", String(l.id));
      if (error) return NextResponse.json({ error: "ย้ายรายการไม่สำเร็จ: " + error.message }, { status: 500 });
      movedLines++;
    }
  }
  const { data: mb, error: bErr } = await admin.from("purchase_delivery_bills").update({ voucher_id: targetId }).in("voucher_id", sourceIds).select("id");
  if (bErr) return NextResponse.json({ error: "ย้ายบิลไม่สำเร็จ: " + bErr.message }, { status: 500 });
  const { data: mg, error: gErr } = await admin.from("goods_receipts_v2").update({ voucher_id: targetId }).in("voucher_id", sourceIds).select("id");
  if (gErr) return NextResponse.json({ error: "ย้ายใบรับไม่สำเร็จ: " + gErr.message }, { status: 500 });

  // 3) หัวใบหลัก: รวมค่าส่งในจีน/ค่าธรรมเนียม/ยอดจ่าย · หมายเหตุต่อกัน · วันที่ใหม่ · เข้าโหมดแก้ไข (ถ้ามีใบยืนยันแล้ว)
  const sumOf = (k: string) => { const xs = rows.map((r) => numOrNull(r[k])).filter((x): x is number => x != null && x > 0); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100 : null; };
  const notes: string[] = [];
  for (const r of [target, ...sources]) for (const part of String(r.note ?? "").split(" · ").map((x) => x.trim()).filter(Boolean)) if (!notes.includes(part)) notes.push(part);
  const srcNos = sources.map((s) => String(s.pv_no ?? "ใบร่าง")).join(", ");
  const patch: Row = {
    seller_ship_foreign: sumOf("seller_ship_foreign"), pay_fee_thb: sumOf("pay_fee_thb"), paid_total_thb: sumOf("paid_total_thb"),
    note: notes.length ? notes.join(" · ") : null, updated_at: now,
  };
  if (target.fx_rate == null) { const fx = sources.map((r) => numOrNull(r.fx_rate)).find((x) => x != null && x > 0); if (fx) patch.fx_rate = fx; }
  if (!target.china_bill_id && chinaBills.size === 1) patch.china_bill_id = [...chinaBills][0];
  if (!target.seller_partner_id && partners.size === 1) patch.seller_partner_id = [...partners][0];
  if (date) patch.voucher_date = date;
  const reason = `รวมใบ ${srcNos}`;
  if (startEditing) Object.assign(patch, { editing_at: now, editing_by: actorName, edit_reason: reason });
  else if (targetConfirmed && target.editing_at) patch.edit_reason = [String(target.edit_reason ?? "").trim(), reason].filter(Boolean).join(" · ");
  const { error: tErr } = await admin.from("purchase_vouchers_v2").update(patch).eq("id", targetId);
  if (tErr) return NextResponse.json({ error: "บันทึกใบหลักไม่สำเร็จ: " + tErr.message }, { status: 500 });

  // 4) ปิดใบที่ถูกรวม — ร่าง = คืนเลข (กติกาเดิม) · ยืนยันแล้ว = เก็บเลขไว้ (ข้อ 3 · เลขไม่ถูกนำไปใช้ซ้ำ)
  const targetNo = String(target.pv_no ?? "");
  for (const s of sources) {
    const note = [String(s.note ?? "").trim(), `[รวมเข้า ${targetNo || "ใบหลัก"}]`].filter(Boolean).join(" ");
    const wasConfirmed = s.status === "confirmed";
    await admin.from("purchase_vouchers_v2").update({
      status: "cancelled", is_active: wasConfirmed, pv_no: wasConfirmed ? s.pv_no ?? null : null, china_bill_id: null, note,
      editing_at: null, editing_by: null, edit_reason: null, updated_at: now,
    }).eq("id", String(s.id));
  }

  // 5) เลขใบตามวันที่ใหม่ (เฉพาะใบหลักที่เป็นร่าง — ใบยืนยันแล้วถามเปลี่ยนเลขตอนบันทึกการแก้ไข) + คิดยอดใหม่ + ดึงยอดจากสรุปของทุกบิล
  if (date && !targetConfirmed && target.pv_no && date !== String(target.voucher_date ?? "").slice(0, 10)) await assignVoucherNumber(admin, targetId);
  await recomputeVoucher(admin, targetId);
  try { await syncSellerBillExtras(admin, targetId); } catch { /* ไม่มีสรุปบิล = ใช้ยอดที่รวมไว้ */ }

  const { data: after } = await admin.from("purchase_vouchers_v2").select("pv_no, voucher_date").eq("id", targetId).maybeSingle();
  await writeAudit(admin, {
    action: "merge", entityType: "purchase_vouchers_v2", entityId: targetId, actorId: user?.id ?? null, actorName,
    metadata: {
      note: check.hasConfirmed ? "รวมใบ (มีใบยืนยันแล้ว) เข้าใบนี้" : "รวมใบร่างเข้าใบนี้", merged_ids: sourceIds, merged_pv_nos: sources.map((s) => s.pv_no ?? null),
      pv_no_before: target.pv_no ?? null, pv_no_after: (after as Row | null)?.pv_no ?? null,
      date_before: target.voucher_date ?? null, date_after: (after as Row | null)?.voucher_date ?? null,
      moved: { lines: movedLines, bills: (mb ?? []).length, grs: (mg ?? []).length }, started_editing: startEditing, merged_at: now,   // นาฬิกาเดียวกับ editing_at (กันยกเลิกการแก้หลังรวม)
      split_data: { version: 1, target_before: pick(target), sources: splitSources },
    },
  });
  if (startEditing) await writeAudit(admin, { action: "edit_start", entityType: VOUCHER_ENTITY, entityId: targetId, actorId: user?.id ?? null, actorName,
    metadata: { pv_no: target.pv_no ?? null, revision: Number(target.revision) || 1, reason, via: "merge" } });
  for (const s of sources) {
    await writeAudit(admin, { action: "cancel", entityType: "purchase_vouchers_v2", entityId: String(s.id), actorId: user?.id ?? null, actorName,
      metadata: { note: `รวมเข้าใบ ${(after as Row | null)?.pv_no ?? targetNo}`, merged_into: targetId, was: s.status, kept_pv_no: s.status === "confirmed" ? s.pv_no ?? null : null, released_pv_no: s.status === "confirmed" ? null : s.pv_no ?? null } });
  }
  return NextResponse.json({ ok: true, target_id: targetId, pv_no: (after as Row | null)?.pv_no ?? null, editing: startEditing || (targetConfirmed && !!target.editing_at),
    moved: { lines: movedLines, bills: (mb ?? []).length, grs: (mg ?? []).length }, error: null });
}
