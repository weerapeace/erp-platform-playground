/**
 * เวอร์ชันตีราคา (Design Sheet) — ฟังก์ชัน pure ใช้ร่วม API + หน้าจอ (ไม่ import React/"use client")
 *
 * - fingerprint: ลายนิ้วมือเนื้อหา (บรรทัด + ค่าใช้จ่ายเพิ่ม) ไว้กันเก็บ snapshot ซ้ำตอนกดบันทึกโดยไม่ได้แก้อะไร
 * - totals:      ยอดต่อแท็บ Parent (วัสดุ / ค่าใช้จ่ายเพิ่ม / รวม) + ยอดรวมทั้งใบ
 * - diffCostLines: จับคู่บรรทัดเวอร์ชัน A กับ B (วัสดุเดียวกัน+ชื่อเดียวกัน ตามลำดับที่พบ) → เพิ่ม/ลบ/เปลี่ยน
 */

import { cleanOverheadCfg, type OverheadCfg } from "@/lib/design-cost-presets";

export type SnapLine = {
  item_id?: string | null; item_sku_id?: string | null; item_sku_code?: string | null; group_code?: string | null;
  item_name?: string | null; group_name?: string | null; parent_code?: string | null; calc_method?: string | null;
  width_cm?: number | null; length_cm?: number | null; pieces?: number | null; face_width_cm?: number | null;
  waste_percent?: number | null; divisor?: number | null;
  qty?: number | null; uom?: string | null; unit_price?: number | null; amount?: number | null; note?: string | null;
};
/** ค่าใช้จ่ายเพิ่ม 1 รายการ — amount = "ต่อชิ้น" เสมอ (ใบพิมพ์/เวอร์ชัน/มือถือ อ่าน amount ได้เลย)
 *  mode "split" = ค่าจ่ายครั้งเดียวต่อการสั่ง เช่น ค่าบล็อกสกรีน/แม่พิมพ์ (เจ้าของขอ 2026-11-03)
 *  → total = ยอดรวม · split_qty = จำนวนที่สั่ง · amount = total ÷ split_qty (คำนวณใหม่ทุกครั้งใน cleanExtra) */
export type SnapExtra = {
  label: string; amount: number; mode?: "split"; total?: number; split_qty?: number | null;
  /** ชนิดรายการ (ใบเก่าไม่มี = ดูจากชื่อ — extraKindOf) · labor = ค่าแรงผลิต · labor_cut = ค่าแรงตัด · overhead = โสหุ้ย · other = ต้นทุนอื่นๆ */
  kind?: ExtraKind;
  /** หมายเหตุสั้น เช่น "อ้างอิง CTL044 · 70.00" (เลือกจากค่าแรงที่เคยผลิต) */
  note?: string | null;
  /** โสหุ้ยแบบแยกรายการ: ขนาดสินค้าตอนแพ็ก + รายการที่ปิด + วิธีคิดค่าส่ง (lib/design-cost-presets) */
  oh?: OverheadCfg | null;
};
export type ExtraKind = "labor" | "labor_cut" | "overhead" | "other";
export type SnapExtraMap = Record<string, SnapExtra[]>;
export type SnapTotals = Record<string, { material: number; extra: number; total: number }>;

/** ชนิดของรายการค่าใช้จ่ายเพิ่ม — มี kind ใช้ kind · ใบเก่า = ดูจากชื่อตั้งต้น 4 ตัว */
export function extraKindOf(e: Pick<SnapExtra, "label" | "kind">): ExtraKind | null {
  if (e.kind) return e.kind;
  const l = (e.label ?? "").trim();
  if (l === "ค่าแรงผลิต") return "labor";
  if (l.startsWith("ค่าแรง (ตัด")) return "labor_cut";
  if (l.startsWith("ค่าโสหุ้ย")) return "overhead";
  if (l === "ต้นทุนอื่นๆ") return "other";
  return null;
}

const n = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** ต่อชิ้นของค่าแบบหารจำนวนสั่ง (ยังไม่มีจำนวน = 0 — หน้าจอเตือนให้ใส่) */
export const splitPerUnit = (total: number, qty: number | null | undefined): number =>
  qty != null && qty > 0 ? Math.round((total / qty) * 10000) / 10000 : 0;

