/**
 * ใบสั่งขาย → "อัปเดตสถานะ": จับคู่ใบขาย (บิล) ให้รายการในใบสั่งขาย — ตรรกะล้วน ไม่แตะ DB
 * เจ้าของสั่ง 2026-11-05: "ขอปุ่ม update สถานะที่ใบสั่งขาย จะ update ทั้งใบสั่งผลิตและใบสั่งขาย พร้อมเชื่อมใบขาย"
 *
 * หลักฐาน 2 แบบ (เรียงความเชื่อ):
 *   1) หมายเหตุจากชีต "ชีต: ส่งแล้ว 16/9/2569 100 ใบ ส่งแล้ว 5/10/2569 100 ใบ" → หาบิลวันที่ตรง (+จำนวนตรงก่อน)
 *      บิลว่าง = ผูก · บิลผูกใบผลิตอื่นอยู่ = ย้ายมา (มีหลักฐานวันที่) · บิลร่าง = ให้ยืนยันใบขายก่อน
 *   2) ไม่มีหมายเหตุชีต → บิลว่างที่ลงวันที่ตั้งแต่วันเปิดใบผลิต (ใบเก่าได้ก่อน — แบบเดียวกับ lib/mo-sales-match) ไม่ย้ายของใคร
 * ใบผลิตที่ถูกย้ายบิลออก → เสนอบิลว่างให้แทน (refill) เพื่อไม่ให้ใบนั้นกลับเป็น "ขายไม่ครบ"
 * ฝั่งเซิร์ฟเวอร์: app/api/so-orders/[id]/bill-match (GET แผน · POST บันทึก + ปิด/เปิดใบผลิตอัตโนมัติ lib/mo-auto-close)
 */

const EPS = 0.0001;

/** การส่ง 1 ครั้งตามหมายเหตุชีต — qty null = ชีตไม่บอกจำนวน (ถือว่าส่งที่เหลือทั้งหมดในวันนั้น) */
export type SheetShip = { date: string; qty: number | null };

/** อ่าน "ส่งแล้ว 16/9/2569 100 ใบ" จากหมายเหตุ (ปี พ.ศ. → ค.ศ.) — วันที่อ่านไม่ได้ข้าม */
export function parseSheetShips(note: string | null | undefined): SheetShip[] {
  const out: SheetShip[] = [];
  const re = /ส่งแล้ว\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+([\d,]+(?:\.\d+)?)\s*ใบ)?/g;
  for (const m of String(note ?? "").matchAll(re)) {
    const d = Number(m[1]), mo = Number(m[2]); let y = Number(m[3]);
    if (y > 2400) y -= 543;
    if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y > 2000)) continue;
    const qty = m[4] ? Number(m[4].replace(/,/g, "")) : null;
    out.push({ date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, qty: qty != null && qty > 0 ? qty : null });
  }
  return out;
}

/** บรรทัดใบขาย (บิล) 1 บรรทัด + ผูกกับใบผลิตไหนอยู่บ้าง */
export type BillLineFact = {
  id: string; so_number: string; date: string; qty: number;
  /** ใบขายยังเป็นร่าง — ผูกไม่ได้จนกว่าจะยืนยัน */
  draft: boolean;
  links: { mo_id: string; mo_no: string; qty: number }[];
};

export type PlanKind = "free" | "move" | "draft" | "refill";
export type PlanItem = {
  kind: PlanKind; sale_line_id: string; so_number: string; date: string; qty: number;
  to_mo_id: string; to_mo_no: string;
  /** move: ย้ายมาจากใบผลิตนี้ */
  from?: { mo_id: string; mo_no: string };
  /** มาจากหมายเหตุชีต (true) หรือระบบเดาจากวันที่ (false) */
  bySheet: boolean;
};

/** ยอดที่แผนจองไปแล้วต่อบรรทัดบิล — ใช้ร่วมทุกรายการในใบสั่งขาย (บิลเดียวไม่ถูกเสนอซ้ำ) */
export type PlanUsage = { take: Map<string, number>; moved: Map<string, number> };
export const newUsage = (): PlanUsage => ({ take: new Map(), moved: new Map() });
const linkKey = (billId: string, moId: string) => `${billId}|${moId}`;

const linkedQty = (b: BillLineFact) => b.links.reduce((a, l) => a + l.qty, 0);
/** ยังเหลือให้ผูกได้ (ไม่นับที่แผนนี้ย้ายออกมาแล้ว — ย้ายออก = เหลือเท่าเดิม แต่ส่วนนั้นถูกจองให้รายการที่ย้ายไปแล้ว) */
const freeOf = (b: BillLineFact, u: PlanUsage) => Math.max(0, b.qty - linkedQty(b) - (u.take.get(b.id) ?? 0));

/**
 * แผนผูกบิลของรายการเดียว
 *   lineMoIds = ใบผลิตทุกใบของรายการ (ผูกกับใบพวกนี้อยู่แล้ว = นับเป็นส่งแล้ว ไม่ย้าย)
 *   target   = ใบผลิตที่จะผูกบิลใหม่เข้า · from = วันเปิดใบ (YYYY-MM-DD เวลาไทย)
 */
