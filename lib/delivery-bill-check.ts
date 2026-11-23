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

/**
 * ★ 2026-11-23 จับคู่กล่อง ↔ สินค้าให้เองเมื่อชัด (เจ้าของเลือกแบบ A: "ทำไมต้องจับคู่ ทั้งที่เลือกสินค้าจากบิลข้างบนแล้ว")
 *   - ใบนี้มีกล่องเดียว (และยังว่าง) → ทุกสินค้าในใบอยู่กล่องนั้น
 *   - หลายกล่อง → เดาจากจำนวน (suggestBoxMatches) · เหลือกล่องว่างกล่องเดียว + สินค้าที่ยังไม่อยู่กล่องไหน → ใส่กล่องนั้นทั้งหมด
 *   bills = เฉพาะกล่องของใบนี้ (ดัชนีตามที่ส่งมา) · คืน all=true เมื่อเป็น "ทุกสินค้าในใบ"
 *   complete = ทุกกล่องมีสินค้าแล้วหลังจับคู่ (ใช้ตัดสิน "ใช้น้ำหนัก/คิวให้เลย" หลังอ่านใบส่งของ)
 */
export function autoMatchBoxes(lines: CheckLine[], bills: CheckBill[]): { matches: { bill_id: string; idx: number; line_ids: string[]; all: boolean }[]; complete: boolean } {
  const prods = lines.filter((l) => l.is_product);
  const pool = prods.length ? prods : lines;
  const ids = new Set(pool.map((l) => l.id));
  const boxes: { bill_id: string; idx: number; qty: number | null; mapped: string[] }[] = [];
  for (const b of bills) b.lines.forEach((x, idx) => boxes.push({ bill_id: b.id, idx, qty: x.qty, mapped: (x.voucher_line_ids ?? []).filter((id) => ids.has(id)) }));
  const empty = boxes.filter((x) => x.mapped.length === 0);
  if (pool.length === 0 || empty.length === 0) return { matches: [], complete: empty.length === 0 && boxes.length > 0 };
  if (boxes.length === 1) return { matches: [{ bill_id: empty[0].bill_id, idx: empty[0].idx, line_ids: pool.map((l) => l.id), all: true }], complete: true };
  const matches: { bill_id: string; idx: number; line_ids: string[]; all: boolean }[] = [];
  const used = new Set(boxes.flatMap((x) => x.mapped));
  for (const sgt of suggestBoxMatches(pool.map((l) => ({ ...l, is_product: true })), bills)) {
    matches.push({ bill_id: sgt.bill_id, idx: sgt.idx, line_ids: [sgt.line_id], all: false });
    used.add(sgt.line_id);
  }
  const left = empty.filter((x) => !matches.some((m) => m.bill_id === x.bill_id && m.idx === x.idx));
  const free = pool.filter((l) => !used.has(l.id));
  if (left.length === 1 && free.length > 0) matches.push({ bill_id: left[0].bill_id, idx: left[0].idx, line_ids: free.map((l) => l.id), all: free.length === pool.length });
  const stillEmpty = empty.length - matches.length;
  return { matches, complete: stillEmpty === 0 };
}

/**
 * ★ 2026-11-23 เช็กกลับ: น้ำหนัก/คิวรวมของสินค้าในใบ (จำนวน × ต่อชิ้น) เทียบกล่องที่จับคู่ — ต่างเกิน 1.5 เท่า = ผิดปกติ
 *   จับเคส "ใส่ 60 แต่ระบบหารด้วย 1" (ค่าส่งเพี้ยน ฿8,400) · เทียบเฉพาะบิลที่ใช้น้ำหนัก/คิวแล้ว
 */
export function boxWeightCheck(boxes: { weight_kg: number | null; m3: number | null; voucher_line_ids: string[] }[], lines: { id: string; qty: number; kg_per_unit: number | null; cbm_per_unit: number | null }[]):
  { ok: boolean; box_kg: number; line_kg: number; box_m3: number; line_m3: number } {
  const ids = new Set<string>();
  let box_kg = 0, box_m3 = 0;
  for (const b of boxes) { if (!(b.voucher_line_ids ?? []).length) continue; b.voucher_line_ids.forEach((id) => ids.add(id)); box_kg += Number(b.weight_kg) || 0; box_m3 += Number(b.m3) || 0; }
  let line_kg = 0, line_m3 = 0;
  for (const l of lines) if (ids.has(l.id)) { line_kg += (Number(l.qty) || 0) * (Number(l.kg_per_unit) || 0); line_m3 += (Number(l.qty) || 0) * (Number(l.cbm_per_unit) || 0); }
  const off = (box: number, line: number) => box > 0 && line > 0 && (line > box * 1.5 || line < box / 1.5);
  const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
  return { ok: !(off(box_kg, line_kg) || off(box_m3, line_m3)), box_kg: r(box_kg, 4), line_kg: r(line_kg, 4), box_m3: r(box_m3, 6), line_m3: r(line_m3, 6) };
}