/** ต่อชิ้นของรายการนี้ "ถ้าสั่ง qty ชิ้น" (ไม่ส่ง qty = ใช้จำนวนที่บันทึกไว้) — ใช้คิดต้นทุนตามขั้นจำนวนตอนเสนอราคา */
export const extraAmountAt = (e: SnapExtra, qty?: number | null): number =>
  e.mode === "split" ? splitPerUnit(n(e.total) ?? 0, qty ?? e.split_qty) : (n(e.amount) ?? 0);

/** ทำความสะอาดค่าใช้จ่ายเพิ่ม 1 รายการ (ใช้ทั้ง API และหน้าจอ) — คงฟิลด์หารจำนวนสั่ง + คิด amount ใหม่ให้ตรงเสมอ */
export function cleanExtra(raw: unknown): SnapExtra {
  const c = (raw ?? {}) as Partial<SnapExtra>;
  const label = String(c.label ?? "");
  // ช่องเสริม (ชนิด / หมายเหตุ / ตั้งค่าโสหุ้ย) — ไม่มี = ไม่ใส่ (ใบเก่าหน้าตาเหมือนเดิม)
  const extra: Pick<SnapExtra, "kind" | "note" | "oh"> = {};
  if (c.kind === "labor" || c.kind === "labor_cut" || c.kind === "overhead" || c.kind === "other") extra.kind = c.kind;
  const note = typeof c.note === "string" ? c.note.trim().slice(0, 200) : "";
  if (note) extra.note = note;
  const oh = c.oh ? cleanOverheadCfg(c.oh) : null;
  if (oh) extra.oh = oh;
  if (c.mode === "split") {
    const total = n(c.total) ?? 0;
    const q = n(c.split_qty);
    const split_qty = q != null && q > 0 ? q : null;
    return { label, amount: splitPerUnit(total, split_qty), mode: "split", total, split_qty, ...extra };
  }
  return { label, amount: n(c.amount) ?? 0, ...extra };
}

/** ตัดฟิลด์ที่ไม่ใช่ "เนื้อหา" ออก (id/key/prev_item/price_ack/sort_order) ให้เทียบกันได้ตรง ๆ */
export function normalizeSnapLine(l: SnapLine): SnapLine {
  return {
    item_id: l.item_id ?? null, item_sku_id: l.item_sku_id ?? null, item_sku_code: l.item_sku_code ?? null, group_code: l.group_code ?? null,
    item_name: l.item_name ?? null, group_name: l.group_name ?? null, parent_code: l.parent_code ?? null, calc_method: l.calc_method ?? null,
    width_cm: n(l.width_cm), length_cm: n(l.length_cm), pieces: n(l.pieces), face_width_cm: n(l.face_width_cm),
    waste_percent: n(l.waste_percent), divisor: n(l.divisor),
    qty: n(l.qty), uom: l.uom ?? null, unit_price: n(l.unit_price), amount: n(l.amount), note: l.note ?? null,
  };
}

export function normalizeExtraMap(m: SnapExtraMap | null | undefined): SnapExtraMap {
  const out: SnapExtraMap = {};
  for (const [k, arr] of Object.entries(m ?? {})) {
    if (!Array.isArray(arr)) continue;
    out[k] = arr.map((e) => ({ label: String(e?.label ?? ""), amount: n(e?.amount) ?? 0 }));
  }
  return out;
}

/** ลายนิ้วมือเนื้อหา — string เดียวกัน = เนื้อหาเดียวกัน (ไม่ใช้ hash lib เพื่อให้รันได้ทั้ง edge/node/browser) */
export function costFingerprint(lines: SnapLine[], extra: SnapExtraMap | null | undefined): string {
  const body = JSON.stringify({ l: lines.map(normalizeSnapLine), e: normalizeExtraMap(extra) });
  // djb2 สองรอบ (ต่างเมล็ด) พอสำหรับกันซ้ำ — ชนกันยากมากในขนาดข้อมูลระดับนี้
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < body.length; i++) { const c = body.charCodeAt(i); h1 = ((h1 * 33) ^ c) >>> 0; h2 = ((h2 * 31) ^ c) >>> 0; }
  return `${h1.toString(16)}${h2.toString(16)}:${body.length}`;
}

