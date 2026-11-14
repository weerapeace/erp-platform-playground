/**
 * 📚 Design Library — ทุนประมาณของสูตร + ปริมาณวัสดุ (pure · เทสต์ lib/design-library-cost.test.ts)
 *
 * ปริมาณ:
 *   ผ้าตัว / ซับใน / หู = พื้นที่ชิ้นตัดจากตัวสร้างแพทเทิร์น (lib/bag-templates bagPieces — ตัวเดียวกับสตูดิโอแพทเทิร์น) + ช่องที่วาด
 *     → หลาด้วยสูตรกลาง calcCostQty "area_face" (lib/design-sheets-meta · ตัวเดียวกับ BOM/ใบตีราคา) · หน้าผ้า/เผื่อเสีย จาก bom_calc_settings
 *   เทป = ความยาวรอบปากกระเป๋า (calcCostQty "length") · ที่เหลือ (อะไหล่ ซิป โลโก้ ด้าย อื่น ๆ) = 1 ชิ้นต่อจุด
 *   ทุกบรรทัดแก้จำนวนเองได้ (spec.cost.qty)
 * ราคา: ราคาทุน SKU (skus_v2.standard_price) · ไม่มี SKU/ไม่มีราคา = ใส่เอง (spec.cost.price) · รวมเงินด้วย bomMaterialCost (lib/cost-inputs — แหล่งเดียว §37)
 * สิทธิ์: ราคา/ยอดเงินเห็นเฉพาะ products.cost.view (API ตัด spec.cost ออกให้คนไม่มีสิทธิ์) · ปริมาณ (ใบสั่งทำตัวอย่าง) ทุกคนเห็น
 */
import { bagGeometry, bagPieces } from "@/lib/bag-templates";
import { bomMaterialCost } from "@/lib/cost-inputs";
import { calcCostQty } from "@/lib/design-sheets-meta";
import { bodyPickOf, categoryOf, EMPTY_COST, pickInfo, PANELS, skuIdOf, toStudioParams, type Choice, type Pick, type RecipeCost, type Spec } from "@/lib/design-library";

// ─── ข้อมูลประกอบ ─────────────────────────────────────────────────────────────
/** วัสดุที่ผูก SKU (ไม่มีราคา — ใช้คิดปริมาณ) */
export type MaterialInfo = { code: string; name: string; uom: string | null; face_width_cm: number | null };
/** ค่าคิดผ้า (bom_calc_settings) */
export type CalcSetting = { face: number; loss: number; cmPerUnit: number; uom: string };
export type CalcSettings = { outer: CalcSetting; lining: CalcSetting };
/** ค่าตั้งต้นเท่ากับ bom_calc_settings ณ 2026-11-14 (ผ้า/PU · ผ้าซับใน: หน้า 150 · เผื่อ 25% · หลา 91.44 ซม.) */
export const DEFAULT_CALC: CalcSettings = {
  outer:  { face: 150, loss: 25, cmPerUnit: 91.44, uom: "หลา" },
  lining: { face: 150, loss: 25, cmPerUnit: 91.44, uom: "หลา" },
};
/** แปลงแถว bom_calc_settings → CalcSettings (ไม่มี/ค่าเสีย = ค่าตั้งต้น) */
export function calcSettingsFrom(rows: { material_type: string; default_face_width_cm: number | null; loss_percent: number | null; uom: string | null; cm_per_unit: number | null }[]): CalcSettings {
  const pick = (type: string, d: CalcSetting): CalcSetting => {
    const r = rows.find((x) => x.material_type === type);
    if (!r) return d;
    return { face: Number(r.default_face_width_cm) > 0 ? Number(r.default_face_width_cm) : d.face, loss: Number.isFinite(Number(r.loss_percent)) ? Number(r.loss_percent) : d.loss,
      cmPerUnit: Number(r.cm_per_unit) > 0 ? Number(r.cm_per_unit) : d.cmPerUnit, uom: r.uom || d.uom };
  };
  return { outer: pick("ผ้า/PU", DEFAULT_CALC.outer), lining: pick("ผ้าซับใน", DEFAULT_CALC.lining) };
}

export { cleanCost, EMPTY_COST, type RecipeCost } from "@/lib/design-library";

