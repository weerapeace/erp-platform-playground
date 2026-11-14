/**
 * 📚 Design Library → ใบงานออกแบบ (รอบ 5 ช่วง 3) · pure (เทสต์ lib/design-library-sheet.test.ts)
 *
 * แปลงสูตรเป็นของในใบงานออกแบบ — ใช้ตารางเดิมของใบงานทั้งหมด ไม่มีตารางใหม่:
 *   รูปผล GPT ล่าสุด (ทุกชุดสี) → erp_playground_attachments (key R2 เดิม ไม่อัปซ้ำ)
 *   หน้ารูป + หมุดวัสดุ        → design_sheet_spec_pages / _pins (แท็บรายละเอียดงาน)
 *   ชุดสี                      → design_sheet_spec_colors (ตารางสี · แถว = จุดในสูตร · คอลัมน์ = ชุดสี)
 *   ทุนประมาณ                  → design_sheet_cost_lines (ตารางตีราคา · ต่อท้าย ไม่ลบของเดิม)
 * ส่งซ้ำ: หน้า/ชุดสีที่ชื่อตรงกัน = แทนของเดิมจากสูตรนี้ · รูปที่แนบแล้ว = ข้าม
 * ทางเข้า API: POST /api/design-library/send-to-sheet
 */
import { bodyPickOf, categoryOf, colorwayLabel, pickInfo, MAIN_COLORWAY_LABEL, type Choice, type Pick, type Spec } from "@/lib/design-library";
import type { CostLine as EstLine } from "@/lib/design-library-cost";
import { cleanSpecColors, type SpecColorCell, type SpecColorRow, type SpecColorTable, type SpecColorway } from "@/lib/design-sheet-spec-colors";
import { recomputeCostLine } from "@/lib/design-sheet-cost-row";

/** ชื่อที่ใช้จำว่าอะไรในใบงานมาจากสูตรนี้ (ส่งซ้ำ = แทนของที่ชื่อตรงกัน) */
export const recipeTag = (templateCode: string, seq: number) => `${templateCode} สูตร #${seq}`;
export const specPageTitle = (templateCode: string, seq: number, colorwayName: string | null) =>
  `Design Library · ${recipeTag(templateCode, seq)}${colorwayName ? ` · ${colorwayName}` : ""}`.slice(0, 120);

/** หมวดในสูตร → ชนิดวัสดุในตารางตีราคาใบงาน (ชื่อที่ใบงานใช้จริง) · ตั้งทับได้ที่ตัวเลือกหมวด config.cost_group */
const COST_GROUP: Record<string, string> = { body: "ผ้า", handle: "ผ้า", lining: "ผ้า", tape: "สาย/เทป", zip: "ซิป", hw: "อะไหล่", bottom: "อะไหล่" };
export function costGroupOf(choices: Choice[], cat: string): string | null {
  const c = categoryOf(choices, cat);
  const own = typeof c?.config?.cost_group === "string" ? String(c.config.cost_group).trim() : "";
  return own || COST_GROUP[cat] || null;
}

// ─── ชุดสี → ตารางสีของใบงาน ─────────────────────────────────────────────────
const safeKey = (s: string) => s.replace(/[^\w-]/g, "").slice(0, 64) || "x";

/** ของที่เลือกในจุด → ช่องตารางสีใบงาน (null = ไม่มีอะไรให้โชว์) */
export function pickToColorCell(p: Pick | null, bodyPick: Pick | null): SpecColorCell | null {
  if (!p) return null;
  const base: SpecColorCell = { source: "pick", name: null, hex: null, colors: [], image_key: null, crop: null, sku_id: null, sku_code: null, sku_name: null, swatch_id: null };
  switch (p.kind) {
    case "swatch": return { ...base, source: "swatch", name: p.name || p.swatch_name || null, image_key: p.image_key, crop: { x: p.x, y: p.y, w: p.w, h: p.h }, swatch_id: p.swatch_id || null, sku_id: p.sku_id, sku_code: p.sku_id ? p.code || null : null, sku_name: p.sku_id ? p.name || null : null };
    case "sku": return { ...base, source: "sku", name: p.name || p.code, image_key: p.image_key, sku_id: p.sku_id, sku_code: p.code || null, sku_name: p.name || null };
    case "color": return { ...base, source: "dict", name: [p.code, p.name].filter(Boolean).join(" ") || null, hex: p.hex };
    case "logo": return { ...base, name: p.name || "โลโก้", image_key: p.image_key };
    case "text": return { ...base, name: p.text };
    case "same_as_body": return bodyPick && bodyPick.kind !== "same_as_body" ? pickToColorCell(bodyPick, null) : null;
  }
}

