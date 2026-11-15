/**
 * ใบส่งของจากขนส่ง (Delivery Bill) — ตัวช่วยแบบ pure (ใช้ได้ทั้งหน้าเว็บและเซิร์ฟเวอร์ · ไม่แตะฐานข้อมูล)
 *   methodForDescription / ruleForDescription: กฎ "คำใน Description → คิดค่าส่งจากคิว/กก." (/m/freight-description-rules)
 *   deliveryQtyCheck: รวมจำนวนชิ้นจากใบส่งของทุกใบในใบสำคัญ เทียบกับจำนวนในใบ → ครบ / ขาด / เกิน / ยังไม่มา / อ่านจำนวนไม่ได้
 *   suggestBoxMatches: เดาว่ากล่องไหนเป็นสินค้าอะไร (ใบมีสินค้าตัวเดียว · จำนวนในกล่องตรงกับสินค้าตัวเดียว)
 * ★ 2026-11-15 เจ้าของ: "บางสินค้ามา 2 รอบ อยากให้เช็คจำนวนด้วยว่าตรงไหม (ขาดเท่าไหร่)" — รอบนี้ดูอย่างเดียว ไม่แตะ PO/สต๊อก
 * ใช้ที่: components/delivery-bill-panel (กล่อง "เช็กจำนวน") · lib/delivery-bill (อ่านใบส่งของ) · /api/purchasing/freight-descriptions
 * ทดสอบ: lib/__tests__/delivery-bill-check.test.ts
 */

export type ShipMethod = "cube" | "weight";
export type DescRule = { keyword: string; method: ShipMethod };