export function costTotals(lines: SnapLine[], extra: SnapExtraMap | null | undefined): { totals: SnapTotals; grand_total: number } {
  const totals: SnapTotals = {};
  const ex = normalizeExtraMap(extra);
  const keys = new Set<string>([...lines.map((l) => l.parent_code ?? ""), ...Object.keys(ex)]);
  let grand = 0;
  for (const k of keys) {
    const material = r2(lines.filter((l) => (l.parent_code ?? "") === k).reduce((s, l) => s + (n(l.amount) ?? 0), 0));
    const extraSum = r2((ex[k] ?? []).reduce((s, e) => s + (e.amount || 0), 0));
    totals[k] = { material, extra: extraSum, total: r2(material + extraSum) };
    grand += material + extraSum;
  }
  return { totals, grand_total: r2(grand) };
}

// ---------- เปรียบเทียบ 2 เวอร์ชัน ----------
export type DiffRow = {
  key: string;
  status: "same" | "changed" | "added" | "removed";
  a: SnapLine | null;   // เวอร์ชันเก่า (ซ้าย)
  b: SnapLine | null;   // เวอร์ชันใหม่ (ขวา)
  changedFields: string[];
  amountDiff: number;   // b.amount - a.amount
};
const matKey = (l: SnapLine) =>
  `${l.item_id ?? ""}|${l.item_sku_id ?? ""}|${l.group_code ?? ""}|${(l.item_name ?? "").trim()}`;
const CMP_FIELDS: (keyof SnapLine)[] = ["qty", "uom", "unit_price", "amount", "width_cm", "length_cm", "pieces", "waste_percent", "note"];

/** จับคู่บรรทัด A↔B: วัสดุเดียวกัน (id/รหัส/ชื่อ) จับตามลำดับที่พบ — คู่ไหนไม่มีฝั่งตรงข้าม = ลบ/เพิ่ม */
export function diffCostLines(aLines: SnapLine[], bLines: SnapLine[]): DiffRow[] {
  const a = aLines.map(normalizeSnapLine), b = bLines.map(normalizeSnapLine);
  const bPool = new Map<string, SnapLine[]>();
  for (const l of b) { const k = matKey(l); const arr = bPool.get(k) ?? []; arr.push(l); bPool.set(k, arr); }
  const rows: DiffRow[] = [];
  a.forEach((la, i) => {
    const k = matKey(la); const pool = bPool.get(k);
    const lb = pool?.length ? pool.shift()! : null;
    if (!lb) { rows.push({ key: `a${i}`, status: "removed", a: la, b: null, changedFields: [], amountDiff: -(la.amount ?? 0) }); return; }
    const changed = CMP_FIELDS.filter((f) => {
      const va = la[f], vb = lb[f];
      if (typeof va === "number" || typeof vb === "number") return Math.abs((n(va) ?? 0) - (n(vb) ?? 0)) > 0.0001;
      return (va ?? null) !== (vb ?? null);
    });
    rows.push({ key: `a${i}`, status: changed.length ? "changed" : "same", a: la, b: lb, changedFields: changed, amountDiff: r2((lb.amount ?? 0) - (la.amount ?? 0)) });
  });
  let j = 0;
  for (const arr of bPool.values()) for (const lb of arr) rows.push({ key: `b${j++}`, status: "added", a: null, b: lb, changedFields: [], amountDiff: lb.amount ?? 0 });
  return rows;
}

/** ความต่างของค่าใช้จ่ายเพิ่ม (จับคู่ด้วยชื่อ) */
export function diffExtras(a: SnapExtra[] | undefined, b: SnapExtra[] | undefined): { label: string; a: number | null; b: number | null; diff: number }[] {
  const ma = new Map((a ?? []).map((e) => [e.label, e.amount] as const));
  const mb = new Map((b ?? []).map((e) => [e.label, e.amount] as const));
  const labels = [...new Set([...ma.keys(), ...mb.keys()])];
  return labels.map((label) => {
    const va = ma.has(label) ? ma.get(label)! : null, vb = mb.has(label) ? mb.get(label)! : null;
    return { label, a: va, b: vb, diff: r2((vb ?? 0) - (va ?? 0)) };
  }).filter((x) => x.a || x.b);   // ตัดรายการที่ 0 ทั้งคู่
}