/** ตารางสีจากสูตร: แถว = จุดในสูตร (+ สีอะไหล่ทั้งใบ) · คอลัมน์ = สีหลัก + ชุดสีอื่น */
export function recipeColorTable(spec: Spec, choices: Choice[]): SpecColorTable {
  const count = new Map<string, number>();
  const rows: SpecColorRow[] = spec.pins.map((p) => {
    const n = (count.get(p.cat) ?? 0) + 1; count.set(p.cat, n);
    const name = categoryOf(choices, p.cat)?.name ?? (p.cat || "จุด");
    return { key: `p-${safeKey(p.id)}`, name: (spec.pins.filter((x) => x.cat === p.cat).length > 1 ? `${name} ${n}` : name).slice(0, 80) };
  });
  const HW_ROW = "hw-color";
  rows.push({ key: HW_ROW, name: "สีอะไหล่ทั้งใบ" });
  const hwCell = (code: string | null): SpecColorCell | null => {
    const c = choices.find((x) => x.list_key === "hw_color" && x.code === code);
    return c ? { source: "dict", name: c.name, hex: c.hex, colors: [], image_key: null, crop: null, sku_id: null, sku_code: null, sku_name: null, swatch_id: null } : null;
  };
  const column = (key: string, name: string, picks: (Pick | null)[], hw: string | null): SpecColorway => {
    const bi = spec.pins.findIndex((p, i) => p.cat === "body" && picks[i] && picks[i]!.kind !== "same_as_body");
    const body = bi >= 0 ? picks[bi] : null;   // ผ้าตัวของชุดสีนี้ (จุด "ใช้ผ้าเดียวกับตัว" โชว์ผ้านี้)
    const cells: Record<string, SpecColorCell> = {};
    picks.forEach((pk, i) => { const c = pickToColorCell(pk, body); if (c) cells[rows[i].key] = c; });
    const h = hwCell(hw); if (h) cells[HW_ROW] = h;
    return { key, name, cells };
  };
  const colorways = [
    column("main", MAIN_COLORWAY_LABEL, spec.pins.map((p) => p.pick), spec.hw_color),
    ...spec.colorways.map((cw) => column(`cw-${safeKey(cw.id)}`, colorwayLabel(spec, cw.id),
      spec.pins.map((p) => (p.id in cw.picks ? cw.picks[p.id] : p.pick)), cw.hw_color ?? spec.hw_color)),
  ];
  if (!spec.pins.length && !colorways.some((c) => c.cells[HW_ROW])) return { rows: [], colorways: [] };
  return cleanSpecColors({ rows, colorways });
}

/**
 * รวมตารางสีของสูตรเข้าตารางเดิมของใบงาน (ไม่ลบของเดิม)
 *   แถว: ชื่อตรงกัน = ใช้แถวเดิม · ไม่มี = เพิ่มท้าย
 *   คอลัมน์: ชื่อ "<ชื่อชุดสี> · <สูตร>" — ตรงกับของเดิม (ส่งซ้ำ) = แทนเฉพาะช่องของแถวจากสูตร · ไม่มี = เพิ่มท้าย
 */
