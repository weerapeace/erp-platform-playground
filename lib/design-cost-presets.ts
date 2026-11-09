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

export type PresetKind = "labor_cut" | "cut_rate" | "oh_fixed" | "bag" | "box" | "carton" | "parcel" | "other";
export const PRESET_KINDS: PresetKind[] = ["labor_cut", "cut_rate", "oh_fixed", "bag", "box", "carton", "parcel", "other"];

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
  labor_cut: { label: "ค่าแรง (ตัด/ปลอก/วาด)", hint: "ราคากลางต่อใบ — ปุ่ม “ราคากลาง” ใช้ตัวแรก", dims: 0, amountLabel: "฿ / ใบ" },
  cut_rate: { label: "ค่าตัดต่อชิ้นวัตถุดิบ", hint: "ค่าตัด/ปลอก/วาด ต่อ 1 ชิ้นวัตถุดิบ — ตั้งรายวัตถุดิบหรือทั้งกลุ่มได้ด้านล่าง · วัตถุดิบที่ยังไม่ตั้งใช้ค่ากลาง · ตีราคาคิดให้อัตโนมัติ", dims: 0, amountLabel: "฿ / ชิ้น" },
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
/** การตั้งค่าโสหุ้ยของ 1 แท็บ — off = คีย์รายการที่ปิด (fx:<id> / bag / box / ship) · ship = วิธีคิดค่าส่ง · carton = ลังที่เลือกเอง (ไม่มี = ระบบเลือกลังที่คุ้มสุด) */
export type OverheadCfg = { dims: PackDims; off: string[]; ship: "carton" | "parcel" | "none"; carton?: string | null };

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
    ...(typeof r.carton === "string" && r.carton && r.carton.length <= 64 ? { carton: r.carton } : {}),
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

/** ลังแต่ละขนาด: ใส่ได้กี่ชิ้น · จำนวนสั่งนี้ต้องใช้กี่ลัง · ค่าส่งรวม · ต่อชิ้น (คิดจากจำนวนลังจริง ลังสุดท้ายไม่เต็มก็จ่ายเต็ม) */
export type CartonOption = { preset: CostPreset; perCarton: number; cartons: number; total: number; perUnit: number; lastFill: number };
export function cartonOptions(d: PackDims, cartons: CostPreset[], qty?: number | null): CartonOption[] {
  const q = qty != null && qty > 0 ? Math.round(qty) : 0;
  return cartons.map((c) => {
    const n = piecesPerCarton(d, c);
    if (!(n > 0)) return { preset: c, perCarton: 0, cartons: 0, total: 0, perUnit: 0, lastFill: 0 };
    if (!q) return { preset: c, perCarton: n, cartons: 1, total: c.amount, perUnit: r2(c.amount / n), lastFill: n };
    const k = Math.ceil(q / n);
    return { preset: c, perCarton: n, cartons: k, total: r2(k * c.amount), perUnit: r2((k * c.amount) / q), lastFill: q - (k - 1) * n };
  });
}
/** ลังที่ใช้: ที่เลือกไว้ (ถ้ายังใส่ได้) ไม่งั้นลังที่ค่าส่งต่อชิ้นถูกสุด (เท่ากัน = ลังที่อยู่ก่อน) */
export function pickCarton(opts: CartonOption[], chosen?: string | null): { use: CartonOption | null; best: CartonOption | null } {
  const ok = opts.filter((o) => o.perCarton > 0);
  const best = ok.reduce<CartonOption | null>((m, o) => (!m || o.perUnit < m.perUnit ? o : m), null);
  const sel = chosen ? ok.find((o) => o.preset.id === chosen) ?? null : null;
  return { use: sel ?? best, best };
}

export type OverheadRow = { key: string; label: string; detail: string; amount: number; on: boolean; warn?: boolean; cartons?: CartonOption[]; carton?: string | null; bestCarton?: string | null };

