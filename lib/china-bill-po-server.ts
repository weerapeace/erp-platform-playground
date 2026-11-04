/**
 * 💴 ของกลางฝั่ง server: ผูกบิลจีน ↔ ใบสั่งซื้อ (ตาราง china_bill_po_links) — กติกา pure อยู่ที่ lib/china-bill-po.ts
 *   loadBillPoCandidates()  ใบสั่งซื้อค้างจ่ายของร้าน (ทุกสกุล) + ยอดที่บิลอื่นผูกไว้ + รายการของบิลนี้
 *   loadBillLinkedPos()     ใบสั่งซื้อที่บิลนี้ผูกอยู่ (หน้ารายละเอียดบิล)
 *   loadPoChinaLinks()      บิลจีนที่ผูกกับใบสั่งซื้อ (ป๊อปใบสั่งซื้อ)
 *   similarShopsWithOpenPos() ร้านชื่อคล้ายที่มีใบค้าง (เคสร้านเดียวกันลง 2 ชื่อ)
 *   saveBillLinks()         ตรวจ + บันทึกชุดใหม่ของบิล (แทนชุดเดิม) + audit — สถานะใบสั่งซื้อเปลี่ยนเองที่ DB trigger
 * ใช้ที่: /api/china-pay/bill-pos · /api/purchasing/po-detail · /api/china-pay/voucher-prefill
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { shopNameSimilarity } from "@/lib/partner-match";
import { writeAudit } from "@/lib/audit";
import { isRmbCurrency, validateBillLinks, type BillPoCandidate, type BillPoLinkInput, type ValidateResult } from "@/lib/china-bill-po";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => String(v ?? "").trim();
const r2 = (n: number) => Math.round(n * 100) / 100;

const PO_COLS = "id, po_no, order_date, currency, grand_total, seller_partner_id, seller_name, status, payment_status, paid_via, is_active";

type LinkRow = { bill_id: string; po_id: string; amount_rmb: number; settles_po: boolean; currency_confirmed: boolean };

/** รายการผูกที่ "ยังใช้ได้" (รายการ active + บิลไม่ปิด/ไม่ยกเลิก) ของใบสั่งซื้อชุดนี้ */
async function activeLinksForPos(admin: Admin, poIds: string[]): Promise<LinkRow[]> {
  if (!poIds.length) return [];
  const out: LinkRow[] = [];
  for (let i = 0; i < poIds.length; i += 200) {
    const { data } = await admin.from("china_bill_po_links")
      .select("bill_id, po_id, amount_rmb, settles_po, currency_confirmed, china_bills!inner(is_active, status)")
      .in("po_id", poIds.slice(i, i + 200)).eq("is_active", true);
    for (const r of (data ?? []) as Row[]) {
      const b = (r.china_bills ?? {}) as Row;
      if (b.is_active === false || str(b.status) === "ยกเลิก") continue;
      out.push({ bill_id: str(r.bill_id), po_id: str(r.po_id), amount_rmb: num(r.amount_rmb), settles_po: r.settles_po !== false, currency_confirmed: r.currency_confirmed === true });
    }
  }
  return out;
}

/** ชื่อสินค้า + จำนวนบรรทัดต่อใบ */
async function lineSummary(admin: Admin, poIds: string[]): Promise<Map<string, { n: number; items: string }>> {
  const map = new Map<string, { n: number; names: string[] }>();
  for (let i = 0; i < poIds.length; i += 200) {
    const { data } = await admin.from("purchase_order_lines_v2").select("po_id, item_name")
      .in("po_id", poIds.slice(i, i + 200)).not("is_active", "is", false).order("id").limit(5000);
    for (const r of (data ?? []) as Row[]) {
      const k = str(r.po_id); const e = map.get(k) ?? { n: 0, names: [] };
      e.n += 1;
      const nm = str(r.item_name).replace(/^\[[^\]]*\]\s*/, "");   // ตัด [รหัส] หน้าชื่อ ให้อ่านง่ายบนมือถือ
      if (nm && e.names.length < 2 && !e.names.includes(nm)) e.names.push(nm);
      map.set(k, e);
    }
  }
  return new Map([...map].map(([k, v]) => [k, { n: v.n, items: v.names.join(" · ") }]));
}

