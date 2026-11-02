/**
 * 🧾 อัปเดตงานจากใบขาย — มองจาก "ใบขาย" (กลับทางกับหน้าอัปเดตเป็นชุดที่เริ่มจากใบสั่งผลิต)
 *   บรรทัดใบขายที่ยังไม่ได้ผูกใบสั่งผลิตครบ + ใบสั่งผลิตที่ระบบเสนอ (กติกาเดียวกับ lib/mo-sales-match: ใบเก่าได้ก่อน · ตรงพอดีก่อน)
 *   + ใบที่เลือกแทนได้ (SKU เดียวกัน · เปิดก่อนวันที่ใบขาย · ยังไม่ปิด) — ใบที่ผูกใบขายอื่นอยู่ก็เลือกได้ (ติดป้าย linked
 *     · ผูกจริง = ถอดใบขายเดิมออกก่อน ใบขายนั้นกลับเป็น "ยังไม่ผูก") แต่ระบบไม่เลือกให้เอง
 *   + แท็บ "ผูกแล้ว" (linked) — บรรทัดที่ผูกแล้ว 1 คู่ = 1 แถว ไว้กด "ผูกผิด · ย้าย" (app/master/work-board/sales-move-plan)
 *   ไม่มี React · ใช้ทั้ง API (/api/mo/sales-unlinked) และเทสต์
 */
import { bkkDate, matchSales, type MatchMo, type SaleLine, type SalesLinkRow } from "@/lib/mo-sales-match";

/** ใบสั่งผลิตตอนนี้อยู่ไหน — wait = ยังไม่จ่ายงาน · work = อยู่ที่ช่าง · recv = รับคืนครบแล้ว · ship = ส่งออกจาก QC แล้ว · closed = ปิด/เสร็จแล้ว */
export type MoStage = "wait" | "work" | "recv" | "ship" | "closed";
export const MO_STAGE_LABEL: Record<MoStage, string> = { wait: "รอจ่าย", work: "อยู่ที่ช่าง", recv: "รับคืนแล้ว", ship: "ส่งออกแล้ว", closed: "ปิดแล้ว" };
export type UnlinkedMo = MatchMo & { stage: MoStage };
/** linked = ใบขายอื่นที่ใบนี้ผูกอยู่ (มี = เลือกได้แต่ต้องถอดของเดิมออกก่อน) */
export type MoCand = { mo_no: string; qty: number; opened: string; stage: MoStage; linked?: { so_number: string; qty: number }[] };
/** exact = ระบบจับคู่ครบ (ใบงานได้ใบขายครบจำนวน) · part = ต้องเลือก/ไม่ครบ · none = ไม่มีใบงานว่างให้ผูก (ขายจากสต๊อก / ใบปิดไปแล้ว / ผูกใบขายอื่นหมด) */
export type UnlinkedKind = "exact" | "part" | "none";
export type UnlinkedLine = SaleLine & {
  left: number;
  suggest: { mo_no: string; qty: number; mo_qty: number; mo_full: boolean }[];
  cands: MoCand[];
  kind: UnlinkedKind;
  sku_name?: string | null;
  image_url?: string | null;
  /** เคยผูกแล้วถูกถอดออก (ผูกผิด / ขายจากสต๊อก) — หน้าต่างไม่ติ๊กให้อัตโนมัติ (API เติม) */
  unlinked?: { mo_no: string; at: string | null }[];
};
/** บรรทัดใบขายที่ผูกแล้ว 1 คู่ (บรรทัด ↔ ใบสั่งผลิต) · others = ใบขายอื่นที่ใบเดียวกันผูกอยู่ · cands = ใบที่ย้ายไปได้ */
export type LinkedLine = SaleLine & {
  link_id: string; mo_no: string; mo_qty: number; link_qty: number; stage: MoStage; opened: string;
  others: { so_number: string; qty: number }[];
  cands: MoCand[];
  sku_name?: string | null;
  image_url?: string | null;
};
export type UnlinkedStats = { lines: number; bills: number; exact: number; part: number; none: number; mos_waiting: number; linked: number };

const EPS = 0.0001;
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
const byDateDesc = (a: SaleLine, b: SaleLine) => b.date.localeCompare(a.date) || b.so_number.localeCompare(a.so_number) || a.sku.localeCompare(b.sku);