// ---------- สรุป "อะไรเปลี่ยน" ระหว่าง 2 เวอร์ชัน (ใช้ในตารางรอบเสนอราคา) ----------
export type CostChangeItem = { kind: "price" | "qty" | "added" | "removed" | "extra"; name: string; from: number | null; to: number | null; diff: number };
export type CostChangeSummary = { text: string; total_diff: number; items: CostChangeItem[] };
const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;

/**
 * เทียบต้นทุนของ Parent เดียว (parentKey) ระหว่างเวอร์ชันก่อน (prev) กับเวอร์ชันนี้ (cur)
 * คืนข้อความสั้นอ่านง่าย เช่น "ผ้าแม่ฟ้าหลวง 200→260 (+60) · เพิ่ม ซิป +5 · ต้นทุน +94.09" (ตัดที่ maxItems รายการ แล้วต่อด้วย "+N รายการ")
 */
export function summarizeCostChanges(
  prev: { lines: SnapLine[]; extra: SnapExtraMap }, cur: { lines: SnapLine[]; extra: SnapExtraMap }, parentKey: string, maxItems = 4,
): CostChangeSummary {
  const pl = prev.lines.filter((l) => (l.parent_code ?? "") === parentKey);
  const cl = cur.lines.filter((l) => (l.parent_code ?? "") === parentKey);
  const items: CostChangeItem[] = [];
  for (const r of diffCostLines(pl, cl)) {
    const name = (r.b ?? r.a)?.item_name ?? (r.b ?? r.a)?.group_name ?? "—";
    if (r.status === "added") items.push({ kind: "added", name, from: null, to: r.b?.amount ?? null, diff: r.amountDiff });
    else if (r.status === "removed") items.push({ kind: "removed", name, from: r.a?.amount ?? null, to: null, diff: r.amountDiff });
    else if (r.status === "changed") {
      if (r.changedFields.includes("unit_price")) items.push({ kind: "price", name, from: r.a?.unit_price ?? null, to: r.b?.unit_price ?? null, diff: r.amountDiff });
      else items.push({ kind: "qty", name, from: r.a?.qty ?? null, to: r.b?.qty ?? null, diff: r.amountDiff });
    }
  }
  for (const e of diffExtras(prev.extra[parentKey], cur.extra[parentKey])) if (Math.abs(e.diff) > 0.004) items.push({ kind: "extra", name: e.label, from: e.a, to: e.b, diff: e.diff });
  const tp = costTotals(pl, { [parentKey]: prev.extra[parentKey] ?? [] }).totals[parentKey]?.total ?? 0;
  const tc = costTotals(cl, { [parentKey]: cur.extra[parentKey] ?? [] }).totals[parentKey]?.total ?? 0;
  const total_diff = Math.round((tc - tp) * 100) / 100;
  const part = (it: CostChangeItem): string => {
    if (it.kind === "added") return `เพิ่ม ${it.name} ${signed(it.diff)}`;
    if (it.kind === "removed") return `ตัด ${it.name} ${signed(it.diff)}`;
    if (it.kind === "price") return `${it.name} ${money(it.from ?? 0)}→${money(it.to ?? 0)} (${signed(it.diff)})`;
    if (it.kind === "extra") return `${it.name} ${money(it.from ?? 0)}→${money(it.to ?? 0)}`;
    return `${it.name} จำนวน ${money(it.from ?? 0)}→${money(it.to ?? 0)} (${signed(it.diff)})`;
  };
  // เรียงตามขนาดผลกระทบ (มาก→น้อย) ให้ของสำคัญขึ้นก่อน
  const sorted = [...items].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const shown = sorted.slice(0, maxItems).map(part);
  if (sorted.length > maxItems) shown.push(`+${sorted.length - maxItems} รายการ`);
  const text = items.length ? `${shown.join(" · ")} · ต้นทุน ${signed(total_diff)}` : (Math.abs(total_diff) > 0.004 ? `ต้นทุน ${signed(total_diff)}` : "");
  return { text, total_diff, items: sorted };
}