// ─── ชิ้นผ้าจากขนาด ────────────────────────────────────────────────────────────
export type FabricAreas = { body: number; lining: number; handle: number; pocketsOuter: number; pocketsInside: number; perimeter: number; clamped: boolean };
const POCKET_ALLOW = 1;   // เผื่อเย็บรอบช่อง (ซม./ด้าน) · ช่อง = 2 ชั้น
/** พื้นที่ผ้า (ตร.ซม. รวมเผื่อเย็บ) — ตัวกระเป๋า/ซับในจากชิ้นตัดของแม่แบบทรงในสตูดิโอ (ช่องหน้าคิดจากที่วาดแยก จึงตัดช่องในแพทเทิร์นออก) */
export function fabricAreas(spec: Spec): FabricAreas {
  const params = { ...toStudioParams(spec), win: "none" as const };
  const G = bagGeometry(params);
  const pieces = bagPieces(G);
  const area = (keys: string[]) => pieces.filter((p) => keys.includes(p.key)).reduce((s, p) => s + p.cut.w * p.cut.h * p.count, 0);
  const shell = ["front", "back", "strip", "side", "bottom"];
  const handle = spec.handle.count > 0 ? area(["handle"]) * (spec.handle.count / 2) : 0;   // แพทเทิร์นมี 2 หู
  const box = (keys: typeof PANELS[number]["key"][]) => keys.reduce((s, k) => s + spec.pockets[k].reduce((a, b) => a + (b.w + 2 * POCKET_ALLOW) * (b.h + 2 * POCKET_ALLOW) * 2, 0), 0);
  const clamped = Math.abs(G.p.W - spec.size.w) > 0.01 || Math.abs(G.p.H - spec.size.h) > 0.01 || Math.abs(G.p.D - spec.size.d) > 0.01;
  return { body: Math.round(area(shell)), lining: Math.round(area(shell)), handle: Math.round(handle), pocketsOuter: Math.round(box(["front", "back"])), pocketsInside: Math.round(box(["inside_front", "inside_back"])), perimeter: Math.round(2 * (spec.size.w + spec.size.d)), clamped };
}

// ─── บรรทัดวัสดุ ───────────────────────────────────────────────────────────────
export type CostMethod = "area" | "length" | "count";
export type CostLine = {
  key: string; cat: string; catName: string; pinIndex: number | null;
  pick: Pick | null; code: string; name: string; skuId: string | null;
  method: CostMethod; detail: string;
  autoQty: number | null; qty: number; uom: string;
  /** ราคาต่อหน่วย (0 = ไม่มี) · แหล่งราคา */
  unitPrice: number; priceSource: "sku" | "manual" | "none"; priceKey: string;
  amount: number;
  /** ตัวตั้งที่ใช้คิดปริมาณอัตโนมัติ (ส่งต่อเป็นบรรทัดตีราคาใบงาน) · ไม่มี = คิดอัตโนมัติไม่ได้ */
  basis?: { area_cm2?: number; length_cm?: number; face: number | null; loss: number; div: number };
};
export type CostEstimate = {
  lines: CostLine[]; materials: number; labor: number; extras: number; total: number; missing: number;
  areas: FabricAreas;
};

/** หมวด → วิธีคิดปริมาณ (ตามรหัสหมวดตั้งต้น · หมวดที่ทีมเพิ่มเอง = นับชิ้น) */
const AREA_CATS: Record<string, "body" | "lining" | "handle"> = { body: "body", lining: "lining", handle: "handle" };
const LENGTH_CATS = new Set(["tape"]);

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

/**
 * หน่วยของ SKU (uoms.name) → ซม. ต่อหน่วย สำหรับวัสดุที่คิดตามความยาว/พื้นที่
 * ไม่มีหน่วย = ใช้ค่าตั้งต้น (หลา) · หน่วยที่ไม่ใช่ความยาว (kg / Units …) = null → คิดอัตโนมัติไม่ได้ ใส่ปริมาณเอง
 * ข้อมูลจริง 2026-11-14: ผ้าที่มีหน้าผ้า 1,425 ตัว = หลา 1,388 · m 18 · Units 12 · kg 5 · Yard 1
 */
