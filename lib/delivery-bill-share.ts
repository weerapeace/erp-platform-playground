/**
 * ใบส่งของจากขนส่ง "ใช้ร่วมหลายใบสำคัญ" (★ 2026-11-22 · เจ้าของเลือกแบบ 2)
 *   ใบส่งของ 1 ใบ (กระดาษจากขนส่ง 1 เลข EK-…) มีหลายกล่อง แต่ละกล่องอาจเป็นของใบสำคัญคนละใบ
 *   → แต่ละแถว (lines jsonb) เลือกได้ว่าเป็นของใบไหน — ไม่เพิ่มตาราง:
 *       for_voucher_id  ว่าง = ของใบเจ้าของบิล (purchase_delivery_bills.voucher_id) · มีค่า = ของใบนั้น
 *       hold            "parked" = ยังไม่มีใบ · พักไว้ · "not_ours" = ไม่ใช่ของเรา (ไม่ลงใบไหน)
 *       applied_at      ใช้น้ำหนัก/คิวของแถวนี้ลงใบแล้วเมื่อไร (ต่อแถว เพราะแต่ละใบกด "ใช้" เอง)
 *   ใช้ที่: /api/purchasing/vouchers/[id]/bills (GET เห็นบิลที่มีแถวของตัวเอง · ใช้น้ำหนัก/คิวเฉพาะแถวของตัวเอง · รับแถวเข้าใบ)
 *           components/delivery-bill-panel (ช่อง "ของใบ" ต่อแถว · ป้ายยังไม่บันทึก) · merge/split (ย้ายแถวที่ชี้ใบที่ถูกรวม)
 */
import type { DeliveryBillLine } from "@/lib/delivery-bill";

export type RowHold = "parked" | "not_ours";
export type RowChoice = { kind: "voucher"; voucherId: string } | { kind: "parked" } | { kind: "not_ours" };

/** แถวนี้เป็นของใบสำคัญไหน — null = พักไว้ / ไม่ใช่ของเรา */
export function rowOwner(l: Pick<DeliveryBillLine, "for_voucher_id" | "hold">, homeVoucherId: string): string | null {
  if (l.hold === "parked" || l.hold === "not_ours") return null;
  return l.for_voucher_id || homeVoucherId;
}

/** ดัชนีแถวที่เป็นของใบนี้ */
export function rowsOf(lines: DeliveryBillLine[], homeVoucherId: string, voucherId: string): number[] {
  const out: number[] = [];
  lines.forEach((l, i) => { if (rowOwner(l, homeVoucherId) === voucherId) out.push(i); });
  return out;
}

/** ใบสำคัญอื่นที่มีแถวอยู่ในบิลนี้ (ไม่รวมเจ้าของบิล) */
export function otherOwners(lines: DeliveryBillLine[], homeVoucherId: string): string[] {
  const s = new Set<string>();
  for (const l of lines) { const o = rowOwner(l, homeVoucherId); if (o && o !== homeVoucherId) s.add(o); }
  return [...s];
}

/** เปลี่ยนเจ้าของแถว — เจ้าของเปลี่ยน = ล้างการจับคู่สินค้า (สินค้าของใบเดิม) + ล้าง "ใช้แล้ว" */
export function setRowOwner(l: DeliveryBillLine, choice: RowChoice, homeVoucherId: string): DeliveryBillLine {
  const before = rowOwner(l, homeVoucherId);
  const next: DeliveryBillLine = { ...l };
  if (choice.kind === "voucher") { next.hold = null; next.for_voucher_id = choice.voucherId === homeVoucherId ? null : choice.voucherId; }
  else { next.hold = choice.kind; next.for_voucher_id = null; }
  const after = rowOwner(next, homeVoucherId);
  if (after !== before) { next.voucher_line_ids = []; next.applied_at = null; }
  return next;
}

/** ค่าในช่อง "ของใบ" ของแถว (ไว้ใส่ select) */
export function choiceKey(l: DeliveryBillLine, homeVoucherId: string): string {
  if (l.hold === "parked") return "parked";
  if (l.hold === "not_ours") return "not_ours";
  return `v:${l.for_voucher_id || homeVoucherId}`;
}
export function parseChoiceKey(k: string): RowChoice | null {
  if (k === "parked" || k === "not_ours") return { kind: k };
  if (k.startsWith("v:") && k.length > 2) return { kind: "voucher", voucherId: k.slice(2) };
  return null;
}

