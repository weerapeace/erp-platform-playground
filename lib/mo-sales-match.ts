/**
 * 🧾 จับคู่ใบสั่งผลิต ↔ ใบขาย (บิลที่ส่งลูกค้าแล้ว) — กติกากลาง (ไม่มี React · ใช้ได้ทั้ง API และเทสต์)
 *   เงื่อนไข: รหัสสินค้าเดียวกัน · ใบขายลงวันที่ตั้งแต่วันเปิดใบสั่งผลิต (เวลาไทย) · ไม่นับใบขายร่าง/ยกเลิก (API กรองมาแล้ว)
 *   ใบเก่าได้ก่อน: ไล่ใบสั่งผลิตจากวันเปิดเก่า → ใหม่ · ใบขาย 1 บรรทัดใช้ได้ไม่เกินจำนวนในบรรทัด (หักที่ผูกไว้แล้ว)
 *   แต่ละใบ: มีบรรทัดเดียวที่จำนวนตรงพอดี = ใช้บรรทัดนั้น · ไม่งั้นไล่บรรทัดจากเก่า → ใหม่ จนครบ (30 + 20 = 50)
 *   ใบที่ผูกไว้แล้ว = ไม่เสนอใหม่ (ตัดยอดบรรทัดที่ผูกไว้ออกก่อน ใบอื่นจะได้ไม่จับซ้ำ)
 *   ตาราง mo_sales_links · API /api/mo/sales-match · ใช้ที่หน้าอัปเดตเป็นชุด (บอร์ดจ่ายงาน)
 */

export type SaleLine = { id: string; sale_id: string; so_number: string; date: string; customer: string | null; sku: string; qty: number };
export type MatchMo = { id: string; mo_no: string; sku: string; qty: number; created_at: string };
export type SalesLinkRow = { id?: string; mo_id: string; sale_line_id: string; qty: number; so_number?: string | null; sale_date?: string | null };
export type MatchPart = { line: SaleLine; qty: number };
export type MoMatch = {
  mo_no: string; qty: number;
  /** ผูกไว้แล้ว */
  linked: MatchPart[];
  /** ที่ระบบเสนอ (ยังไม่ผูก) */
  suggest: MatchPart[];
  covered: number;
  /** linked = ผูกแล้ว · exact = เสนอครบจำนวน · partial = เสนอได้บางส่วน · none = ไม่เจอ */
  kind: "linked" | "exact" | "partial" | "none";
};

const EPS = 0.0001;
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
/** วันที่ (เวลาไทย) ของเวลาเปิดใบ — YYYY-MM-DD */
export const bkkDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
};

export function matchSales(mos: MatchMo[], lines: SaleLine[], links: SalesLinkRow[]): Map<string, MoMatch> {
  const out = new Map<string, MoMatch>();
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const avail = new Map(lines.map((l) => [l.id, l.qty]));
  const linkedByMo = new Map<string, MatchPart[]>();
  for (const k of links) {
    avail.set(k.sale_line_id, r2((avail.get(k.sale_line_id) ?? 0) - k.qty));
    const line = lineById.get(k.sale_line_id) ?? { id: k.sale_line_id, sale_id: "", so_number: k.so_number ?? "—", date: k.sale_date ?? "", customer: null, sku: "", qty: k.qty };
    (linkedByMo.get(k.mo_id) ?? linkedByMo.set(k.mo_id, []).get(k.mo_id)!).push({ line, qty: k.qty });
  }
  const bySku = new Map<string, SaleLine[]>();
  for (const l of lines) (bySku.get(norm(l.sku)) ?? bySku.set(norm(l.sku), []).get(norm(l.sku))!).push(l);
  for (const arr of bySku.values()) arr.sort((a, b) => a.date.localeCompare(b.date) || a.so_number.localeCompare(b.so_number));
  const order = [...mos].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.mo_no.localeCompare(b.mo_no));
  for (const m of order) {
    const linked = linkedByMo.get(m.id) ?? [];
    if (linked.length) {
      out.set(m.mo_no, { mo_no: m.mo_no, qty: m.qty, linked, suggest: [], covered: r2(linked.reduce((a, x) => a + x.qty, 0)), kind: "linked" });
      continue;
    }
    const from = bkkDate(m.created_at);
    const cands = (bySku.get(norm(m.sku)) ?? []).filter((l) => l.date >= from && (avail.get(l.id) ?? 0) > EPS);
    const suggest: MatchPart[] = [];
    const exact = cands.find((l) => Math.abs((avail.get(l.id) ?? 0) - m.qty) < EPS);
    if (exact) suggest.push({ line: exact, qty: m.qty });
    else {
      let need = m.qty;
      for (const l of cands) {
        if (need <= EPS) break;
        const take = r2(Math.min(need, avail.get(l.id) ?? 0));
        if (take > EPS) { suggest.push({ line: l, qty: take }); need = r2(need - take); }
      }
    }
    for (const s of suggest) avail.set(s.line.id, r2((avail.get(s.line.id) ?? 0) - s.qty));
    const covered = r2(suggest.reduce((a, x) => a + x.qty, 0));
    out.set(m.mo_no, { mo_no: m.mo_no, qty: m.qty, linked: [], suggest, covered, kind: covered >= m.qty - EPS && covered > 0 ? "exact" : covered > 0 ? "partial" : "none" });
  }
  return out;
}

/** ข้อความสั้นของคู่ที่เจอ: "ISG2569-10-020 · 80" / "ISG…-020 (30) + ISG…-025 (20)" */
export const matchText = (parts: MatchPart[]) =>
  parts.length === 1 ? `${parts[0].line.so_number} · ${parts[0].qty} ชิ้น` : parts.map((p) => `${p.line.so_number} (${p.qty})`).join(" + ");
/** วันที่ใบขายล่าสุดในคู่ (ใช้เป็นวันส่งออก) */
export const matchShipDate = (parts: MatchPart[]) => parts.map((p) => p.line.date).filter(Boolean).sort().pop() ?? null;