export function mergeColorTables(existing: SpecColorTable, incoming: SpecColorTable, tag: string): SpecColorTable {
  const rows = existing.rows.map((r) => ({ ...r }));
  const keyMap = new Map<string, string>();
  const used = new Set(rows.map((r) => r.key));
  for (const r of incoming.rows) {
    const same = rows.find((x) => x.name.trim() === r.name.trim());
    if (same) { keyMap.set(r.key, same.key); continue; }
    let k = r.key, i = 2; while (used.has(k)) k = `${r.key}-${i++}`;
    used.add(k); rows.push({ ...r, key: k }); keyMap.set(r.key, k);
  }
  const colorways = existing.colorways.map((c) => ({ ...c, cells: { ...c.cells } }));
  const cwKeys = new Set(colorways.map((c) => c.key));
  for (const cw of incoming.colorways) {
    const name = `${cw.name} · ${tag}`.slice(0, 80);
    const cells: Record<string, SpecColorCell> = {};
    for (const [k, v] of Object.entries(cw.cells)) cells[keyMap.get(k) ?? k] = v;
    const cur = colorways.find((c) => c.name === name);
    if (cur) { for (const k of keyMap.values()) delete cur.cells[k]; Object.assign(cur.cells, cells); continue; }
    let k = cw.key, i = 2; while (cwKeys.has(k)) k = `${cw.key}-${i++}`;
    cwKeys.add(k); colorways.push({ key: k, name, cells });
  }
  return cleanSpecColors({ rows, colorways });
}

// ─── หน้ารูป + หมุดวัสดุ (แท็บรายละเอียดงาน) ─────────────────────────────────
export type SheetPagePin = { x: number; y: number; part_name: string | null; sku_id: string | null; sku_code: string | null; sku_name: string | null; qty: number | null; uom: string | null; note: string | null };

/** หมุดบนรูปแม่แบบ (ตำแหน่ง % เดียวกับสูตร) + จำนวนจากทุนประมาณ · ผ้าหมวดเดียวกันจุดที่ 2+ / ใช้ผ้าตัว = โน้ตว่ารวมไว้ที่ไหน */
export function recipePagePins(spec: Spec, choices: Choice[], lines: EstLine[]): SheetPagePin[] {
  const body = bodyPickOf(spec);
  const byPin = new Map(lines.filter((l) => l.pinIndex != null).map((l) => [l.pinIndex!, l]));
  return spec.pins.map((p, i) => {
    const cat = categoryOf(choices, p.cat);
    const l = byPin.get(i);
    const info = pickInfo(p.pick, { bodyPick: body });
    const skuPick = p.pick && (p.pick.kind === "sku" || p.pick.kind === "swatch") && p.pick.sku_id ? p.pick : null;
    const merged = !l && lines.find((x) => x.key === `area:${p.cat}`);
    const notes = [
      !skuPick && info.name ? `${info.code && info.code !== "LOGO" ? `${info.code} ` : ""}${info.name}` : "",
      p.pick?.kind === "same_as_body" ? "รวมจำนวนในผ้าตัวกระเป๋า" : merged && merged.pinIndex != null ? `รวมจำนวนในจุดที่ ${merged.pinIndex + 1}` : "",
      p.note,
    ].filter(Boolean);
    return {
      x: p.x, y: p.y, part_name: (cat?.name ?? p.cat) || null,
      sku_id: skuPick?.sku_id ?? null, sku_code: skuPick?.code || null, sku_name: skuPick ? skuPick.name || null : null,
      qty: l && l.qty > 0 ? Math.round(l.qty * 10000) / 10000 : null, uom: l && l.qty > 0 ? l.uom || null : null,
      note: notes.join(" · ").slice(0, 500) || null,
    };
  });
}

// ─── ทุนประมาณ → บรรทัดตีราคาใบงาน ──────────────────────────────────────────
export type SheetCostRow = {
  item_id: null; item_name: string | null; group_name: string | null; group_code: null; price_basis: null;
  item_sku_id: string | null; item_sku_code: string | null; parent_code: null;
  calc_method: string | null; width_cm: number | null; length_cm: number | null; pieces: number | null;
  face_width_cm: number | null; waste_percent: number | null; divisor: number | null;
  qty: number | null; uom: string | null; unit_price: number | null; amount: number | null; note: string | null;
};
/**
 * บรรทัดทุนประมาณ → บรรทัดตีราคาใบงาน (ใบงานคิดปริมาณใหม่เองจากช่องเหล่านี้ด้วยสูตรเดียวกัน recomputeCostLine)
 *   ผ้า: กว้าง = หน้าผ้า · ยาว = พื้นที่ ÷ หน้าผ้า แบบ area_face · เทป: length · ชิ้น: count
 *   แก้ปริมาณเอง / หน่วยไม่ใช่ความยาว (ไม่มี basis) = ปริมาณตายตัว (calc_method ว่าง)
 *   ราคา: เฉพาะที่รู้ (SKU / ใส่เอง) · ไม่มีราคา = ว่างให้ใบงานเติม
 */