/** ยอดกล่อง/กก./คิว ของใบนี้ เทียบทั้งบิล (หัวบิลโชว์ "ใบนี้ใช้ n กล่อง") */
export function billTotalsFor(lines: DeliveryBillLine[], homeVoucherId: string, voucherId: string) {
  const sum = (ls: DeliveryBillLine[]) => ({
    boxes: ls.length,
    kg: Math.round(ls.reduce((a, l) => a + (Number(l.weight_kg) || 0), 0) * 10000) / 10000,
    m3: Math.round(ls.reduce((a, l) => a + (Number(l.m3) || 0), 0) * 10000) / 10000,
  });
  const mine = lines.filter((l) => rowOwner(l, homeVoucherId) === voucherId);
  return { all: sum(lines), mine: sum(mine), isAllMine: mine.length === lines.length };
}

/**
 * สถานะ "ใช้แล้ว" ของบิลสำหรับใบนี้ — แถวของใบนี้ใช้ครบแล้ว
 *   ใบเก่า (ก่อนมีต่อแถว): บิล status=applied → ถือว่าใบเจ้าของบิลใช้ครบแล้ว
 */
export function appliedFor(bill: { voucher_id: string; status?: string | null; lines: DeliveryBillLine[] }, voucherId: string): { mine: number; applied: number; done: boolean } {
  const idx = rowsOf(bill.lines ?? [], bill.voucher_id, voucherId);
  const legacy = bill.status === "applied" && voucherId === bill.voucher_id && !(bill.lines ?? []).some((l) => l.applied_at);
  const applied = legacy ? idx.length : idx.filter((i) => !!bill.lines[i].applied_at).length;
  return { mine: idx.length, applied, done: idx.length > 0 && applied === idx.length };
}

/** บิลทั้งใบใช้ครบแล้วไหม (ทุกแถวที่มีเจ้าของ ใช้แล้ว) → purchase_delivery_bills.status */
export function billStatusAfter(lines: DeliveryBillLine[], homeVoucherId: string): "applied" | "parsed" {
  const owned = lines.filter((l) => rowOwner(l, homeVoucherId) !== null);
  return owned.length > 0 && owned.every((l) => !!l.applied_at) ? "applied" : "parsed";
}

/** ค่าในแผงที่ต้องเทียบว่า "แก้แล้วยังไม่บันทึก" (ลบแถว · แก้ตัวเลข · จับคู่ · ลาก · เปลี่ยนเจ้าของแถว · รหัส/วันที่) */
export function billFingerprint(d: { tracking_no?: string | null; bill_date?: string | null; lines: DeliveryBillLine[] }): string {
  const ln = (d.lines ?? []).map((l) => [
    l.no ?? null, l.stock ?? null, l.po_no ?? null, l.description ?? null, l.pack ?? null, l.package ?? null, l.qty ?? null, l.weight_kg ?? null, l.m3 ?? null,
    l.method ?? null, [...(l.voucher_line_ids ?? [])].sort(), l.for_voucher_id ?? null, l.hold ?? null,
  ]);
  return JSON.stringify([String(d.tracking_no ?? "").trim().toUpperCase(), String(d.bill_date ?? "").slice(0, 10), ln]);
}
export const billDirty = (draft: Parameters<typeof billFingerprint>[0], loaded: Parameters<typeof billFingerprint>[0]) => billFingerprint(draft) !== billFingerprint(loaded);

/**
 * รวมใบ: แถวที่ชี้ใบที่ถูกรวม (for_voucher_id ∈ from) → ชี้ใบหลักแทน · คืนตำแหน่งที่เปลี่ยน (จดไว้ให้ "แยกใบกลับ")
 *   แถวที่จะกลายเป็นของเจ้าของบิลเอง → ล้าง for_voucher_id (ว่าง = เจ้าของบิล)
 */
export function retargetRows(lines: DeliveryBillLine[], homeVoucherId: string, from: string[], to: string): { lines: DeliveryBillLine[]; changed: { idx: number; from: string }[] } {
  const changed: { idx: number; from: string }[] = [];
  const next = lines.map((l, idx) => {
    if (!l.for_voucher_id || !from.includes(l.for_voucher_id)) return l;
    changed.push({ idx, from: l.for_voucher_id });
    return { ...l, for_voucher_id: to === homeVoucherId ? null : to };
  });
  return { lines: next, changed };
}

