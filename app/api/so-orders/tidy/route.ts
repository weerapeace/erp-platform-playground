/**
 * จัดระเบียบใบสั่งขาย (เจ้าของสั่ง 2026-11-21) — /api/so-orders/tidy
 *   GET                         → กลุ่มที่ "ควรรวม" (ลูกค้า+บริษัทเดียวกัน · วันที่สั่งเดียวกัน · ใบละ 1 รายการ · ยังไม่ส่ง) — แบนเนอร์หน้ารายการ
 *   POST { action, … }
 *     preview   { ids, fill_prices? } → ดูก่อนรวม: ใบหลัก · รายการ · ราคาที่จะเติม · ยอดก่อน/หลัง · เลขที่จะเลื่อนขึ้นมาแทนช่องว่าง (ไม่เขียนอะไร)
 *     merge     { ids, fill_prices? } → รวมเข้าใบเลขน้อยสุด · ใบอื่น = ยกเลิก (เก็บเลขเดิม · แยกคืนได้) · ใบสั่งผลิตย้ายมาผูกใบหลัก
 *     unmerge   { id }                → แยกคืนทุกใบที่เคยรวมเข้าใบนี้ (เลขเดิมยังว่าง = ได้เลขเดิม · ไม่ว่าง = เลขใหม่)
 *     renumber  { id }                → ย้ายเลขใบนี้ลงช่องว่างที่เล็กที่สุดในเดือนเดียวกัน (ใบสั่งผลิตที่ผูกเปลี่ยนเลขตาม)
 *     fill_prices { id }              → เติมราคารายการที่ราคา 0 ด้วยราคาที่เคยขายล่าสุด (shared.lastPrices)
 * กติกา: ใบที่ส่งแล้ว/ยกเลิก/มีของส่งไปแล้ว รวมไม่ได้ · ต้องลูกค้า+บริษัทเดียวกัน · ทุก action = audit (changes: auditDiff)
 * สิทธิ์: ดู so.view · จัดระเบียบ so.create
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, auditDiff } from "@/lib/audit";
import { lastPrices, nextOrderNo } from "../shared";
import { actorOf, loadLineShipState } from "../ship-lines";
import { doRenumber, planMerge, recompute } from "./plan";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const n = (v: unknown) => Number(v) || 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data: os } = await admin.from("so_orders").select("id, order_no, customer_id, customer_name, company_id, company_code, order_date, status, grand_total").eq("status", "confirmed");
  const orders = (os ?? []) as Row[];
  if (!orders.length) return NextResponse.json({ data: [] });
  const ids = orders.map((o) => String(o.id));
  const count = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ls } = await admin.from("so_order_lines").select("order_id").in("order_id", ids.slice(i, i + 200));
    for (const l of (ls ?? []) as Row[]) count.set(String(l.order_id), (count.get(String(l.order_id)) ?? 0) + 1);
  }
  const state = await loadLineShipState(admin, ids.filter((id) => count.get(id) === 1));
  const shippedOrders = new Set([...state.values()].filter((s) => s.shipped > 0).map((s) => s.order_id));
  const groups = new Map<string, Row[]>();
  for (const o of orders) {
    if (count.get(String(o.id)) !== 1 || shippedOrders.has(String(o.id))) continue;
    const k = `${o.customer_id ?? o.customer_name}|${o.company_id ?? o.company_code ?? ""}|${o.order_date}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(o);
  }
  const data = [...groups.values()].filter((g) => g.length >= 2).map((g) => {
    const s = g.sort((a, b) => String(a.order_no).localeCompare(String(b.order_no)));
    return { ids: s.map((o) => String(o.id)), order_nos: s.map((o) => String(o.order_no)), customer_name: s[0].customer_name, order_date: s[0].order_date,
      zero_price: s.filter((o) => !(n(o.grand_total) > 0)).length };
  }).sort((a, b) => b.ids.length - a.ids.length);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.create"); if (denied) return denied;
  const b = await request.json().catch(() => null) as { action?: string; ids?: string[]; id?: string; fill_prices?: boolean } | null;
  const action = String(b?.action ?? "");
  const admin = supabaseAdmin();

  if (action === "preview") {
    const p = await planMerge(admin, b?.ids ?? [], b?.fill_prices !== false);
    if (typeof p === "string") return bad(p);
    return NextResponse.json({ data: { target_no: p.target.order_no, others: p.others.map((o) => o.order_no), lines: p.lines, before_total: p.before_total, after_total: p.after_total, problems: p.problems, renumber: p.renumber.map(({ from, to }) => ({ from, to })) } });
  }

  const me = await actorOf(request, admin);
  const now = new Date().toISOString();

  if (action === "merge") {
    const p = await planMerge(admin, b?.ids ?? [], b?.fill_prices !== false);
    if (typeof p === "string") return bad(p);
    if (p.problems.length) return bad(`รวมไม่ได้: ${p.problems.join(" · ")}`);
    const tid = String(p.target.id), tno = String(p.target.order_no);
    let next = p.lines.filter((l) => l.order_no === tno).length;
    for (const o of p.others) {
      const oid = String(o.id), ono = String(o.order_no);
      const mine = p.lines.filter((l) => l.order_no === ono);
      for (const l of mine) {
        next += 1;
        const { data: cur } = await admin.from("so_order_lines").select("merged_from_order_id").eq("id", l.id).maybeSingle();
        await admin.from("so_order_lines").update({ order_id: tid, line_no: next, merged_from_order_id: (cur as Row | null)?.merged_from_order_id ?? oid }).eq("id", l.id);
      }
      await admin.from("manufacturing_orders").update({ so_order_id: tid, so_order_no: tno }).eq("so_order_id", oid);
      // ใบที่ถูกรวมย้ายไปเป็นใบรองที่รวมไว้แล้ว ให้ชี้ใบหลักใหม่ด้วย (แยกคืนครั้งเดียวได้ครบ)
      await admin.from("so_orders").update({ merged_into_id: tid }).eq("merged_into_id", oid);
      await admin.from("so_orders").update({
        status: "cancelled", cancelled_at: now, cancel_reason: `รวมเข้า ${tno}`, merged_into_id: tid, merged_from_no: ono,
        order_no: `${ono}·รวม`, updated_at: now,
      }).eq("id", oid);
      await writeAudit(admin, { action: "so_order.merged_away", entityType: "so_order", entityId: oid, actorId: me.id, actorName: me.name,
        metadata: { order_no: ono, into: tno, changes: auditDiff({ status: o.status, order_no: ono }, { status: "cancelled", order_no: `${ono}·รวม` }) } });
    }
    const filled = p.lines.filter((l) => l.new_price != null);
    for (const l of filled) await admin.from("so_order_lines").update({ unit_price: l.new_price, note: null }).eq("id", l.id).eq("unit_price", 0);
    const due = p.others.concat(p.target).map((o) => (o.due_date as string) || "").filter(Boolean).sort()[0] || null;
    if (due && !p.target.due_date) await admin.from("so_orders").update({ due_date: due }).eq("id", tid);
    const totals = await recompute(admin, tid);
    await writeAudit(admin, { action: "so_order.merge", entityType: "so_order", entityId: tid, actorId: me.id, actorName: me.name,
      metadata: { order_no: tno, merged: p.others.map((o) => o.order_no), lines: p.lines.length,
        prices_filled: filled.map((l) => ({ sku: l.sku, price: l.new_price, from: l.price_from })),
        changes: auditDiff({ grand_total: n(p.target.grand_total) }, { grand_total: totals?.grand_total ?? null }) } });
    // เลื่อนเลขใบถัดไปขึ้นมาแทนช่องว่าง (เจ้าของสั่ง "ปรับเลขที่ใบสั่งขายให้หน่อย")
    const renumbered: { from: string; to: string }[] = [];
    for (const r of p.renumber) { const x = await doRenumber(admin, r.id, me); if (x) renumbered.push(x); }
    return NextResponse.json({ ok: true, order_no: tno, id: tid, merged: p.others.length, prices_filled: filled.length, grand_total: totals?.grand_total ?? null, renumbered });
  }

  if (action === "unmerge") {
    const tid = String(b?.id ?? "");
    const { data: t } = await admin.from("so_orders").select("*").eq("id", tid).maybeSingle();
    if (!t) return bad("ไม่พบใบสั่งขาย", 404);
    const target = t as Row;
    const { data: subs } = await admin.from("so_orders").select("*").eq("merged_into_id", tid);
    const others = (subs ?? []) as Row[];
    if (!others.length) return bad("ใบนี้ไม่ได้รวมจากใบอื่น");
    const state = await loadLineShipState(admin, [tid]);
    const restored: { from: string; to: string }[] = [];
    for (const o of others) {
      const oid = String(o.id);
      const moving = [...state.values()].filter((s) => s.line.merged_from_order_id === oid);
      if (moving.some((s) => s.shipped > 0)) return bad(`รายการจาก ${o.merged_from_no} ส่งของไปแล้ว — แยกคืนไม่ได้`);
    }
    for (const o of others) {
      const oid = String(o.id), want = String(o.merged_from_no ?? "");
      const { data: taken } = await admin.from("so_orders").select("id").eq("order_no", want).neq("status", "cancelled").maybeSingle();
      const no = want && !taken ? want : await nextOrderNo(admin, (o.company_code as string) ?? null);
      await admin.from("so_orders").update({ status: "confirmed", cancelled_at: null, cancel_reason: null, merged_into_id: null, merged_from_no: null, order_no: no, updated_at: now }).eq("id", oid);
      const moving = [...state.values()].filter((s) => s.line.merged_from_order_id === oid);
      let i = 0;
      for (const s of moving) {
        i += 1;
        await admin.from("so_order_lines").update({ order_id: oid, line_no: i, merged_from_order_id: null }).eq("id", String(s.line.id));
        const moIds = [...new Set([...(s.line.mo_id ? [String(s.line.mo_id)] : []), ...s.mos.map((m) => m.id)])];
        if (moIds.length) await admin.from("manufacturing_orders").update({ so_order_id: oid, so_order_no: no }).in("id", moIds);
      }
      await recompute(admin, oid);
      restored.push({ from: `${want}·รวม`, to: no });
      await writeAudit(admin, { action: "so_order.unmerge", entityType: "so_order", entityId: oid, actorId: me.id, actorName: me.name,
        metadata: { order_no: no, from: target.order_no, lines: moving.length, changes: auditDiff({ status: "cancelled", order_no: o.order_no }, { status: "confirmed", order_no: no }) } });
    }
    const totals = await recompute(admin, tid);
    await writeAudit(admin, { action: "so_order.unmerge_from", entityType: "so_order", entityId: tid, actorId: me.id, actorName: me.name,
      metadata: { order_no: target.order_no, restored, changes: auditDiff({ grand_total: n(target.grand_total) }, { grand_total: totals?.grand_total ?? null }) } });
    return NextResponse.json({ ok: true, restored });
  }

  if (action === "renumber") {
    const r = await doRenumber(admin, String(b?.id ?? ""), me);
    return NextResponse.json({ ok: true, renumbered: r });
  }

  if (action === "fill_prices") {
    const id = String(b?.id ?? "");
    const { data: o } = await admin.from("so_orders").select("order_no, customer_id, status, grand_total").eq("id", id).maybeSingle();
    if (!o) return bad("ไม่พบใบสั่งขาย", 404);
    if ((o as Row).status === "cancelled") return bad("ใบที่ยกเลิกแล้ว แก้ไม่ได้");
    const { data: ls } = await admin.from("so_order_lines").select("id, sku, unit_price").eq("order_id", id);
    const zero = ((ls ?? []) as Row[]).filter((l) => !(n(l.unit_price) > 0));
    const prices = await lastPrices(admin, zero.map((l) => String(l.sku ?? "")), ((o as Row).customer_id as string) ?? null);
    const filled: { sku: unknown; price: number; from: string }[] = [];
    for (const l of zero) {
      const p = prices.get(String(l.sku ?? "").trim());
      if (!p) continue;
      await admin.from("so_order_lines").update({ unit_price: p.price, note: null }).eq("id", String(l.id));
      filled.push({ sku: l.sku, price: p.price, from: p.from });
    }
    const totals = filled.length ? await recompute(admin, id) : null;
    if (filled.length) await writeAudit(admin, { action: "so_order.fill_prices", entityType: "so_order", entityId: id, actorId: me.id, actorName: me.name,
      metadata: { order_no: (o as Row).order_no, filled, changes: auditDiff({ grand_total: n((o as Row).grand_total) }, { grand_total: totals?.grand_total ?? null }) } });
    return NextResponse.json({ ok: true, filled: filled.length, missing: zero.length - filled.length, grand_total: totals?.grand_total ?? null });
  }

  return bad("ไม่รู้จัก action");
}
