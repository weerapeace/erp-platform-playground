/**
 * 💼 ราคากลางค่าใช้จ่ายเพิ่ม + ค่าโสหุ้ยแบบแยกรายการ (แท็บตีราคา ใบงานออกแบบ) — ส่วนคิดเลข ใช้ร่วม API + หน้าจอ
 * เจ้าของขอ 2026-11-07: ค่าแรงตัด/โสหุ้ยมีราคากลาง กดใส่ได้ · โสหุ้ยแยกรายการ (QC/แพ็ก/ถุง/กล่อง/ค่าส่ง)
 *   ถุง/กล่อง/ค่าส่ง คิดจาก "ขนาดสินค้าตอนแพ็ก" (แยกตามแท็บไซส์) · ต้นทุนอื่นๆ เลือกจากรายการกลาง
 *
 *   ตาราง: design_cost_presets (supabase/migrations/202611220100) · API /api/design-sheets/cost-presets
 *   ค่าที่ใส่ในใบ = design_sheets.cost_extra (ใบที่ใส่แล้วไม่เปลี่ยนตามราคากลาง)
 *   การตั้งค่าโสหุ้ยของแต่ละแท็บ (ขนาดสินค้า / ปิดรายการไหน / ค่าส่งแบบไหน) เก็บใน extra รายการโสหุ้ย ช่อง `oh`
 * คู่มือ: docs/design-cost-presets.md
 */

export type PresetKind = "labor_cut" | "oh_fixed" | "bag" | "box" | "carton" | "parcel" | "other";
export const PRESET_KINDS: PresetKind[] = ["labor_cut", "oh_fixed", "bag", "box", "carton", "parcel", "other"];

export type CostPreset = {
  id: string;
  kind: PresetKind;
  label: string | null;
  amount: number;
  w_cm: number | null;
  l_cm: number | null;
  h_cm: number | null;
  max_kg: number | null;
  mode: "piece" | "split" | null;
  sort_order: number;
};