export function planLineBills(f: {
  ordered: number; shipped: number; lineMoIds: string[];
  target: { id: string; mo_no: string; from: string };
  sheet: SheetShip[]; bills: BillLineFact[]; usage: PlanUsage;
  /** ใบผลิตที่ห้ามย้ายบิลออก (เช่น ใบของรายการอื่นในใบสั่งขายเดียวกัน) */
  protect?: string[];
}): { need: number; items: PlanItem[]; short: number } {
  const mine = new Set(f.lineMoIds);
  const keep = new Set(f.protect ?? []);
  let need = Math.max(0, f.ordered - f.shipped);
  const items: PlanItem[] = [];
  if (need <= EPS) return { need: 0, items, short: 0 };
  const startNeed = need;
  const push = (it: Omit<PlanItem, "to_mo_id" | "to_mo_no">) => { items.push({ ...it, to_mo_id: f.target.id, to_mo_no: f.target.mo_no }); need -= it.qty; };

  if (f.sheet.length) {
    for (const e of f.sheet) {
      if (need <= EPS) break;
      const sameDay = f.bills.filter((b) => b.date === e.date);
      // ส่วนที่ผูกกับใบของรายการนี้อยู่แล้ว = นับใน shipped แล้ว → หักออกจากที่ชีตบอก
      const already = sameDay.reduce((a, b) => a + b.links.filter((l) => mine.has(l.mo_id)).reduce((s, l) => s + l.qty, 0), 0);
      let want = Math.min(need, Math.max(0, (e.qty ?? need) - already));
      if (want <= EPS) continue;
      // จำนวนตรงกับชีตก่อน แล้วค่อยบิลอื่นของวันเดียวกัน
      const cand = [...sameDay].sort((a, b) => Number(Math.abs(b.qty - (e.qty ?? 0)) < EPS) - Number(Math.abs(a.qty - (e.qty ?? 0)) < EPS) || a.so_number.localeCompare(b.so_number));
      for (const b of cand) {
        if (want <= EPS) break;
        const free = freeOf(b, f.usage);
        if (free > EPS) {
          const q = Math.min(want, free);
          f.usage.take.set(b.id, (f.usage.take.get(b.id) ?? 0) + q);
          push({ kind: b.draft ? "draft" : "free", sale_line_id: b.id, so_number: b.so_number, date: b.date, qty: q, bySheet: true });
          want -= q;
        }
        if (want <= EPS || b.draft) continue;
        // บิลผูกใบผลิตอื่นอยู่ (ไม่ใช่ของรายการนี้) — ชีตยืนยันวันที่แล้ว → เสนอย้ายมา
        for (const l of b.links) {
          if (want <= EPS) break;
          if (mine.has(l.mo_id) || keep.has(l.mo_id)) continue;
          const k = linkKey(b.id, l.mo_id);
          const movable = l.qty - (f.usage.moved.get(k) ?? 0);
          if (movable <= EPS) continue;
          const q = Math.min(want, movable);
          f.usage.moved.set(k, (f.usage.moved.get(k) ?? 0) + q);
          push({ kind: "move", sale_line_id: b.id, so_number: b.so_number, date: b.date, qty: q, from: { mo_id: l.mo_id, mo_no: l.mo_no }, bySheet: true });
          want -= q;
        }
      }
    }
  } else {
    // ไม่มีหลักฐานจากชีต → บิลว่างที่ลงหลังวันเปิดใบผลิต ใบเก่าได้ก่อน (ไม่ย้ายของใบอื่น)
    const cand = f.bills.filter((b) => !b.draft && b.date >= f.target.from).sort((a, b) => a.date.localeCompare(b.date) || a.so_number.localeCompare(b.so_number));
    for (const b of cand) {
      if (need <= EPS) break;
      const free = freeOf(b, f.usage);
      if (free <= EPS) continue;
      const q = Math.min(need, free);
      f.usage.take.set(b.id, (f.usage.take.get(b.id) ?? 0) + q);
      push({ kind: "free", sale_line_id: b.id, so_number: b.so_number, date: b.date, qty: q, bySheet: false });
    }
  }
  const short = Math.max(0, need);
  return { need: startNeed, items, short: short > EPS ? Math.round(short * 100) / 100 : 0 };
}

/**
 * ใบผลิตที่ถูกย้ายบิลออก → บิลว่างให้แทน (ลงหลังวันเปิดใบนั้น ใบเก่าได้ก่อน · ไม่ใช้บิลที่แผนจองแล้ว)
 *   lost = ชิ้นที่เสียไป · bills = บิลรหัสเดียวกันของลูกค้าเดียวกัน
 */
export function planRefills(sources: { mo_id: string; mo_no: string; from: string; lost: number; bills: BillLineFact[] }[], usage: PlanUsage): PlanItem[] {
  const out: PlanItem[] = [];
  for (const s of sources) {
    let left = s.lost;
    const cand = s.bills.filter((b) => !b.draft && b.date >= s.from).sort((a, b) => a.date.localeCompare(b.date) || a.so_number.localeCompare(b.so_number));
    for (const b of cand) {
      if (left <= EPS) break;
      const free = freeOf(b, usage);
      if (free <= EPS) continue;
      const q = Math.min(left, free);
      usage.take.set(b.id, (usage.take.get(b.id) ?? 0) + q);
      out.push({ kind: "refill", sale_line_id: b.id, so_number: b.so_number, date: b.date, qty: q, to_mo_id: s.mo_id, to_mo_no: s.mo_no, bySheet: false });
      left -= q;
    }
  }
  return out;
}

/** ลูกค้าเดียวกันไหม — id ตรง หรือชื่อบริษัทเดียวกันคนละสาขา (ตัด "สาขา…" / "สำนักงานใหญ่" / "(สาขาที่ …)") */
export function customerRoot(name: string | null | undefined): string {
  return String(name ?? "")
    .replace(/\(สาขาที่[^)]*\)/g, "")
    .replace(/\s(สาขา\S*|สำนักงานใหญ่).*$/u, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
export function sameCustomer(a: { id: string | null; name: string | null }, b: { id: string | null; name: string | null }): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  const ra = customerRoot(a.name), rb = customerRoot(b.name);
  return !!ra && ra === rb;
}