async function partnerNames(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return m;
  const { data } = await admin.from("partners_v2").select("id, name_th, display_name").in("id", uniq);
  for (const p of (data ?? []) as Row[]) m.set(str(p.id), str(p.name_th) || str(p.display_name));
  return m;
}

function toCandidate(p: Row, others: LinkRow[], mine: LinkRow | undefined, lines: { n: number; items: string } | undefined, pname: string | null): BillPoCandidate {
  const isRmb = isRmbCurrency(p.currency as string);
  const total = num(p.grand_total);
  const linkedOther = r2(others.reduce((a, l) => a + l.amount_rmb, 0));
  return {
    po_id: str(p.id), po_no: str(p.po_no), order_date: (p.order_date as string) ?? null,
    currency: str(p.currency) || "THB", is_rmb: isRmb, grand_total: total,
    partner_id: (p.seller_partner_id as string) ?? null, partner_name: pname ?? ((p.seller_name as string) ?? null),
    status: (p.status as string) ?? null, payment_status: (p.payment_status as string) ?? null, paid_via: (p.paid_via as string) ?? null,
    line_count: lines?.n ?? 0, items: lines?.items ?? "",
    linked_other_rmb: linkedOther,
    settled_by_other: others.some((l) => l.settles_po),
    remaining_rmb: isRmb && total > 0 ? Math.max(0, r2(total - linkedOther)) : null,
    this_amount_rmb: mine ? mine.amount_rmb : null,
    this_settles: mine ? mine.settles_po : null,
    this_currency_confirmed: mine ? mine.currency_confirmed : null,
  };
}

async function buildCandidates(admin: Admin, pos: Row[], billId: string | null): Promise<BillPoCandidate[]> {
  const ids = pos.map((p) => str(p.id));
  const [links, lines, names] = await Promise.all([
    activeLinksForPos(admin, ids), lineSummary(admin, ids), partnerNames(admin, pos.map((p) => str(p.seller_partner_id))),
  ]);
  return pos.map((p) => {
    const id = str(p.id);
    const all = links.filter((l) => l.po_id === id);
    const mine = billId ? all.find((l) => l.bill_id === billId) : undefined;
    const others = all.filter((l) => l.bill_id !== billId);
    return toCandidate(p, others, mine, lines.get(id), names.get(str(p.seller_partner_id)) ?? null);
  });
}

/**
 * ใบสั่งซื้อที่เลือกผูกได้ของร้าน (ทุกสกุล — ใบบาทมาแบบติดป้าย "สกุลเงินไม่ตรง") เรียงใหม่สุดก่อน
 * ไม่กรองใบร่าง (ข้อมูลจริง: ใบค้างจ่ายเกือบทั้งหมดเป็นร่าง) · ไม่เอาใบยกเลิก/ปิด
 * + ใบที่บิลนี้ผูกอยู่แล้ว (แม้จะจ่ายครบไปแล้ว) เพื่อแก้ยอดได้
 */
export async function loadBillPoCandidates(admin: Admin, opts: { supplierIds: string[]; billId?: string | null; extraPoIds?: string[] }): Promise<BillPoCandidate[]> {
  const billId = opts.billId ?? null;
  const rows: Row[] = [];
  if (opts.supplierIds.length) {
    const { data } = await admin.from("purchase_orders_v2").select(PO_COLS)
      .in("seller_partner_id", opts.supplierIds).not("is_active", "is", false).neq("status", "cancelled")
      .or("payment_status.is.null,payment_status.neq.paid")
      .order("order_date", { ascending: false }).order("po_no", { ascending: false }).limit(400);
    rows.push(...((data ?? []) as Row[]));
  }
  const want = new Set(opts.extraPoIds ?? []);
  if (billId) {
    const { data } = await admin.from("china_bill_po_links").select("po_id").eq("bill_id", billId).eq("is_active", true);
    for (const r of (data ?? []) as Row[]) want.add(str(r.po_id));
  }
  const missing = [...want].filter((id) => !rows.some((r) => str(r.id) === id));
  if (missing.length) {
    const { data } = await admin.from("purchase_orders_v2").select(PO_COLS).in("id", missing);
    rows.push(...((data ?? []) as Row[]));
  }
  return buildCandidates(admin, rows, billId);
}

