/**
 * 🎨 สไตล์กล่องของกระดาน flowchart กลาง (เจ้าของสั่ง 2026-11-21: ปกติ · minimal · comic · luxury · punk-hazard · y2k + ข้อ 1-5)
 *   ตั้งได้ 2 ระดับ: ทั้งกระดาน (FlowScene.style) และรายกล่อง (data.style) — ใช้ของกล่องก่อน ไม่มี = ตามกระดาน ไม่มี = ปกติ
 *   สีพื้น/สีเส้นที่ตั้งเอง (data.fill / data.stroke) ชนะสีของสไตล์เสมอ · ฟอนต์ที่เลือกเอง (data.font) ชนะฟอนต์ของสไตล์
 *   ใช้ทั้งบนจอ (components/flowchart-board/nodes) ตอนบันทึกเป็นรูป (export-html) และเส้นเชื่อม (edge) → แก้ที่นี่ที่เดียว
 * ไม่มี React · ไม่ import อะไร · เทสต์: lib/__tests__/flowchart-styles.test.ts
 */

export const FLOW_STYLE_KEYS = ["normal", "minimal", "comic", "luxury", "punk", "y2k"] as const;
export type FlowStyleKey = (typeof FLOW_STYLE_KEYS)[number];
export const isFlowStyle = (v: unknown): v is FlowStyleKey => typeof v === "string" && (FLOW_STYLE_KEYS as readonly string[]).includes(v);

export const FLOW_STYLE_META: Record<FlowStyleKey, { th: string; en: string; hintTh: string; hintEn: string; font?: string }> = {
  normal:  { th: "ปกติ",        en: "Normal",       hintTh: "แบบเดิมของกระดาน", hintEn: "The board's usual look" },
  minimal: { th: "minimal",    en: "Minimal",      hintTh: "เส้นบาง พื้นขาว ดูสะอาด", hintEn: "Thin lines, white fill" },
  comic:   { th: "comic",      en: "Comic",        hintTh: "เส้นดำหนา เงาแข็ง ฟอนต์ลายมือ", hintEn: "Bold black outline, hard shadow, hand font", font: "Itim" },
  luxury:  { th: "luxury",     en: "Luxury",       hintTh: "พื้นเข้ม เส้นทองคู่ ฟอนต์มีหัว", hintEn: "Dark fill, double gold line, serif font", font: "Trirong" },
  punk:    { th: "punk-hazard", en: "Punk hazard", hintTh: "เหลือง-ดำ ลายเทปกั้น ตัวหนา", hintEn: "Yellow-black hazard tape, bold type", font: "Kanit" },
  y2k:     { th: "y2k",        en: "Y2K",          hintTh: "ชมพูพาสเทล ขอบม่วงวงคู่ ทรงมน", hintEn: "Pastel pink, double lavender ring, rounded", font: "Mitr" },
};

/** ฟอนต์ของทุกสไตล์ (ให้กระดานโหลดเมื่อมีกล่องใช้) */
export const flowStyleFont = (k: FlowStyleKey): string | undefined => FLOW_STYLE_META[k].font;

export type FlowTone = { fill: string; stroke: string; text: string; sub: string };
/** ผลของสไตล์ 1 กล่อง — css ใช้กับกล่องที่มีกรอบ · sw/dash/filter ใช้กับรูปทรง SVG (คำถาม · ที่เก็บ · รูปทรง) */
export type FlowStyleLook = FlowTone & {
  sw: number;                 // ความหนาเส้น (px)
  radius?: string;            // มุม (ไม่มี = ตามชนิดกล่อง)
  shadow?: string;            // box-shadow
  outline?: string;           // เส้นคู่ (luxury)
  hazard?: boolean;           // ขอบลายเทปกั้น (punk)
  dash?: string;              // เส้นประของรูปทรง SVG
  filter?: string;            // เงาของรูปทรง SVG (CSS filter)
  font?: string;              // ฟอนต์ Google
  upper?: boolean;
  letter?: string;
  weight?: number;
};

/** สไตล์ที่ใช้จริงของกล่อง: ของกล่อง → ของกระดาน → ปกติ */
export const effectiveStyle = (own: unknown, board: unknown): FlowStyleKey => (isFlowStyle(own) ? own : isFlowStyle(board) ? board : "normal");