const fmt = (n: number) => r2(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** รายการโสหุ้ยของแท็บ (ตามราคากลางปัจจุบัน) — ยอดโสหุ้ย = รวมเฉพาะรายการที่เปิด */
export function overheadRows(cfg: OverheadCfg, presets: CostPreset[], qty?: number | null): OverheadRow[] {
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
    const cartons = by("carton");
    if (cartons.length) {
      const opts = hasWL(d) ? cartonOptions(d, cartons, qty) : [];
      const { use, best } = pickCarton(opts, cfg.carton);
      const q = qty != null && qty > 0 ? Math.round(qty) : 0;
      const size = (c: CostPreset) => `${fmt(c.w_cm ?? 0)}×${fmt(c.l_cm ?? 0)}×${fmt(c.h_cm ?? 0)}`;
      rows.push(!hasWL(d) ? { key: "ship", label: "ค่าส่ง (ลัง)", detail: "ใส่ขนาดสินค้าก่อน", amount: 0, on: !off.has("ship"), warn: true }
        : use ? {
          key: "ship", label: "ค่าส่ง (ลัง)", amount: use.perUnit, on: !off.has("ship"), cartons: opts, carton: use.preset.id, bestCarton: best?.preset.id ?? null,
          detail: q
            ? `ลัง ${size(use.preset)} ใส่ได้ ${use.perCarton} · สั่ง ${q.toLocaleString("th-TH")} = ${use.cartons.toLocaleString("th-TH")} ลัง${use.lastFill < use.perCarton ? ` (ลังสุดท้าย ${use.lastFill})` : ""} · ${fmt(use.total)} ฿`
            : `ลัง ${size(use.preset)} ใส่ได้ ${use.perCarton} ชิ้น · ${fmt(use.preset.amount)} ÷ ${use.perCarton}`,
        }
        : { key: "ship", label: "ค่าส่ง (ลัง)", detail: "สินค้าใหญ่กว่าทุกลัง — เพิ่มขนาดลังในราคากลาง", amount: 0, on: !off.has("ship"), warn: true, cartons: opts });
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
export type LaborRef = { source: "bom" | "wo" | "ds"; code: string; name: string; amount: number; note?: string | null; at?: string | null; image?: string | null };

/** รหัสรุ่น (Parent) จากรหัส SKU/BOM — BOM-CTL044-01 → CTL044 · CTL044-01 → CTL044 */
export const parentOfCode = (code: string): string => code.replace(/^BOM-/i, "").replace(/-\d+$/, "");

// ── ค่าแรงตัด/ปลอก/วาด ตามจำนวนชิ้นวัตถุดิบ (เจ้าของขอ 2026-11-07) ──
// ราคาตัดต่อชิ้น 3 ระดับ (ใช้ตัวที่ละเอียดกว่าก่อน): แก้ในใบ (บรรทัด) → ตามวัสดุ (ทะเบียนวัสดุตีราคา) → ราคากลาง (kind cut_rate)

export type CutLineInput = {
  key: string;
  item_id?: string | null;
  item_name?: string | null;
  group_name?: string | null;
  calc_method?: string | null;
  pieces?: number | null;
  cut_rate?: number | null;     // แก้เฉพาะบรรทัดนี้
  cut_skip?: boolean | null;    // null = อัตโนมัติ
  // ไว้บอกว่าบรรทัดนี้คือชิ้นไหน (โชว์รายบรรทัดในตารางค่าตัด)
  note?: string | null;
  width_cm?: number | null;
  length_cm?: number | null;
  shape?: { name?: string | null } | null;
};
export type CutRateSource = "line" | "material" | "central" | "none";
export type CutRow = { key: string; itemId: string | null; name: string; group: string; pieces: number; rate: number; source: CutRateSource; on: boolean; auto: boolean; amount: number; detail: string };

/** บรรทัดนี้คือชิ้นไหน: ชื่อชิ้นที่วาด · หมายเหตุ · ขนาด กว้าง×ยาว */
export function cutLineDetail(l: Pick<CutLineInput, "note" | "width_cm" | "length_cm" | "shape">): string {
  const w = num(l.width_cm), h = num(l.length_cm);
  const f = (v: number) => String(Math.round(v * 10) / 10);
  return [(l.shape?.name ?? "").trim(), (l.note ?? "").trim(), w != null && h != null && w > 0 && h > 0 ? `${f(w)}×${f(h)} ซม.` : ""].filter(Boolean).join(" · ");
}

/** อะไหล่ (นับเป็นชิ้นสำเร็จ / หัวซิป / กระดุม) — ไม่ต้องตัด → ไม่นับอัตโนมัติ */
export const isHardwareLine = (l: Pick<CutLineInput, "group_name" | "calc_method">): boolean =>
  l.calc_method === "count" || /อะไหล่|ซิป/.test(l.group_name ?? "");

/** รายการงานตัดของแท็บ · materialRate(item_id) = ราคาตัดของวัสดุ (ทะเบียน) · central = ราคากลางต่อชิ้น */
export function cutLaborRows(lines: CutLineInput[], central: number | null, materialRate: (itemId: string) => number | null | undefined): CutRow[] {
  return lines.filter((l) => (l.item_name ?? "").trim() || l.item_id).map((l) => {
    const hw = isHardwareLine(l);
    const on = l.cut_skip == null ? !hw : !l.cut_skip;
    const pcs = num(l.pieces);
    const pieces = pcs != null && pcs > 0 ? Math.round(pcs * 100) / 100 : 1;
    const mat = l.item_id ? num(materialRate(l.item_id)) : null;
    const line = num(l.cut_rate);
    const [rate, source]: [number, CutRateSource] = line != null ? [line, "line"] : mat != null ? [mat, "material"] : central != null ? [central, "central"] : [0, "none"];
    return { key: l.key, itemId: l.item_id ?? null, name: (l.item_name ?? "").trim() || "—", group: (l.group_name ?? "").trim() || "—", pieces, rate, source, on, auto: l.cut_skip == null, amount: on ? r2(pieces * rate) : 0, detail: cutLineDetail(l) };
  });
}

/** รวมแถวงานตัดตาม "วัสดุ" (วัสดุเดียวกันหลายบรรทัด = แถวเดียว ใส่ราคาครั้งเดียว · เจ้าของขอ 2026-11-07) */
export type CutGroup = {
  key: string; itemId: string | null; name: string; group: string; lineKeys: string[]; lines: number;
  pieces: number; amount: number; on: "all" | "none" | "some";
  rate: number | null;            // null = หลายราคาในวัสดุเดียวกัน
  source: CutRateSource | "mixed";
  auto: boolean;                  // ทุกบรรทัดยังเป็นอัตโนมัติ
  rows: CutRow[];                 // รายบรรทัด (กดดูว่ามีชิ้นไหนบ้าง เท่าไหร่)
};
export function groupCutRows(rows: CutRow[]): CutGroup[] {
  const map = new Map<string, CutRow[]>();
  for (const r of rows) { const k = r.itemId ?? `n:${r.name}`; map.set(k, [...(map.get(k) ?? []), r]); }
  return [...map.entries()].map(([key, rs]) => {
    const onN = rs.filter((r) => r.on).length;
    const rates = [...new Set(rs.map((r) => r.rate))];
    const sources = [...new Set(rs.map((r) => r.source))];
    return {
      key, itemId: rs[0].itemId, name: rs[0].name, group: rs[0].group, lineKeys: rs.map((r) => r.key), lines: rs.length,
      pieces: Math.round(rs.filter((r) => r.on).reduce((s, r) => s + r.pieces, 0) * 100) / 100,
      amount: r2(rs.reduce((s, r) => s + r.amount, 0)),
      on: onN === rs.length ? "all" : onN === 0 ? "none" : "some",
      rate: rates.length === 1 ? rates[0] : null,
      source: sources.length === 1 ? sources[0] : "mixed",
      auto: rs.every((r) => r.auto),
      rows: rs,
    };
  });
}

export function cutLaborSummary(rows: CutRow[]): { total: number; pieces: number; byMaterial: { name: string; pieces: number }[]; missingRate: number } {
  const on = rows.filter((r) => r.on);
  const by = new Map<string, number>();
  for (const r of on) by.set(r.name, (by.get(r.name) ?? 0) + r.pieces);
  return {
    total: r2(on.reduce((s, r) => s + r.amount, 0)),
    pieces: Math.round(on.reduce((s, r) => s + r.pieces, 0) * 100) / 100,
    byMaterial: [...by.entries()].map(([name, pieces]) => ({ name, pieces })),
    missingRate: on.filter((r) => r.source === "none").length,
  };
}

// ── ค่าตัดตามวัตถุดิบ (หน้าราคากลาง แท็บค่าตัดต่อชิ้น · เจ้าของขอ 2026-11-09) ──
//   ลำดับราคาที่ใช้คิดในตีราคา (cutLaborRows): แก้ในใบ → ราคาของวัตถุดิบ → ค่ากลาง
//   "ทั้งกลุ่ม" = ใส่ราคาเดียวกันให้ทุกวัตถุดิบในกลุ่ม (เก็บที่ design_price_items.cut_rate — ไม่มีตาราง/คอลัมน์ใหม่)

/** ค่าตัดต่อชิ้น = ค่าแรงช่างต่อวัน ÷ ตัดได้กี่ชิ้นต่อวัน */
export function cutRateFromWage(wagePerDay: number | null | undefined, piecesPerDay: number | null | undefined): number | null {
  const w = Number(wagePerDay), p = Number(piecesPerDay);
  return Number.isFinite(w) && Number.isFinite(p) && w > 0 && p > 0 ? r2(w / p) : null;
}

export type CutMaterial = { id: string; name: string; group_name: string | null; calc_method: string | null; cut_rate: number | null; used_lines?: number; used_pieces?: number };
export type CutMaterialGroup = {
  group: string;
  items: CutMaterial[];
  hardware: boolean;                   // อะไหล่ / ซิป / นับชิ้น — ปกติไม่นับค่าตัด
  rate: number | null;                 // ราคาเดียวกันทั้งกลุ่ม (null = ยังไม่ตั้ง หรือหลายราคา)
  state: "none" | "same" | "mixed";    // none = ทุกตัวใช้ค่ากลาง · same = ราคาเดียวทั้งกลุ่ม · mixed = หลายราคา/บางตัว
  used: number;                        // ใช้ในตีราคากี่บรรทัดรวม
};

/** จัดวัตถุดิบเป็นกลุ่ม — กลุ่มที่ใช้บ่อยก่อน · ในกลุ่มเรียงตัวที่ใช้บ่อยก่อน · กลุ่มอะไหล่ไปท้าย */
export function cutMaterialGroups(items: CutMaterial[]): CutMaterialGroup[] {
  const map = new Map<string, CutMaterial[]>();
  for (const it of items) { const g = (it.group_name ?? "").trim() || "ไม่ระบุกลุ่ม"; map.set(g, [...(map.get(g) ?? []), it]); }
  const out = [...map.entries()].map(([group, list]): CutMaterialGroup => {
    const sorted = [...list].sort((a, b) => (b.used_lines ?? 0) - (a.used_lines ?? 0) || a.name.localeCompare(b.name, "th"));
    const rates = sorted.map((x) => (x.cut_rate != null && Number.isFinite(Number(x.cut_rate)) ? Number(x.cut_rate) : null));
    const set = rates.filter((r): r is number => r != null);
    const state: CutMaterialGroup["state"] = !set.length ? "none" : set.length === rates.length && set.every((r) => r === set[0]) ? "same" : "mixed";
    return {
      group, items: sorted, state, rate: state === "same" ? set[0] : null,
      hardware: sorted.every((x) => isHardwareLine({ group_name: x.group_name, calc_method: x.calc_method })),
      used: sorted.reduce((s, x) => s + (x.used_lines ?? 0), 0),
    };
  });
  return out.sort((a, b) => Number(a.hardware) - Number(b.hardware) || b.used - a.used || a.group.localeCompare(b.group, "th"));
}

// ── จำนวนที่สั่ง ต่อแท็บตีราคา (design_sheets.order_qty · แถบ "จำนวนที่สั่ง" · เจ้าของขอ 2026-11-09) ──
export const ORDER_QTY_QUICK = [100, 300, 500, 1000, 3000, 5000] as const;
const ORDER_QTY_MAX = 10_000_000;

/** {parentKey: qty} ที่ปลอดภัย — ตัดค่าที่ไม่ใช่จำนวนเต็มบวก · key ยาวไม่เกิน 120 */
export function cleanOrderQty(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.round(Number(v));
    if (k.length <= 120 && Number.isFinite(n) && n > 0 && n <= ORDER_QTY_MAX) out[k] = n;
  }
  return out;
}

/** ปุ่ม + / − : ตั้งแต่ 100 ขึ้นไปทีละ 100 · ต่ำกว่านั้นทีละ 1 · ไม่ต่ำกว่า 1 */
export function stepOrderQty(q: number | null | undefined, dir: 1 | -1): number {
  const cur = Math.max(0, Math.round(Number(q) || 0));
  if (dir > 0) return cur >= 100 ? cur + 100 : cur + 1;
  return Math.max(1, cur > 100 ? cur - 100 : cur - 1);
}

// ── ขนาดสินค้าตอนแพ็ก: ตัวเลือกจากข้อมูลที่ระบบรู้ (เจ้าของขอ 2026-11-09 "เลือกจากที่คำนวณได้") ──
export type PackSuggestion = { key: string; label: string; dims: PackDims };
export type PackRef = { product?: { w: number | null; l: number | null; t: number | null; g: number | null } | null; parcel?: { name: string; w: number; l: number; h: number } | null };
type PackLine = { item_name?: string | null; group_name?: string | null; calc_method?: string | null; width_cm?: number | null; length_cm?: number | null };

/** ตัวเลือกขนาด: ขนาดสินค้าในข้อมูลรุ่น · กล่องส่งที่รุ่นนี้ใช้ · ชิ้นใหญ่สุดในตีราคา (กว้าง×ยาว) */
export function packSuggestions(ref: PackRef | null | undefined, lines: PackLine[], code?: string | null): PackSuggestion[] {
  const out: PackSuggestion[] = [];
  const p = ref?.product;
  if (p && pos(p.w) && pos(p.l)) out.push({ key: "product", label: `ขนาดสินค้า${code ? ` ${code}` : ""}`, dims: { w: pos(p.w), l: pos(p.l), t: pos(p.t), g: pos(p.g) } });
  const c = ref?.parcel;
  if (c && pos(c.w) && pos(c.l)) out.push({ key: "parcel", label: `กล่องส่งที่รุ่นนี้ใช้ ${c.name}`, dims: { w: pos(c.w), l: pos(c.l), t: pos(c.h), g: p ? pos(p.g) : null } });
  let big: { name: string; w: number; l: number } | null = null;
  for (const l of lines) {
    if (isHardwareLine(l)) continue;
    const w = pos(l.width_cm), h = pos(l.length_cm);
    if (w && h && (!big || w * h > big.w * big.l)) big = { name: (l.item_name ?? "").trim(), w, l: h };
  }
  if (big) out.push({ key: "piece", label: `ชิ้นใหญ่สุดในตีราคา${big.name ? ` (${big.name})` : ""}`, dims: { w: big.w, l: big.l, t: null, g: null } });
  return out;
}
