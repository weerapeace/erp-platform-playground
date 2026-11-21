/**
 * จัดระเบียบใบสั่งขาย — ตัวคิดของ /api/so-orders/tidy (รวมใบ · เลื่อนเลข · คิดยอดใหม่) แยกไฟล์ให้เทสต์ได้
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit, auditDiff } from "@/lib/audit";
import { computeTotals, lastPrices, type SoOrderHeaderInput, type SoOrderLineInput } from "../shared";
import { loadLineShipState } from "../ship-lines";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;

/** เลขใบ → { prefix, num } เช่น SO2569-11-023 → { prefix: "SO2569-11-", num: 23, pad: 3 } */
export function splitNo(no: string | null): { prefix: string; num: number; pad: number } | null {
  const m = /^(.*?)(\d+)$/.exec(String(no ?? ""));
  return m ? { prefix: m[1], num: Number(m[2]), pad: m[2].length } : null;
}

/** เลขว่างที่เล็กที่สุดในชุดเดียวกัน (ไม่นับใบยกเลิก · ใบที่ถูกรวมเปลี่ยนเลขเป็น "…·รวม" แล้ว) */
export async function smallestFree(admin: Admin, prefix: string, exceptId?: string): Promise<number> {
  const { data } = await admin.from("so_orders").select("id, order_no, status").like("order_no", `${prefix}%`);
  const used = new Set<number>();
  for (const r of (data ?? []) as Row[]) {
    if (r.status === "cancelled" || r.id === exceptId) continue;
    const s = splitNo(r.order_no as string);
    if (s && s.prefix === prefix && /^\d+$/.test(String(r.order_no).slice(prefix.length))) used.add(s.num);
  }
  let i = 1; while (used.has(i)) i++;
  return i;
}

export async function recompute(admin: Admin, orderId: string) {
  const [{ data: so }, { data: lines }] = await Promise.all([
    admin.from("so_orders").select("header_discount_type, header_discount_value, shipping_fee, vat_rate, vat_included, wht_rate").eq("id", orderId).maybeSingle(),
    admin.from("so_order_lines").select("id, sku, product_name, qty, unit_price, discount_type, discount_value, line_no").eq("order_id", orderId).order("line_no"),
  ]);
  if (!so) return null;
  const ls = (lines ?? []) as Row[];
  for (let i = 0; i < ls.length; i++) if (n(ls[i].line_no) !== i + 1) await admin.from("so_order_lines").update({ line_no: i + 1 }).eq("id", String(ls[i].id));
  const totals = computeTotals(so as SoOrderHeaderInput, ls as unknown as SoOrderLineInput[]);
  await admin.from("so_orders").update({ ...totals, updated_at: new Date().toISOString() }).eq("id", orderId);
  return totals;
}

export type Plan = {
  target: Row; others: Row[];
  lines: { id: string; order_no: string; sku: string | null; name: string; qty: number; price: number; new_price: number | null; price_from: string | null; mo_no: string | null }[];
  before_total: number; after_total: number; problems: string[];
  renumber: { id: string; from: string; to: string }[];
};