/** ใบสั่งซื้อที่บิลนี้ผูกอยู่ (สำหรับหน้ารายละเอียดบิล) */
export async function loadBillLinkedPos(admin: Admin, billId: string): Promise<BillPoCandidate[]> {
  const { data } = await admin.from("china_bill_po_links").select("po_id").eq("bill_id", billId).eq("is_active", true);
  const ids = ((data ?? []) as Row[]).map((r) => str(r.po_id));
  if (!ids.length) return [];
  const { data: pos } = await admin.from("purchase_orders_v2").select(PO_COLS).in("id", ids);
  const list = await buildCandidates(admin, (pos ?? []) as Row[], billId);
  return list.sort((a, b) => a.po_no.localeCompare(b.po_no));
}

export type PoChinaLink = { bill_id: string; amount_rmb: number; settles_po: boolean; bill_date: string | null; bill_status: string | null; bill_total_rmb: number; supplier_name: string | null };

/** บิลจีนที่ผูกกับใบสั่งซื้อใบนี้ (ป๊อปใบสั่งซื้อ) — รวมบิลที่ยกเลิกแล้วไม่โชว์ */
export async function loadPoChinaLinks(admin: Admin, poId: string): Promise<PoChinaLink[]> {
  const { data } = await admin.from("china_bill_po_links")
    .select("bill_id, amount_rmb, settles_po, china_bills!inner(bill_date, status, is_active, amount_rmb, fee_rmb, supplier_id)")
    .eq("po_id", poId).eq("is_active", true);
  const rows = ((data ?? []) as Row[]).filter((r) => { const b = (r.china_bills ?? {}) as Row; return b.is_active !== false && str(b.status) !== "ยกเลิก"; });
  const names = await partnerNames(admin, rows.map((r) => str(((r.china_bills ?? {}) as Row).supplier_id)));
  return rows.map((r) => {
    const b = (r.china_bills ?? {}) as Row;
    return {
      bill_id: str(r.bill_id), amount_rmb: num(r.amount_rmb), settles_po: r.settles_po !== false,
      bill_date: (b.bill_date as string) ?? null, bill_status: (b.status as string) ?? null,
      bill_total_rmb: r2(num(b.amount_rmb) + num(b.fee_rmb)), supplier_name: names.get(str(b.supplier_id)) ?? null,
    };
  }).sort((a, b) => String(b.bill_date ?? "").localeCompare(String(a.bill_date ?? "")));
}

export type SimilarShop = { id: string; name: string; score: number; open_pos: number };

/** ร้านชื่อคล้ายที่มีใบค้างจ่าย (ร้านเดียวกันลงไว้ 2 ชื่อ — ข้อมูลจริงเจอ ~5 คู่) · ไม่ผูกอัตโนมัติ แค่เสนอให้คนกดดู */
export async function similarShopsWithOpenPos(admin: Admin, supplierId: string): Promise<SimilarShop[]> {
  const { data: me } = await admin.from("partners_v2").select("id, name_th, display_name, name_en").eq("id", supplierId).maybeSingle();
  if (!me) return [];
  const { data: pos } = await admin.from("purchase_orders_v2").select("seller_partner_id")
    .not("is_active", "is", false).neq("status", "cancelled").or("payment_status.is.null,payment_status.neq.paid")
    .not("seller_partner_id", "is", null).neq("seller_partner_id", supplierId).limit(5000);
  const count = new Map<string, number>();
  for (const r of (pos ?? []) as Row[]) { const k = str(r.seller_partner_id); count.set(k, (count.get(k) ?? 0) + 1); }
  if (!count.size) return [];
  const { data: ps } = await admin.from("partners_v2").select("id, name_th, display_name, name_en").in("id", [...count.keys()]);
  const myNames = [me.name_th, me.display_name, me.name_en].map(str).filter(Boolean);
  const out: SimilarShop[] = [];
  for (const p of (ps ?? []) as Row[]) {
    let score = 0;
    for (const a of myNames) for (const b of [p.name_th, p.display_name, p.name_en].map(str).filter(Boolean)) score = Math.max(score, shopNameSimilarity(a, b));
    if (score >= 0.7) out.push({ id: str(p.id), name: str(p.name_th) || str(p.display_name), score: r2(score), open_pos: count.get(str(p.id)) ?? 0 });
  }
  return out.sort((a, b) => b.score - a.score || b.open_pos - a.open_pos).slice(0, 3);
}