/** แยกใบกลับ: คืนแถวที่จดไว้ (ยังเป็นของใบหลักอยู่) กลับไปชี้ใบเดิม */
export function restoreRowTargets(lines: DeliveryBillLine[], homeVoucherId: string, target: string, changed: { idx: number; from: string }[]): { lines: DeliveryBillLine[]; restored: number } {
  let restored = 0;
  const next = lines.map((l) => ({ ...l }));
  for (const c of changed) {
    const l = next[c.idx];
    if (!l || rowOwner(l, homeVoucherId) !== target) continue;
    next[c.idx] = { ...l, for_voucher_id: c.from === homeVoucherId ? null : c.from };
    restored++;
  }
  return { lines: next, restored };
}

/**
 * จับแถวของสำเนาซ้ำ ↔ แถวของบิลหลัก (ข้อเสนอ 1 · ใช้ร่วม) — ใช้เลขบรรทัดบนกระดาษก่อน ไม่มีก็ใช้ลำดับ + Description
 *   ไว้ยกการจับคู่สินค้าจากสำเนาที่จะถูกเอาออก มาใส่แถวที่รับเข้าใบ
 */
export function matchCopyRow(copyLines: DeliveryBillLine[], target: DeliveryBillLine, targetIdx: number): DeliveryBillLine | null {
  const desc = (x: DeliveryBillLine) => String(x.description ?? "").trim().toUpperCase();
  if (target.no != null) { const byNo = copyLines.find((c) => c.no === target.no && desc(c) === desc(target)); if (byNo) return byNo; }
  const same = copyLines[targetIdx];
  if (same && desc(same) === desc(target)) return same;
  return copyLines.find((c) => desc(c) === desc(target) && c.qty === target.qty) ?? null;
}

/**
 * ★ 2026-11-27 กล่องเดียวกันไหม (ข้ามสำเนาใบส่งของเลขเดียวกัน) — P/o.No ของขนส่งไม่ซ้ำต่อกล่อง → ใช้ก่อน · ไม่มีใช้ Stock · ไม่มีใช้เลขบรรทัด + Description
 *   ใช้: ป๊อปใช้ร่วม (กล่องที่ใบเดิมไม่มี = เพิ่มเข้าไป) · แถบอัปโหลดซ้ำ (ไม่ทับกัน = ไม่เตือน · ใช้ค่าส่งทั้ง 2 ใบ = แถบแดง)
 */
export function boxKey(l: { po_no?: unknown; stock?: unknown; no?: unknown; description?: unknown }): string {
  const n = (x: unknown) => String(x ?? "").replace(/\s+/g, "").toUpperCase();
  if (n(l.po_no)) return "po:" + n(l.po_no);
  if (n(l.stock)) return "st:" + n(l.stock);
  return `no:${l.no ?? ""}|${n(l.description)}`;
}

/**
 * ★ 2026-11-27 สำเนาใบส่งของเลขเดียวกันหลายใบ: กล่องของใบนี้ซ้ำกับกล่องที่ใบอื่นถือไหม
 *   overlap = กล่องของใบนี้ที่ใบอื่นก็มี (ยังมีเจ้าของ) → ควรใช้ร่วม/เลือกให้เหลือใบเดียว
 *   doubleCharged = กล่องที่ทั้งใบนี้และใบอื่นใช้น้ำหนัก/คิวแล้ว → ค่าส่งถูกคิดซ้ำ (แถบแดง)
 *   ไม่ทับกันเลย = ทีมแยกกล่องกันถูกแล้ว ไม่ต้องเตือน
 */
export function dupBoxStatus(mine: { key: string; applied: boolean }[], others: { key: string; owner: string | null; applied: boolean; pv: string | null }[]):
  { overlap: string[]; doubleCharged: { key: string; pv: string | null }[] } {
  const owned = others.filter((o) => o.owner);
  const overlap = mine.filter((m) => owned.some((o) => o.key === m.key)).map((m) => m.key);
  const doubleCharged: { key: string; pv: string | null }[] = [];
  for (const m of mine) { if (!m.applied) continue; const o = owned.find((x) => x.key === m.key && x.applied); if (o) doubleCharged.push({ key: m.key, pv: o.pv }); }
  return { overlap: [...new Set(overlap)], doubleCharged };
}