/** ชื่อหมวด + ช่องที่ต้องกรอก (หน้าตั้งค่าราคากลาง) */
export const PRESET_KIND_META: Record<PresetKind, { label: string; hint: string; dims: 0 | 2 | 3; weight?: boolean; needLabel?: boolean; amountLabel: string }> = {
  labor_cut: { label: "ค่าแรง (ตัด/ปลอก/วาด)", hint: "ราคากลางต่อชิ้น — ปุ่ม “ใส่ราคากลาง” ใช้ตัวแรก", dims: 0, amountLabel: "฿ / ชิ้น" },
  oh_fixed: { label: "โสหุ้ยต่อชิ้น", hint: "เช่น ค่า QC · ค่าแรงแพ็ก — ใส่ให้ทุกงานอัตโนมัติ (ปิดรายแท็บได้)", dims: 0, needLabel: true, amountLabel: "฿ / ชิ้น" },
  bag: { label: "ถุง", hint: "ขนาดถุง (กว้าง × ยาว) — ระบบเลือกใบเล็กสุดที่ใส่สินค้าได้", dims: 2, amountLabel: "฿ / ใบ" },
  box: { label: "กล่อง", hint: "ขนาดกล่องด้านใน (กว้าง × ยาว × สูง) — ระบบเลือกใบเล็กสุดที่ใส่ได้", dims: 3, amountLabel: "฿ / ใบ" },
  carton: { label: "ลังส่ง", hint: "ขนาดลัง + ค่าส่งต่อลัง — ค่าส่งต่อชิ้น = ค่าส่งต่อลัง ÷ ใส่ได้กี่ชิ้น (ใช้ลังแรก)", dims: 3, amountLabel: "฿ / ลัง" },
  parcel: { label: "ขนส่งรายชิ้น", hint: "ราคาตามน้ำหนัก (ไม่เกิน กก.) — คิดน้ำหนักที่หนักกว่า: จริง หรือ กว้าง×ยาว×หนา÷5000", dims: 0, weight: true, amountLabel: "฿ / ชิ้น" },
  other: { label: "ต้นทุนอื่นๆ", hint: "รายการที่เลือกใส่ได้ เช่น ค่าบล็อกสกรีน (หารจำนวนสั่ง) · ค่าปัก", dims: 0, needLabel: true, amountLabel: "฿" },
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pos = (v: unknown): number | null => { const n = num(v); return n != null && n > 0 ? n : null; };
const r2 = (v: number) => Math.round(v * 100) / 100;

/** แถวจาก DB/ฟอร์ม → ค่าที่ปลอดภัย (ใช้ทั้งตอนอ่านและก่อนบันทึก) · ช่องที่ไม่ใช้กับหมวดนั้น = null */
export function cleanPreset(raw: unknown): Omit<CostPreset, "id"> & { id?: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = (PRESET_KINDS as string[]).includes(String(r.kind)) ? (r.kind as PresetKind) : "other";
  const m = PRESET_KIND_META[kind];
  const label = String(r.label ?? "").trim().slice(0, 120) || null;
  return {
    ...(r.id ? { id: String(r.id) } : {}),
    kind,
    label,
    amount: Math.max(0, r2(num(r.amount) ?? 0)),
    w_cm: m.dims >= 2 ? pos(r.w_cm) : null,
    l_cm: m.dims >= 2 ? pos(r.l_cm) : null,
    h_cm: m.dims >= 3 ? pos(r.h_cm) : null,
    max_kg: m.weight ? pos(r.max_kg) : null,
    mode: kind === "other" ? (r.mode === "split" ? "split" : "piece") : null,
    sort_order: Math.round(num(r.sort_order) ?? 0),
  };
}

/** ข้อความผิดพลาดของแถว (ว่าง = บันทึกได้) */
export function presetProblem(p: Omit<CostPreset, "id">): string | null {
  const m = PRESET_KIND_META[p.kind];
  if (m.needLabel && !p.label) return "ใส่ชื่อรายการก่อน";
  if (m.dims >= 2 && (!p.w_cm || !p.l_cm)) return "ใส่ขนาดกว้าง × ยาว ก่อน";
  if (m.dims >= 3 && !p.h_cm) return "ใส่ความสูงก่อน";
  if (m.weight && !p.max_kg) return "ใส่น้ำหนักไม่เกิน (กก.) ก่อน";
  return null;
}

// ── ขนาดสินค้าตอนแพ็ก + การตั้งค่าโสหุ้ยของแท็บ ──

/** ขนาดสินค้าตอนแพ็กแล้ว (ซม. / กรัม) */
export type PackDims = { w: number | null; l: number | null; t: number | null; g: number | null };
/** การตั้งค่าโสหุ้ยของ 1 แท็บ — off = คีย์รายการที่ปิด (fx:<id> / bag / box / ship) · ship = วิธีคิดค่าส่ง */
export type OverheadCfg = { dims: PackDims; off: string[]; ship: "carton" | "parcel" | "none" };

export const EMPTY_DIMS: PackDims = { w: null, l: null, t: null, g: null };
export const DEFAULT_OH: OverheadCfg = { dims: EMPTY_DIMS, off: ["box"], ship: "carton" };   // กล่อง: ปิดไว้ก่อน (งานส่วนใหญ่ไม่มีกล่อง)

export function cleanOverheadCfg(raw: unknown): OverheadCfg | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const d = (r.dims ?? {}) as Record<string, unknown>;
  const ship = r.ship === "parcel" || r.ship === "none" ? r.ship : "carton";
  return {
    dims: { w: pos(d.w), l: pos(d.l), t: pos(d.t), g: pos(d.g) },
    off: Array.isArray(r.off) ? [...new Set(r.off.map(String).filter((s) => s && s.length <= 60))].slice(0, 40) : [],
    ship,
  };
}

/** ระยะเผื่อขอบถุง (ซม.) */
export const BAG_MARGIN_CM = 2;
/** ตัวหารน้ำหนักคิดจากขนาด (ขนส่งส่วนใหญ่ใช้ 5000) */
export const VOLUMETRIC_DIVISOR = 5000;

const hasWL = (d: PackDims) => (d.w ?? 0) > 0 && (d.l ?? 0) > 0;

/** ถุงใบเล็กที่สุดที่ใส่ได้: กว้างถุง ≥ กว้าง+หนา+เผื่อ และ ยาวถุง ≥ ยาว+หนา+เผื่อ (หมุนถุงได้) */
export function pickBag(d: PackDims, bags: CostPreset[]): { bag: CostPreset | null; needW: number; needL: number } | null {
  if (!hasWL(d)) return null;
  const t = d.t ?? 0;
  const needW = r2((d.w ?? 0) + t + BAG_MARGIN_CM), needL = r2((d.l ?? 0) + t + BAG_MARGIN_CM);
  let best: CostPreset | null = null;
  for (const b of bags) {
    const bw = b.w_cm ?? 0, bl = b.l_cm ?? 0;
    const fit = (bw >= needW && bl >= needL) || (bw >= needL && bl >= needW);
    if (fit && (!best || bw * bl < (best.w_cm ?? 0) * (best.l_cm ?? 0))) best = b;
  }
  return { bag: best, needW, needL };
}