export function lengthUnitCm(uom: string | null | undefined, fallbackCm: number): number | null {
  const u = (uom ?? "").trim().toLowerCase();
  if (!u) return fallbackCm;
  if (/^(หลา|yard|yards|yd|yds)$/.test(u)) return 91.44;
  if (/^(m|เมตร|meter|meters|metre|ม\.)$/.test(u)) return 100;
  if (/^(cm|ซม\.?|เซนติเมตร)$/.test(u)) return 1;
  if (/^(inch|นิ้ว|in)$/.test(u)) return 2.54;
  return null;
}

/**
 * ทุนประมาณของสูตร (ใส่สูตรที่ applyColorway แล้ว = ทุนของชุดสีนั้น)
 * @param materials วัสดุที่ผูก SKU ตาม sku_id (หน่วย/หน้าผ้า) · @param prices ราคาทุนตาม sku_id (ไม่มีสิทธิ์ = {})
 */
export function estimateCost(spec: Spec, choices: Choice[], ctx: { materials: Record<string, MaterialInfo>; prices: Record<string, number>; calc?: CalcSettings; cost?: RecipeCost }): CostEstimate {
  const calc = ctx.calc ?? DEFAULT_CALC, cost = ctx.cost ?? EMPTY_COST;
  const areas = fabricAreas(spec);
  const body = bodyPickOf(spec);
  const lines: CostLine[] = [];
  const seenArea = new Map<string, CostLine>();   // หมวดผ้า → บรรทัดแรก (จุดซ้ำหมวดเดียวกันของเดียวกัน = รวม)
  let handleAsBody = spec.handle.count > 0 && !spec.pins.some((p) => p.cat === "handle" && p.pick && p.pick.kind !== "same_as_body");

  /** หลา/เมตร ตามหน่วยจริงของ SKU (null = หน่วยไม่ใช่ความยาว → ใส่เอง) */
  const fabricQty = (area: number, setting: CalcSetting, mat: MaterialInfo | undefined): number | null => {
    const div = lengthUnitCm(mat?.uom, setting.cmPerUnit);
    if (div == null) return null;
    const face = mat?.face_width_cm;
    return area > 0 ? calcCostQty({ calc_method: "area_face", width_cm: 1, length_cm: 1, pieces: 1, area_cm2: area, face_width_cm: face && face > 0 ? face : setting.face, waste_percent: setting.loss, divisor: div }) : 0;
  };
  const areaBasis = (area: number, setting: CalcSetting, mat: MaterialInfo | undefined): CostLine["basis"] => {
    const div = lengthUnitCm(mat?.uom, setting.cmPerUnit);
    return div == null || area <= 0 ? undefined : { area_cm2: area, face: mat?.face_width_cm && mat.face_width_cm > 0 ? mat.face_width_cm : setting.face, loss: setting.loss, div };
  };
  const unitNote = (mat: MaterialInfo | undefined, setting: CalcSetting) => (lengthUnitCm(mat?.uom, setting.cmPerUnit) == null ? ` · SKU ขายเป็น ${mat?.uom} คิดอัตโนมัติไม่ได้ ใส่ปริมาณเอง` : "");

  spec.pins.forEach((p, i) => {
    if (!p.cat) return;
    const cat = categoryOf(choices, p.cat);
    const pick = p.pick?.kind === "same_as_body" ? null : p.pick;
    if (p.pick?.kind === "same_as_body") { if (p.cat === "handle") handleAsBody = true; return; }
    const info = pickInfo(pick, { bodyPick: body });
    const skuId = skuIdOf(pick);
    const mat = skuId ? ctx.materials[skuId] : undefined;
    const base = { cat: p.cat, catName: cat?.name ?? p.cat, pinIndex: i, pick, code: info.code === "LOGO" ? "" : info.code, name: info.name || (p.note ? `(โน้ต) ${p.note}` : "ยังไม่เลือก"), skuId };
    const areaKind = AREA_CATS[p.cat];
    if (areaKind) {
      const prev = seenArea.get(p.cat);
      if (prev && (prev.code === base.code || !base.code)) return;   // จุดซ้ำหมวดเดียวกันของเดียวกัน = นับครั้งเดียว
      const setting = areaKind === "lining" ? calc.lining : calc.outer;
      if (!prev) {
        const a = areaKind === "body" ? areas.body + areas.pocketsOuter : areaKind === "lining" ? areas.lining + areas.pocketsInside : areas.handle;
        const line: CostLine = { ...base, key: `area:${p.cat}`, method: "area", autoQty: fabricQty(a, setting, mat), basis: areaBasis(a, setting, mat),
          detail: `ผ้า ${fmt(a)} ตร.ซม. · หน้า ${mat?.face_width_cm || setting.face} ซม. · เผื่อเสีย ${setting.loss}%${unitNote(mat, setting)}`, qty: 0, uom: mat?.uom || setting.uom, unitPrice: 0, priceSource: "none", priceKey: "", amount: 0 };
        seenArea.set(p.cat, line); lines.push(line);
        return;
      }
      lines.push({ ...base, key: `pin:${p.id}`, method: "count", autoQty: null, detail: `${base.catName}อีกชนิดในจุดที่ ${i + 1} — ใส่ปริมาณเอง`, qty: 0, uom: mat?.uom || setting.uom, unitPrice: 0, priceSource: "none", priceKey: "", amount: 0 });
      return;
    }
    if (LENGTH_CATS.has(p.cat)) {
      const len = areas.perimeter;
      const div = lengthUnitCm(mat?.uom, calc.outer.cmPerUnit);
      lines.push({ ...base, key: `pin:${p.id}`, method: "length", autoQty: div == null ? null : calcCostQty({ calc_method: "length", width_cm: null, length_cm: len, pieces: 1, face_width_cm: null, waste_percent: 10, divisor: div }),
        detail: `รอบปากกระเป๋า ${fmt(len)} ซม. · เผื่อ 10%${unitNote(mat, calc.outer)}`, basis: div == null ? undefined : { length_cm: len, face: null, loss: 10, div }, qty: 0, uom: mat?.uom || calc.outer.uom, unitPrice: 0, priceSource: "none", priceKey: "", amount: 0 });
      return;
    }
    lines.push({ ...base, key: `pin:${p.id}`, method: "count", autoQty: 1, detail: "1 ชิ้นต่อจุด", qty: 0, uom: mat?.uom || "ชิ้น", unitPrice: 0, priceSource: "none", priceKey: "", amount: 0 });
  });

  // หูใช้ผ้าเดียวกับตัวกระเป๋า → บวกพื้นที่หูเข้าบรรทัดผ้าตัว
  const bodyLine = seenArea.get("body");
  if (bodyLine && handleAsBody && areas.handle > 0) {
    const a = areas.body + areas.pocketsOuter + areas.handle;
    const mat = bodyLine.skuId ? ctx.materials[bodyLine.skuId] : undefined;
    bodyLine.autoQty = fabricQty(a, calc.outer, mat);
    bodyLine.basis = areaBasis(a, calc.outer, mat);
    bodyLine.detail = `ผ้า ${fmt(a)} ตร.ซม. (รวมหู) · หน้า ${mat?.face_width_cm || calc.outer.face} ซม. · เผื่อเสีย ${calc.outer.loss}%${unitNote(mat, calc.outer)}`;
  }

  // จำนวน + ราคา
  for (const l of lines) {
    l.qty = cost.qty[l.key] ?? l.autoQty ?? 0;
    l.priceKey = l.code ? `code:${l.code}` : `line:${l.key}`;
    const manual = cost.price[l.priceKey];
    const skuPrice = l.skuId ? ctx.prices[l.skuId] ?? 0 : 0;
    if (manual != null && manual > 0) { l.unitPrice = manual; l.priceSource = "manual"; }
    else if (skuPrice > 0) { l.unitPrice = skuPrice; l.priceSource = "sku"; }
  }
  // รวมเงินด้วยของกลาง (ราคาต่อ "รหัส" = priceKey)
  const sum = bomMaterialCost(lines.map((l) => ({ component_sku: l.priceKey, component_name: l.name, uom: l.uom, qty: l.qty })), new Map(lines.map((l) => [l.priceKey, l.unitPrice])));
  sum.materials.forEach((m, i) => { lines[i].amount = m.line_pp; });
  const missing = lines.filter((l) => l.qty > 0 && l.unitPrice <= 0).length;
  const extras = cost.extras.reduce((s, e) => s + e.amount, 0);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { lines, materials: r2(sum.material_cost_pp), labor: cost.labor, extras: r2(extras), total: r2(sum.material_cost_pp + cost.labor + extras), missing, areas };
}