export type SaveLinksResult = ValidateResult & { saved?: number; removed?: number };

/** บันทึกชุดใบสั่งซื้อของบิล (แทนชุดเดิมทั้งหมด) — ตรวจกติกากลางก่อน · ไม่ผ่าน = ไม่เขียนอะไรเลย */
export async function saveBillLinks(admin: Admin, billId: string, inputs: BillPoLinkInput[], actor: { id: string | null; name: string | null }): Promise<SaveLinksResult> {
  const { data: bill } = await admin.from("china_bills").select("id, supplier_id, amount_rmb, is_shipping, vat_type, status, is_active").eq("id", billId).maybeSingle();
  if (!bill) return { ok: false, errors: ["ไม่พบบิลนี้"], links: [], sum_rmb: 0 };
  const b = bill as Row;
  if (b.is_active === false || str(b.status) === "ยกเลิก") return { ok: false, errors: ["บิลนี้ยกเลิก/ปิดแล้ว ผูกใบสั่งซื้อไม่ได้"], links: [], sum_rmb: 0 };
  const isThb = !!b.is_shipping || !!b.vat_type;
  const poIds = [...new Set(inputs.map((i) => str(i.po_id)).filter(Boolean))];
  const cands = await loadBillPoCandidates(admin, { supplierIds: [], billId, extraPoIds: poIds });
  const map = new Map(cands.map((c) => [c.po_id, c]));
  const res = validateBillLinks(isThb ? null : num(b.amount_rmb), inputs, map);
  if (!res.ok) return res;

  const { data: existing } = await admin.from("china_bill_po_links").select("id, po_id, is_active, amount_rmb, settles_po").eq("bill_id", billId);
  const exist = new Map(((existing ?? []) as Row[]).map((r) => [str(r.po_id), r]));
  const now = new Date().toISOString();
  let saved = 0, removed = 0;
  const changes: Record<string, unknown>[] = [];
  for (const l of res.links) {
    const old = exist.get(l.po_id);
    if (old) {
      const same = old.is_active === true && num(old.amount_rmb) === l.amount_rmb && (old.settles_po !== false) === l.settles_po;
      if (same) continue;
      const { error } = await admin.from("china_bill_po_links").update({ amount_rmb: l.amount_rmb, settles_po: l.settles_po, currency_confirmed: l.currency_confirmed, is_active: true, updated_at: now }).eq("id", str(old.id));
      if (error) return { ...res, ok: false, errors: [`บันทึก ${map.get(l.po_id)?.po_no ?? ""} ไม่สำเร็จ: ${error.message}`] };
    } else {
      const { error } = await admin.from("china_bill_po_links").insert({ bill_id: billId, po_id: l.po_id, amount_rmb: l.amount_rmb, settles_po: l.settles_po, currency_confirmed: l.currency_confirmed, created_by: actor.id, created_by_name: actor.name });
      if (error) return { ...res, ok: false, errors: [`บันทึก ${map.get(l.po_id)?.po_no ?? ""} ไม่สำเร็จ: ${error.message}`] };
    }
    saved += 1;
    changes.push({ po_no: map.get(l.po_id)?.po_no, amount_rmb: l.amount_rmb, settles_po: l.settles_po, old_amount_rmb: old && old.is_active === true ? num(old.amount_rmb) : null });
  }
  const keep = new Set(res.links.map((l) => l.po_id));
  for (const [poId, old] of exist) {
    if (keep.has(poId) || old.is_active !== true) continue;
    const { error } = await admin.from("china_bill_po_links").update({ is_active: false, updated_at: now }).eq("id", str(old.id));
    if (error) return { ...res, ok: false, errors: [`เอาใบออกไม่สำเร็จ: ${error.message}`] };
    removed += 1;
    changes.push({ po_id: poId, removed: true, old_amount_rmb: num(old.amount_rmb) });
  }
  if (changes.length) {
    await writeAudit(admin, {
      action: "update", entityType: "china_bills", entityId: billId, actorId: actor.id, actorName: actor.name,
      metadata: { field: "po_links", changes, sum_rmb: res.sum_rmb },
    });
  }
  return { ...res, saved, removed };
}