/** กล่องใบเล็กที่สุดที่ใส่ได้ (วางทิศไหนก็ได้) */
export function pickBox(d: PackDims, boxes: CostPreset[]): CostPreset | null {
  if (!hasWL(d)) return null;
  const p = [d.w ?? 0, d.l ?? 0, d.t ?? 0.5].sort((a, b) => a - b);
  let best: CostPreset | null = null;
  for (const b of boxes) {
    const e = [b.w_cm ?? 0, b.l_cm ?? 0, b.h_cm ?? 0].sort((a, b2) => a - b2);
    if (e[0] >= p[0] && e[1] >= p[1] && e[2] >= p[2]) {
      const vol = e[0] * e[1] * e[2];
      if (!best || vol < (best.w_cm ?? 0) * (best.l_cm ?? 0) * (best.h_cm ?? 0)) best = b;
    }
  }
  return best;
}

/** ใส่ลังได้กี่ชิ้น — ลองวางทั้ง 6 ทิศ เอาทิศที่ได้มากสุด (วางเรียงเป็นตาราง ไม่ซ้อนเหลื่อม) */
export function piecesPerCarton(d: PackDims, c: Pick<CostPreset, "w_cm" | "l_cm" | "h_cm">): number {
  if (!hasWL(d)) return 0;
  const a = d.w ?? 0, b = d.l ?? 0, t = d.t ?? 0.5;
  const C = [c.w_cm ?? 0, c.l_cm ?? 0, c.h_cm ?? 0];
  const P = [[a, b, t], [a, t, b], [b, a, t], [b, t, a], [t, a, b], [t, b, a]];
  let best = 0;
  for (const p of P) best = Math.max(best, Math.floor(C[0] / p[0]) * Math.floor(C[1] / p[1]) * Math.floor(C[2] / p[2]));
  return best;
}

/** ขนส่งรายชิ้น: น้ำหนักที่คิด = มากกว่าระหว่าง จริง กับ ขนาด÷5000 → ขั้นราคาแรกที่ไม่เกิน */
export function parcelPrice(d: PackDims, tiers: CostPreset[]): { chargeKg: number; volKg: number; actKg: number; tier: CostPreset | null } | null {
  const volKg = hasWL(d) ? ((d.w ?? 0) * (d.l ?? 0) * (d.t ?? 0.5)) / VOLUMETRIC_DIVISOR : 0;
  const actKg = (d.g ?? 0) / 1000;
  if (!(volKg > 0) && !(actKg > 0)) return null;
  const chargeKg = Math.max(volKg, actKg);
  const sorted = [...tiers].filter((x) => (x.max_kg ?? 0) > 0).sort((x, y) => (x.max_kg ?? 0) - (y.max_kg ?? 0));
  const tier = sorted.find((x) => chargeKg <= (x.max_kg ?? 0)) ?? null;
  return { chargeKg: Math.round(chargeKg * 1000) / 1000, volKg: Math.round(volKg * 1000) / 1000, actKg, tier };
}

export type OverheadRow = { key: string; label: string; detail: string; amount: number; on: boolean; warn?: boolean };