export function buildUnlinked(mos: UnlinkedMo[], lines: SaleLine[], links: SalesLinkRow[]): { rows: UnlinkedLine[]; linked: LinkedLine[]; stats: UnlinkedStats } {
  const used = new Map<string, number>();
  for (const k of links) used.set(k.sale_line_id, r2((used.get(k.sale_line_id) ?? 0) + k.qty));
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const moById = new Map(mos.map((m) => [m.id, m]));
  const moByNo = new Map(mos.map((m) => [m.mo_no, m]));
  // ใบสั่งผลิต → ใบขายที่ผูกอยู่
  const linksOfMo = new Map<string, { line: string; so_number: string; qty: number }[]>();
  for (const k of links) {
    const so = k.so_number ?? lineById.get(k.sale_line_id)?.so_number ?? "—";
    (linksOfMo.get(k.mo_id) ?? linksOfMo.set(k.mo_id, []).get(k.mo_id)!).push({ line: k.sale_line_id, so_number: so, qty: k.qty });
  }
  const cand = (m: UnlinkedMo, skipLine?: string): MoCand => {
    const lk = (linksOfMo.get(m.id) ?? []).filter((x) => x.line !== skipLine).map(({ so_number, qty }) => ({ so_number, qty }));
    return { mo_no: m.mo_no, qty: m.qty, opened: bkkDate(m.created_at), stage: m.stage, ...(lk.length ? { linked: lk } : {}) };
  };
  // ระบบเสนอ (มองจากใบสั่งผลิต) → กลับด้านเป็นต่อบรรทัดใบขาย
  const res = matchSales(mos, lines, links);
  const sugg = new Map<string, UnlinkedLine["suggest"]>();
  for (const x of res.values()) {
    if (!x.suggest.length) continue;
    const full = x.covered >= x.qty - EPS;
    for (const p of x.suggest) (sugg.get(p.line.id) ?? sugg.set(p.line.id, []).get(p.line.id)!).push({ mo_no: x.mo_no, qty: p.qty, mo_qty: x.qty, mo_full: full });
  }
  const bySku = new Map<string, UnlinkedMo[]>();
  for (const m of mos) (bySku.get(norm(m.sku)) ?? bySku.set(norm(m.sku), []).get(norm(m.sku))!).push(m);
  for (const arr of bySku.values()) arr.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.mo_no.localeCompare(b.mo_no));
  /** ใบที่เลือกได้ของบรรทัดนี้ (ไม่นับใบที่ปิดแล้ว · เปิดก่อนวันที่ใบขาย) */
  const candsOf = (l: SaleLine, exceptMo?: string) => (bySku.get(norm(l.sku)) ?? [])
    .filter((m) => m.mo_no !== exceptMo && m.stage !== "closed" && bkkDate(m.created_at) <= l.date)
    .map((m) => cand(m, l.id));

  const rows: UnlinkedLine[] = [];
  for (const l of lines) {
    const left = r2(l.qty - (used.get(l.id) ?? 0));
    if (left <= EPS) continue;
    const suggest = sugg.get(l.id) ?? [];
    const cands = candsOf(l);
    // ใบที่ระบบเสนอแต่ปิดไปแล้ว ยังให้เห็น (ผูกเพื่อจดประวัติได้)
    for (const s of suggest) {
      if (cands.some((c) => c.mo_no === s.mo_no)) continue;
      const m = moByNo.get(s.mo_no);
      if (m) cands.unshift(cand(m));
    }
    const free = cands.filter((c) => !c.linked).length;
    const covered = r2(suggest.reduce((a, s) => a + s.qty, 0));
    const kind: UnlinkedKind = suggest.length && covered >= left - EPS && suggest.every((s) => s.mo_full) ? "exact" : free ? "part" : "none";
    rows.push({ ...l, left, suggest, cands, kind });
  }
  rows.sort(byDateDesc);

  const linked: LinkedLine[] = [];
  for (const k of links) {
    const l = lineById.get(k.sale_line_id), m = moById.get(k.mo_id);
    if (!l || !m) continue;
    const others = (linksOfMo.get(m.id) ?? []).filter((x) => x.line !== l.id).map(({ so_number, qty }) => ({ so_number, qty }));
    linked.push({ ...l, link_id: k.id ?? `${k.mo_id}:${k.sale_line_id}`, mo_no: m.mo_no, mo_qty: m.qty, link_qty: k.qty, stage: m.stage, opened: bkkDate(m.created_at), others, cands: candsOf(l, m.mo_no) });
  }
  linked.sort(byDateDesc);

  const waiting = new Set(rows.flatMap((r) => r.suggest.map((s) => s.mo_no)).filter((no) => moByNo.get(no)?.stage === "wait"));
  return {
    rows, linked,
    stats: {
      lines: rows.length, bills: new Set(rows.map((r) => r.so_number)).size,
      exact: rows.filter((r) => r.kind === "exact").length, part: rows.filter((r) => r.kind === "part").length,
      none: rows.filter((r) => r.kind === "none").length, mos_waiting: waiting.size, linked: linked.length,
    },
  };
}

/**
 * ใบขายที่เลือกใบงานเดียวกันอยู่ (ใบงาน → บรรทัดใบขาย) — ไว้บอก "รวมกับ ISG… (วันที่ · จำนวน)" (เจ้าของ 2026-11-02)
 * คิดจากที่เลือกจริง (picks) ไม่ใช่แค่ที่ระบบเสนอ · qty = qtyOf (แผนผูกจริง) → ยอดที่ระบบเสนอ → ที่เหลือผูก (ไม่เกินที่ใบงานผลิต)
 */
