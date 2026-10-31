/**
 * 🧾 อัปเดตงานจากใบขาย — มองจาก "ใบขาย" (กลับทางกับหน้าอัปเดตเป็นชุดที่เริ่มจากใบสั่งผลิต)
 *   บรรทัดใบขายที่ยังไม่ได้ผูกใบสั่งผลิตครบ + ใบสั่งผลิตที่ระบบเสนอ (กติกาเดียวกับ lib/mo-sales-match: ใบเก่าได้ก่อน · ตรงพอดีก่อน)
 *   + ใบที่เลือกแทนได้ (SKU เดียวกัน · เปิดก่อนวันที่ใบขาย · ยังไม่ปิด · ยังไม่ผูกใบขาย — API ผูกไม่รับใบที่ผูกแล้ว)
 *   ไม่มี React · ใช้ทั้ง API (/api/mo/sales-unlinked) และเทสต์
 */
import { bkkDate, matchSales, type MatchMo, type SaleLine, type SalesLinkRow } from "@/lib/mo-sales-match";

/** ใบสั่งผลิตตอนนี้อยู่ไหน — wait = ยังไม่จ่ายงาน · work = อยู่ที่ช่าง · recv = รับคืนครบแล้ว · closed = ปิด/เสร็จแล้ว */
export type MoStage = "wait" | "work" | "recv" | "closed";
export const MO_STAGE_LABEL: Record<MoStage, string> = { wait: "รอจ่าย", work: "อยู่ที่ช่าง", recv: "รับคืนแล้ว", closed: "ปิดแล้ว" };
export type UnlinkedMo = MatchMo & { stage: MoStage };
export type MoCand = { mo_no: string; qty: number; opened: string; stage: MoStage };
/** exact = ระบบจับคู่ครบ (ใบงานได้ใบขายครบจำนวน) · part = ต้องเลือก/ไม่ครบ · none = ไม่มีใบงานให้ผูก (ขายจากสต๊อก / ใบปิดไปแล้ว) */
export type UnlinkedKind = "exact" | "part" | "none";
export type UnlinkedLine = SaleLine & {
  left: number;
  suggest: { mo_no: string; qty: number; mo_qty: number; mo_full: boolean }[];
  cands: MoCand[];
  kind: UnlinkedKind;
  sku_name?: string | null;
  image_url?: string | null;
};
export type UnlinkedStats = { lines: number; bills: number; exact: number; part: number; none: number; mos_waiting: number };

const EPS = 0.0001;
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

export function buildUnlinked(mos: UnlinkedMo[], lines: SaleLine[], links: SalesLinkRow[]): { rows: UnlinkedLine[]; stats: UnlinkedStats } {
  const used = new Map<string, number>();
  for (const k of links) used.set(k.sale_line_id, r2((used.get(k.sale_line_id) ?? 0) + k.qty));
  const linkedMo = new Set(links.map((k) => k.mo_id));
  const moByNo = new Map(mos.map((m) => [m.mo_no, m]));
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

  const rows: UnlinkedLine[] = [];
  for (const l of lines) {
    const left = r2(l.qty - (used.get(l.id) ?? 0));
    if (left <= EPS) continue;
    const suggest = sugg.get(l.id) ?? [];
    const cands: MoCand[] = (bySku.get(norm(l.sku)) ?? [])
      .filter((m) => m.stage !== "closed" && !linkedMo.has(m.id) && bkkDate(m.created_at) <= l.date)
      .map((m) => ({ mo_no: m.mo_no, qty: m.qty, opened: bkkDate(m.created_at), stage: m.stage }));
    // ใบที่ระบบเสนอแต่ปิดไปแล้ว ยังให้เห็น (ผูกเพื่อจดประวัติได้)
    for (const s of suggest) {
      if (cands.some((c) => c.mo_no === s.mo_no)) continue;
      const m = moByNo.get(s.mo_no);
      if (m) cands.unshift({ mo_no: m.mo_no, qty: m.qty, opened: bkkDate(m.created_at), stage: m.stage });
    }
    const covered = r2(suggest.reduce((a, s) => a + s.qty, 0));
    const kind: UnlinkedKind = suggest.length && covered >= left - EPS && suggest.every((s) => s.mo_full) ? "exact" : cands.length ? "part" : "none";
    rows.push({ ...l, left, suggest, cands, kind });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.so_number.localeCompare(a.so_number) || a.sku.localeCompare(b.sku));
  const waiting = new Set(rows.flatMap((r) => r.suggest.map((s) => s.mo_no)).filter((no) => moByNo.get(no)?.stage === "wait"));
  return {
    rows,
    stats: {
      lines: rows.length, bills: new Set(rows.map((r) => r.so_number)).size,
      exact: rows.filter((r) => r.kind === "exact").length, part: rows.filter((r) => r.kind === "part").length,
      none: rows.filter((r) => r.kind === "none").length, mos_waiting: waiting.size,
    },
  };
}

/**
 * ที่เลือกในหน้าต่าง → ก้อนผูกต่อใบสั่งผลิต (POST /api/mo/sales-match ทีละใบ · ใบละครั้งเดียวรวมทุกบรรทัด)
 * picks: บรรทัดใบขาย → ใบที่เลือก · ใช้ยอดที่ระบบเสนอถ้าเลือกตามระบบ ไม่งั้นใช้ min(ยอดคงเหลือของบรรทัด, ที่ใบนั้นยังรับได้)
 */
export function planLinks(rows: UnlinkedLine[], picks: Map<string, string>): { mo_no: string; parts: { sale_line_id: string; qty: number }[] }[] {
  const room = new Map<string, number>();
  const out = new Map<string, { sale_line_id: string; qty: number }[]>();
  for (const r of rows) {
    const mo = picks.get(r.id);
    if (!mo) continue;
    const c = r.cands.find((x) => x.mo_no === mo);
    if (!c) continue;
    if (!room.has(mo)) room.set(mo, c.qty);
    const s = r.suggest.find((x) => x.mo_no === mo);
    const qty = r2(Math.min(s ? s.qty : r.left, room.get(mo) ?? 0));
    if (qty <= EPS) continue;
    room.set(mo, r2((room.get(mo) ?? 0) - qty));
    (out.get(mo) ?? out.set(mo, []).get(mo)!).push({ sale_line_id: r.id, qty });
  }
  return [...out.entries()].map(([mo_no, parts]) => ({ mo_no, parts }));
}