/**
 * คิดหน้าตากล่องตามสไตล์
 *  base = สีชุดของกล่อง (FLOW_PALETTE) · custom = สีที่ผู้ใช้ตั้งเอง (ชนะ) · light = กล่องที่มีตัวหนังสือเยอะบนพื้นสว่าง (รายการงาน/อัตโนมัติ) → สไตล์พื้นเข้มใช้พื้นอ่อนแทน
 */
export function flowStyleLook(key: FlowStyleKey, base: FlowTone, custom: { fill?: string; stroke?: string } = {}, light = false): FlowStyleLook {
  let l: FlowStyleLook;
  switch (key) {
    case "minimal": l = { fill: "#ffffff", stroke: base.stroke, text: base.text, sub: base.sub, sw: 1, radius: "6px", weight: 400 }; break;
    case "comic":   l = { fill: base.fill === "#ffffff" ? "#fef9c3" : base.fill, stroke: "#111111", text: "#111111", sub: "#334155", sw: 2.5, radius: "16px 6px 14px 8px", shadow: "4px 4px 0 #111111", filter: "drop-shadow(3px 3px 0 #111111)", font: "Itim" }; break;
    case "luxury":  l = light
      ? { fill: "#fffdf5", stroke: "#b8962e", text: "#3b2f0b", sub: "#8a6d1f", sw: 1, radius: "2px", outline: "1px solid #b8962e", font: "Trirong", letter: "0.03em" }
      : { fill: "#111827", stroke: "#d4af37", text: "#f5e7b2", sub: "#d4af37", sw: 1, radius: "2px", outline: "1px solid #d4af37", font: "Trirong", letter: "0.04em" }; break;
    case "punk":    l = light
      ? { fill: "#fefce8", stroke: "#111111", text: "#111111", sub: "#422006", sw: 5, radius: "0", hazard: true, dash: "8 6", font: "Kanit", weight: 600 }
      : { fill: "#facc15", stroke: "#111111", text: "#111111", sub: "#422006", sw: 5, radius: "0", hazard: true, dash: "8 6", font: "Kanit", weight: 600, upper: true }; break;
    case "y2k":     l = { fill: light ? "#fdf2f8" : "#fbcfe8", stroke: "#a78bfa", text: "#6b21a8", sub: "#9333ea", sw: 2, radius: "999px", shadow: "0 0 0 3px #e0e7ff, 0 0 0 5px #c4b5fd", filter: "drop-shadow(0 0 4px #c4b5fd)", font: "Mitr" }; break;
    default:        l = { ...base, sw: 2 };
  }
  if (custom.fill) l.fill = custom.fill;
  if (custom.stroke) l.stroke = custom.stroke;
  return l;
}

/** เส้นเชื่อมตามสไตล์ของกระดาน (ข้อ 5) */
export const FLOW_STYLE_EDGE: Record<FlowStyleKey, { color: string; width: number; dash?: string }> = {
  normal:  { color: "#64748b", width: 1.75 },
  minimal: { color: "#94a3b8", width: 1 },
  comic:   { color: "#111111", width: 2.5 },
  luxury:  { color: "#b8962e", width: 1.25 },
  punk:    { color: "#111111", width: 3, dash: "10 5" },
  y2k:     { color: "#a78bfa", width: 2 },
};

/** CSS ของกล่องที่มีกรอบ (ใช้ทั้ง React style และสตริงตอนบันทึกเป็นรูป) · defRadius = มุมตามชนิดกล่อง */
export function flowStyleBoxCss(l: FlowStyleLook, defRadius: string): Record<string, string> {
  const css: Record<string, string> = { background: l.fill, color: l.text, "border-radius": l.radius && defRadius !== "999px" ? l.radius : defRadius };
  if (l.hazard) { css.border = `${l.sw}px solid transparent`; css["border-image"] = `repeating-linear-gradient(45deg, ${l.stroke} 0 8px, #facc15 8px 16px) ${l.sw}`; }
  else css.border = `${l.sw}px solid ${l.stroke}`;
  if (l.shadow) css["box-shadow"] = l.shadow;
  if (l.outline) { css.outline = l.outline; css["outline-offset"] = "3px"; }
  if (l.letter) css["letter-spacing"] = l.letter;
  if (l.upper) css["text-transform"] = "uppercase";
  return css;
}