/** Description แบบเทียบได้ — ตัวใหญ่ · ช่องว่างเดียว (เช่น " metal  accy " → "METAL ACCY") */
export const normDesc = (d: string | null | undefined) => String(d ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/**
 * กฎที่ใช้กับ Description นี้ — ตรงทั้งคำก่อน (กฎที่จำจากใบส่งของ เช่น "METAL ACCY") แล้วค่อยกฎแรกที่ "มีคำนี้อยู่" ตามลำดับ (เช่น "BOX")
 * ไม่เข้ากฎไหน = null
 */
export function ruleForDescription(desc: string | null | undefined, rules: DescRule[]): DescRule | null {
  const d = normDesc(desc); if (!d) return null;
  return rules.find((r) => normDesc(r.keyword) === d)
    ?? rules.find((r) => { const k = normDesc(r.keyword); return !!k && d.includes(k); }) ?? null;
}
export function methodForDescription(desc: string | null | undefined, rules: DescRule[]): ShipMethod | null {
  return ruleForDescription(desc, rules)?.method ?? null;
}

// ---------------- เช็กจำนวน: ใบส่งของ vs ในใบ ----------------
export type CheckLine = { id: string; label: string; qty: number; is_product: boolean };
export type CheckBox = { qty: number | null; voucher_line_ids: string[] };
export type CheckBill = { id: string; tracking_no: string | null; lines: CheckBox[] };
export type QtyStatus = "ok" | "short" | "over" | "none" | "unknown";
export type QtyRow = {
  /** สินค้าในแถวนี้ — 1 ตัว = ปกติ · หลายตัว = มีกล่องที่ใส่สินค้าปนกัน (เช็กได้แค่ยอดรวมของกลุ่ม) */
  ids: string[];
  labels: string[];
  expected: number;                    // จำนวนในใบสำคัญ (รวมทุกตัวในกลุ่ม)
  byBill: Record<string, number>;      // จำนวนจากใบส่งของแต่ละใบ (bill id → ชิ้น)
  got: number;                         // รวมทุกใบ
  diff: number;                        // got − expected (บวก = เกิน · ลบ = ขาด)
  status: QtyStatus;
};
export type QtyCheck = {
  rows: QtyRow[];
  /** กล่องที่ยังไม่รู้ว่าเป็นสินค้าอะไร (ต่อใบ) */
  unmatched: { bill_id: string; boxes: number; qty: number }[];
  matchedBoxes: number;
  totalBoxes: number;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** รวมจำนวนจากใบส่งของทุกใบ (หลายรอบ) ต่อสินค้า แล้วเทียบกับจำนวนในใบ — ไม่มีกล่องไหนจับคู่ = "ยังไม่มา" */
export function deliveryQtyCheck(lines: CheckLine[], bills: CheckBill[]): QtyCheck {
  const products = lines.filter((l) => l.is_product);
  const idSet = new Set(products.map((l) => l.id));
  // กลุ่มสินค้าที่อยู่กล่องเดียวกัน (union-find) — กล่องปนหลายสินค้า = นับรวมเป็นกลุ่มเดียว
  const parent = new Map(products.map((l) => [l.id, l.id]));
  const find = (x: string): string => { let p = parent.get(x) ?? x; while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p; parent.set(x, p); return p; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const targetsOf = (b: CheckBox) => [...new Set((b.voucher_line_ids ?? []).filter((id) => idSet.has(id)))];
  for (const bill of bills) for (const box of bill.lines) { const t = targetsOf(box); for (let i = 1; i < t.length; i++) union(t[0], t[i]); }

  const rowByRoot = new Map<string, QtyRow & { boxes: number; unknownQty: boolean }>();
  for (const l of products) {
    const root = find(l.id);
    const row = rowByRoot.get(root) ?? { ids: [], labels: [], expected: 0, byBill: {}, got: 0, diff: 0, status: "none" as QtyStatus, boxes: 0, unknownQty: false };
    row.ids.push(l.id); row.labels.push(l.label); row.expected = r3(row.expected + (Number(l.qty) || 0));
    rowByRoot.set(root, row);
  }
  const unmatched: QtyCheck["unmatched"] = [];
  let matchedBoxes = 0, totalBoxes = 0;
  for (const bill of bills) {
    let nb = 0, nq = 0;
    for (const box of bill.lines) {
      totalBoxes++;
      const t = targetsOf(box);
      if (t.length === 0) { nb++; nq += Number(box.qty) || 0; continue; }
      matchedBoxes++;
      const row = rowByRoot.get(find(t[0]))!;
      row.boxes++;
      if (box.qty == null || !Number.isFinite(Number(box.qty))) { row.unknownQty = true; continue; }
      row.byBill[bill.id] = r3((row.byBill[bill.id] ?? 0) + Number(box.qty));
    }
    if (nb > 0) unmatched.push({ bill_id: bill.id, boxes: nb, qty: r3(nq) });
  }
  const rows: QtyRow[] = [...rowByRoot.values()].map(({ boxes, unknownQty, ...row }) => {
    const got = r3(Object.values(row.byBill).reduce((a, b) => a + b, 0));
    const diff = r3(got - row.expected);
    const status: QtyStatus = boxes === 0 ? "none" : unknownQty ? "unknown" : diff === 0 ? "ok" : diff < 0 ? "short" : "over";
    return { ...row, got, diff, status };
  });
  return { rows, unmatched, matchedBoxes, totalBoxes };
}

/**
 * เดาสินค้าให้กล่องที่ยังไม่ได้จับคู่ (ให้คนกดยืนยันก่อน — ไม่จับให้เงียบ ๆ)
 *   1) ใบมีสินค้าตัวเดียว → ทุกกล่องที่ยังว่างเป็นสินค้านั้น
 *   2) จำนวนในกล่องตรงกับสินค้าตัวเดียวที่ยังไม่มีกล่อง และไม่มีกล่องว่างอื่นที่จำนวนเท่ากัน → จับคู่กัน
 */
export function suggestBoxMatches(lines: CheckLine[], bills: CheckBill[]): { bill_id: string; idx: number; line_id: string }[] {
  const products = lines.filter((l) => l.is_product);
  if (products.length === 0) return [];
  const idSet = new Set(products.map((l) => l.id));
  const empty: { bill_id: string; idx: number; qty: number | null }[] = [];
  const mapped = new Set<string>();
  for (const bill of bills) bill.lines.forEach((box, idx) => {
    const t = (box.voucher_line_ids ?? []).filter((id) => idSet.has(id));
    if (t.length === 0) empty.push({ bill_id: bill.id, idx, qty: box.qty }); else t.forEach((id) => mapped.add(id));
  });
  if (empty.length === 0) return [];
  if (products.length === 1) return empty.map((e) => ({ bill_id: e.bill_id, idx: e.idx, line_id: products[0].id }));
  const free = products.filter((p) => !mapped.has(p.id));
  const out: { bill_id: string; idx: number; line_id: string }[] = [];
  for (const e of empty) {
    const q = Number(e.qty);
    if (!(q > 0)) continue;
    const hit = free.filter((p) => r3(Number(p.qty) || 0) === r3(q));
    if (hit.length !== 1) continue;
    const sameQtyBoxes = empty.filter((x) => r3(Number(x.qty) || 0) === r3(q)).length;
    if (sameQtyBoxes !== 1) continue;   // กล่องว่างจำนวนเท่ากันหลายกล่อง = เดาไม่ได้ว่ากล่องไหน
    out.push({ bill_id: e.bill_id, idx: e.idx, line_id: hit[0].id });
  }
  return out;
}