export type SalePartner = { line_id: string; so_number: string; date: string; qty: number };
export function salePartners(rows: UnlinkedLine[], picks: Map<string, string>, qtyOf?: Map<string, number>): Map<string, SalePartner[]> {
  const out = new Map<string, SalePartner[]>();
  for (const r of rows) {
    const m = picks.get(r.id);
    const c = m ? r.cands.find((x) => x.mo_no === m) : undefined;
    if (!c) continue;
    const qty = qtyOf?.get(r.id) ?? r.suggest.find((x) => x.mo_no === c.mo_no)?.qty ?? Math.min(r.left, c.qty);
    (out.get(c.mo_no) ?? out.set(c.mo_no, []).get(c.mo_no)!).push({ line_id: r.id, so_number: r.so_number, date: r.date, qty });
  }
  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.so_number.localeCompare(b.so_number));
  return out;
}
/**
 * ข้อความใบงานเดียวกันหลายใบขาย: "รวมกับ ISG… (28 ต.ค. 69 · 250) = ครบ 500" / "= 300/500"
 * ไม่มีใบอื่น + ผูกไม่เต็มใบงาน = "ใบงานได้ใบขายแค่ 40/200" · full = ใบขายรวมครบที่ใบงานผลิต
 */
export function partnerNote(partners: Map<string, SalePartner[]>, mo: { mo_no: string; qty: number }, lineId: string, thisQty: number,
  date: (ymd: string) => string, untickedOf?: (lineId: string) => boolean): { text: string; full: boolean } | null {
  const fmtN = (n: number) => r2(n).toLocaleString("th-TH");
  const others = (partners.get(mo.mo_no) ?? []).filter((p) => p.line_id !== lineId);
  const total = r2(others.reduce((a, p) => a + p.qty, thisQty));
  const full = total >= mo.qty - EPS;
  if (!others.length) return full ? null : { text: `ใบงานได้ใบขายแค่ ${fmtN(total)}/${fmtN(mo.qty)}`, full };
  const list = others.map((p) => `${p.so_number} (${date(p.date)} · ${fmtN(p.qty)}${untickedOf?.(p.line_id) ? " · ไม่ติ๊ก" : ""})`).join(", ");
  return { text: `รวมกับ ${list} = ${full ? `ครบ ${fmtN(mo.qty)}` : `${fmtN(total)}/${fmtN(mo.qty)}`}`, full };
}

/** ใบที่ระบบเลือกให้ตั้งต้น: ที่ระบบเสนอ ไม่งั้นใบว่างใบแรก (ไม่เลือกใบที่ผูกใบขายอื่นให้เอง) */
export const defaultPick = (r: UnlinkedLine): string | null => r.suggest[0]?.mo_no ?? r.cands.find((c) => !c.linked)?.mo_no ?? null;

/**
 * ที่เลือกในหน้าต่าง → ก้อนผูกต่อใบสั่งผลิต (POST /api/mo/sales-match ทีละใบ · ใบละครั้งเดียวรวมทุกบรรทัด)
 * picks: บรรทัดใบขาย → ใบที่เลือก · ใช้ยอดที่ระบบเสนอถ้าเลือกตามระบบ ไม่งั้นใช้ min(ยอดคงเหลือของบรรทัด, ที่ใบนั้นยังรับได้)
 * relink = ใบนั้นผูกใบขายอื่นอยู่ → ต้องถอดออกก่อน (ใบขายเดิมกลับเป็น "ยังไม่ผูก")
 */
export function planLinks(rows: UnlinkedLine[], picks: Map<string, string>): { mo_no: string; parts: { sale_line_id: string; qty: number }[]; relink?: { so_number: string; qty: number }[] }[] {
  const room = new Map<string, number>();
  const out = new Map<string, { sale_line_id: string; qty: number }[]>();
  const relink = new Map<string, { so_number: string; qty: number }[]>();
  for (const r of rows) {
    const mo = picks.get(r.id);
    if (!mo) continue;
    const c = r.cands.find((x) => x.mo_no === mo);
    if (!c) continue;
    if (!room.has(mo)) room.set(mo, c.qty);
    if (c.linked) relink.set(mo, c.linked);
    const s = r.suggest.find((x) => x.mo_no === mo);
    const qty = r2(Math.min(s ? s.qty : r.left, room.get(mo) ?? 0));
    if (qty <= EPS) continue;
    room.set(mo, r2((room.get(mo) ?? 0) - qty));
    (out.get(mo) ?? out.set(mo, []).get(mo)!).push({ sale_line_id: r.id, qty });
  }
  return [...out.entries()].map(([mo_no, parts]) => ({ mo_no, parts, ...(relink.has(mo_no) ? { relink: relink.get(mo_no) } : {}) }));
}