export async function planMerge(admin: Admin, ids: string[], fill: boolean): Promise<Plan | string> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length < 2) return "เลือกอย่างน้อย 2 ใบ";
  const { data: os } = await admin.from("so_orders").select("*").in("id", uniq);
  const orders = ((os ?? []) as Row[]).sort((a, b) => String(a.order_no).localeCompare(String(b.order_no)));
  if (orders.length !== uniq.length) return "ไม่พบบางใบ — โหลดหน้าใหม่";
  const problems: string[] = [];
  for (const o of orders) if (o.status !== "confirmed") problems.push(`${o.order_no} ${o.status === "shipped" ? "ส่งแล้ว" : "ยกเลิกแล้ว"}`);
  const key = (o: Row) => `${o.customer_id ?? o.customer_name}|${o.company_id ?? o.company_code ?? ""}`;
  if (new Set(orders.map(key)).size > 1) problems.push("ต้องเป็นลูกค้าและบริษัทเดียวกัน");
  const state = await loadLineShipState(admin, uniq);
  for (const s of state.values()) if (s.shipped > 0) { const o = orders.find((x) => x.id === s.order_id); problems.push(`${o?.order_no} มีของส่งไปแล้ว`); }
  const target = orders[0], others = orders.slice(1);
  const lineList = [...state.values()].sort((a, b) => {
    const oa = orders.findIndex((o) => o.id === a.order_id), ob = orders.findIndex((o) => o.id === b.order_id);
    return oa - ob || n(a.line.line_no) - n(b.line.line_no);
  });
  const prices = fill ? await lastPrices(admin, lineList.filter((s) => !(n(s.line.unit_price) > 0)).map((s) => String(s.line.sku ?? "")), (target.customer_id as string) ?? null) : new Map();
  const lines: Plan["lines"] = lineList.map((s) => {
    const p = n(s.line.unit_price), lp = p > 0 ? null : prices.get(String(s.line.sku ?? "").trim()) ?? null;
    return { id: String(s.line.id), order_no: String(orders.find((o) => o.id === s.order_id)?.order_no ?? ""), sku: (s.line.sku as string) ?? null,
      name: String(s.line.product_name ?? ""), qty: n(s.line.qty), price: p, new_price: lp?.price ?? null, price_from: lp?.from ?? null, mo_no: (s.line.mo_no as string) ?? s.mos[0]?.mo_no ?? null };
  });
  const before = orders.reduce((a, o) => a + n(o.grand_total), 0);
  const after = computeTotals(target as SoOrderHeaderInput, lines.map((l) => ({ sku: l.sku, product_name: l.name, qty: l.qty, unit_price: l.new_price ?? l.price }))).grand_total;
  // เลขที่จะเลื่อนขึ้นมาแทนช่องว่าง: ใบเดือนเดียวกันที่เลขมากกว่าใบที่ถูกรวม (ไล่จากน้อยไปมาก)
  const renumber: Plan["renumber"] = [];
  const t = splitNo(target.order_no as string);
  if (t) {
    const { data: same } = await admin.from("so_orders").select("id, order_no, status").like("order_no", `${t.prefix}%`).neq("status", "cancelled");
    const freed = new Set(others.map((o) => splitNo(o.order_no as string)?.num).filter((x): x is number => x != null));
    const used = new Set<number>();
    const live = ((same ?? []) as Row[]).filter((r) => !uniq.includes(String(r.id)) || r.id === target.id)
      .map((r) => ({ id: String(r.id), no: String(r.order_no), s: splitNo(r.order_no as string) }))
      .filter((r) => r.s && r.s.prefix === t.prefix && /^\d+$/.test(r.no.slice(t.prefix.length)));
    for (const r of live) used.add(r.s!.num);
    if (freed.size) {
      for (const r of live.filter((x) => x.s!.num > Math.min(...freed)).sort((a, b) => a.s!.num - b.s!.num)) {
        let i = 1; while (used.has(i)) i++;
        if (i < r.s!.num) { used.delete(r.s!.num); used.add(i); renumber.push({ id: r.id, from: r.no, to: `${t.prefix}${String(i).padStart(r.s!.pad, "0")}` }); }
      }
    }
  }
  return { target, others, lines, before_total: before, after_total: after, problems: [...new Set(problems)], renumber };
}

export async function doRenumber(admin: Admin, id: string, me: { id: string | null; name: string | null }): Promise<{ from: string; to: string } | null> {
  const { data: o } = await admin.from("so_orders").select("id, order_no, status").eq("id", id).maybeSingle();
  const ord = o as Row | null;
  if (!ord || ord.status === "cancelled") return null;
  const s = splitNo(ord.order_no as string);
  if (!s) return null;
  const free = await smallestFree(admin, s.prefix, id);
  if (free >= s.num) return null;
  const to = `${s.prefix}${String(free).padStart(s.pad, "0")}`;
  const { error } = await admin.from("so_orders").update({ order_no: to, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return null;
  await admin.from("manufacturing_orders").update({ so_order_no: to }).eq("so_order_id", id);
  await writeAudit(admin, { action: "so_order.renumber", entityType: "so_order", entityId: id, actorId: me.id, actorName: me.name,
    metadata: { order_no: to, changes: auditDiff({ order_no: ord.order_no }, { order_no: to }) } });
  return { from: String(ord.order_no), to };
}


/** รวมใบ (ใช้ทั้ง API และการรวมที่เจ้าของสั่งในแชต) → ผลลัพธ์ หรือข้อความผิดพลาด */
export async function doMerge(admin: Admin, ids: string[], fill: boolean, me: { id: string | null; name: string | null }) {
  const now = new Date().toISOString();
  const p = await planMerge(admin, ids, fill);
  if (typeof p === "string") return p;
  if (p.problems.length) return `รวมไม่ได้: ${p.problems.join(" · ")}`;
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
  return { ok: true, order_no: tno, id: tid, merged: p.others.length, prices_filled: filled.length, grand_total: totals?.grand_total ?? null, renumbered };
}