export function recipeCostRows(lines: EstLine[], choices: Choice[], tag: string): SheetCostRow[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return lines.filter((l) => l.qty > 0 || l.unitPrice > 0).map((l) => {
    const base: SheetCostRow = {
      item_id: null, item_name: (l.name || l.catName || "").slice(0, 300) || null, group_name: costGroupOf(choices, l.cat), group_code: null, price_basis: null,
      item_sku_id: l.skuId, item_sku_code: l.skuId ? l.code || null : null, parent_code: null,
      calc_method: null, width_cm: null, length_cm: null, pieces: null, face_width_cm: null, waste_percent: null, divisor: null,
      qty: l.qty > 0 ? l.qty : null, uom: l.uom || null, unit_price: l.unitPrice > 0 ? l.unitPrice : null, amount: null,
      note: `จาก Design Library ${tag} · ${l.catName}${l.detail ? ` · ${l.detail}` : ""}`.slice(0, 500),
    };
    const auto = l.autoQty != null && Math.abs(l.qty - l.autoQty) < 1e-9;
    const b = l.basis;
    let row = base;
    if (auto && b?.area_cm2 && b.face) row = { ...base, calc_method: "area_face", width_cm: b.face, length_cm: r2(b.area_cm2 / b.face), pieces: 1, face_width_cm: b.face, waste_percent: b.loss, divisor: b.div };
    else if (auto && b?.length_cm) row = { ...base, calc_method: "length", length_cm: r2(b.length_cm), pieces: 1, waste_percent: b.loss, divisor: b.div };
    else if (auto && l.method === "count") row = { ...base, calc_method: "count", pieces: l.qty };
    const { shape: _shape, ...out } = recomputeCostLine({ ...row, shape: null });
    void _shape;
    return out;
  });
}

// ─── รูปผล GPT ───────────────────────────────────────────────────────────────
export type RenderRow = { id: string; view_key: string; version: number; image_key: string; colorway_id: string | null; created_at: string };
/** รูปล่าสุดต่อ (มุมมอง × ชุดสี) — เรียงสีหลักก่อน */
export function latestRenders(rows: RenderRow[]): RenderRow[] {
  const m = new Map<string, RenderRow>();
  for (const r of rows) {
    const k = `${r.view_key}|${r.colorway_id ?? ""}`;
    const cur = m.get(k);
    if (!cur || r.version > cur.version || (r.version === cur.version && r.created_at > cur.created_at)) m.set(k, r);
  }
  return [...m.values()].sort((a, b) => (a.colorway_id ? 1 : 0) - (b.colorway_id ? 1 : 0) || a.view_key.localeCompare(b.view_key));
}

/** รายละเอียดงานตั้งต้นของใบใหม่ (HTML สั้น ๆ + ลิงก์กลับไปสูตร) */
export function sheetDetailHtml(o: { recipeId: string; tag: string; templateName: string; size: Spec["size"]; colorways: string[]; note: string | null }): string {
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const s = o.size;
  return [
    `<p>จาก Design Library: <a href="/master/design-library/recipe/${esc(o.recipeId)}">${esc(o.tag)}</a> · ${esc(o.templateName)}</p>`,
    `<p>ขนาด กว้าง ${s.w} × สูง ${s.h} × หนา ${s.d} ซม.${s.strap ? ` · สายยาว ${s.strap} ซม.` : ""}</p>`,
    o.colorways.length > 1 ? `<p>ชุดสี: ${o.colorways.map(esc).join(" · ")}</p>` : "",
    o.note ? `<p>${esc(o.note)}</p>` : "",
    `<p><a href="/print/design-library/${esc(o.recipeId)}/techpack">ใบสั่งทำตัวอย่าง</a></p>`,
  ].filter(Boolean).join("");
}