const fmt = (n: number) => r2(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** รายการโสหุ้ยของแท็บ (ตามราคากลางปัจจุบัน) — ยอดโสหุ้ย = รวมเฉพาะรายการที่เปิด */
export function overheadRows(cfg: OverheadCfg, presets: CostPreset[]): OverheadRow[] {
  const by = (k: PresetKind) => presets.filter((p) => p.kind === k).sort((a, b) => a.sort_order - b.sort_order);
  const off = new Set(cfg.off);
  const d = cfg.dims;
  const rows: OverheadRow[] = by("oh_fixed").map((p) => ({ key: `fx:${p.id}`, label: p.label || "โสหุ้ย", detail: "ราคากลางต่อชิ้น", amount: p.amount, on: !off.has(`fx:${p.id}`) }));

  const bags = by("bag");
  if (bags.length) {
    const r = pickBag(d, bags);
    rows.push(!r ? { key: "bag", label: "ถุง", detail: "ใส่ขนาดสินค้าก่อน", amount: 0, on: !off.has("bag"), warn: true }
      : r.bag ? { key: "bag", label: "ถุง", detail: `ใช้ถุง ${fmt(r.bag.w_cm ?? 0)}×${fmt(r.bag.l_cm ?? 0)} ซม. · ต้องการอย่างน้อย ${fmt(r.needW)}×${fmt(r.needL)}`, amount: r.bag.amount, on: !off.has("bag") }
      : { key: "bag", label: "ถุง", detail: `ไม่มีถุงที่ใส่ได้ (ต้องการ ${fmt(r.needW)}×${fmt(r.needL)} ซม.) — เพิ่มขนาดถุงในราคากลาง`, amount: 0, on: !off.has("bag"), warn: true });
  }
  const boxes = by("box");
  if (boxes.length) {
    const b = hasWL(d) ? pickBox(d, boxes) : null;
    rows.push(!hasWL(d) ? { key: "box", label: "กล่อง", detail: "ใส่ขนาดสินค้าก่อน", amount: 0, on: !off.has("box"), warn: true }
      : b ? { key: "box", label: "กล่อง", detail: `กล่อง ${fmt(b.w_cm ?? 0)}×${fmt(b.l_cm ?? 0)}×${fmt(b.h_cm ?? 0)} ซม.`, amount: b.amount, on: !off.has("box") }
      : { key: "box", label: "กล่อง", detail: "ไม่มีกล่องที่ใส่ได้ — เพิ่มขนาดกล่องในราคากลาง", amount: 0, on: !off.has("box"), warn: true });
  }
  if (cfg.ship === "carton") {
    const c = by("carton")[0];
    if (c) {
      const n = piecesPerCarton(d, c);
      rows.push(!hasWL(d) ? { key: "ship", label: "ค่าส่ง (ลัง)", detail: "ใส่ขนาดสินค้าก่อน", amount: 0, on: !off.has("ship"), warn: true }
        : n > 0 ? { key: "ship", label: "ค่าส่ง (ลัง)", detail: `ลัง ${fmt(c.w_cm ?? 0)}×${fmt(c.l_cm ?? 0)}×${fmt(c.h_cm ?? 0)} ใส่ได้ ${n} ชิ้น · ${fmt(c.amount)} ÷ ${n}`, amount: r2(c.amount / n), on: !off.has("ship") }
        : { key: "ship", label: "ค่าส่ง (ลัง)", detail: "สินค้าใหญ่กว่าลัง — แก้ขนาดลังในราคากลาง", amount: 0, on: !off.has("ship"), warn: true });
    }
  } else if (cfg.ship === "parcel") {
    const tiers = by("parcel");
    if (tiers.length) {
      const p = parcelPrice(d, tiers);
      rows.push(!p ? { key: "ship", label: "ค่าส่ง (รายชิ้น)", detail: "ใส่ขนาดหรือน้ำหนักสินค้าก่อน", amount: 0, on: !off.has("ship"), warn: true }
        : p.tier ? { key: "ship", label: "ค่าส่ง (รายชิ้น)", detail: `คิดที่ ${fmt(p.chargeKg)} กก. (จากขนาด ${fmt(p.volKg)} · จริง ${fmt(p.actKg)})`, amount: p.tier.amount, on: !off.has("ship") }
        : { key: "ship", label: "ค่าส่ง (รายชิ้น)", detail: `หนัก ${fmt(p.chargeKg)} กก. เกินขั้นราคาที่ตั้งไว้`, amount: 0, on: !off.has("ship"), warn: true });
    }
  }
  return rows;
}

export const overheadTotal = (rows: OverheadRow[]) => r2(rows.reduce((s, r) => s + (r.on ? r.amount : 0), 0));

// ── ค่าแรงที่เคยผลิต (ตัวเลือกอ้างอิง ค่าแรงผลิต) ──
export type LaborRef = { source: "bom" | "wo" | "ds"; code: string; name: string; amount: number; note?: string | null; at?: string | null };

/** รหัสรุ่น (Parent) จากรหัส SKU/BOM — BOM-CTL044-01 → CTL044 · CTL044-01 → CTL044 */
export const parentOfCode = (code: string): string => code.replace(/^BOM-/i, "").replace(/-\d+$/, "");
