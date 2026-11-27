// ============================================================
// ตัวอักษรของธีมกลาง (ของกลาง · แผง "ตัวอักษร") — docs/erp-theme.md
//   THEME_FONTS = คลังฟอนต์ไทย 19 ตัว แบ่ง 4 กลุ่ม · LATIN_FONTS = ฟอนต์อังกฤษแยก 8 ตัว
//   ชื่อ+น้ำหนักต้องมีใน GOOGLE_FONTS (lib/website-theme) — เทสต์เช็กกันรายการเพี้ยนกัน
//   (ไม่ import ไฟล์นั้นตรง ๆ เพราะไฟล์ใหญ่ และตัวนี้โหลดทุกหน้า)
//   typeEffects = attr/ตัวแปร CSS ที่ ThemeApplier ใส่บน <html> · ค่าเริ่ม = ไม่มี attr = หน้าตาเดิม
// ไฟล์ pure — เทสต์ lib/__tests__/erp-theme-fonts.test.ts
// ============================================================

export type FontGroup = "read" | "formal" | "modern" | "fun";
export const FONT_GROUPS: { key: FontGroup; label: string }[] = [
  { key: "read", label: "อ่านง่าย" }, { key: "formal", label: "ทางการ / มีหัว" },
  { key: "modern", label: "ทันสมัย" }, { key: "fun", label: "น่ารัก / หัวข้อเด่น" },
];

export type ThemeFont = {
  key: string; label: string; family: string;
  /** ชื่อใน Google Fonts · null = ฝังมากับระบบแล้ว (ไม่ต้องโหลด) */
  google: string | null;
  weights: number[]; group: FontGroup;
};

const tf = (key: string, name: string, group: FontGroup, weights = [400, 500, 600, 700], label = name): ThemeFont =>
  ({ key, label, family: `'${name}'`, google: name, weights, group });

export const THEME_FONTS: ThemeFont[] = [
  { key: "inter-noto", label: "Noto Sans Thai (ค่าเริ่ม)", family: "'Inter','Noto Sans Thai'", google: null, weights: [400, 500, 600, 700], group: "read" },
  tf("anuphan", "Anuphan", "read"),
  tf("ibm-plex-thai", "IBM Plex Sans Thai", "read", undefined, "IBM Plex Thai"),
  tf("athiti", "Athiti", "read"),
  tf("sarabun", "Sarabun", "formal"),
  tf("niramit", "Niramit", "formal"),
  tf("krub", "Krub", "formal"),
  tf("pridi", "Pridi", "formal"),
  tf("trirong", "Trirong", "formal"),
  tf("noto-serif-thai", "Noto Serif Thai", "formal", undefined, "Noto Serif Thai"),
  tf("prompt", "Prompt", "modern"),
  tf("kanit", "Kanit", "modern"),
  tf("mitr", "Mitr", "modern"),
  tf("chakra-petch", "Chakra Petch", "modern"),
  tf("bai-jamjuree", "Bai Jamjuree", "modern"),
  tf("k2d", "K2D", "modern"),
  tf("mali", "Mali", "fun"),
  tf("itim", "Itim", "fun", [400]),
  tf("sriracha", "Sriracha", "fun", [400]),
];

/** ฟอนต์อังกฤษ+ตัวเลข (วางหน้าฟอนต์ไทย — ตัวไทยตกไปใช้ฟอนต์ไทยเอง) */
export const LATIN_FONTS: ThemeFont[] = [
  { ...tf("inter", "Inter", "read"), google: null },
  tf("poppins", "Poppins", "modern"),
  tf("montserrat", "Montserrat", "modern"),
  tf("dm-sans", "DM Sans", "read"),
  tf("lato", "Lato", "read", [400, 700]),
  tf("raleway", "Raleway", "modern"),
  tf("playfair", "Playfair Display", "formal", [400, 500, 600, 700], "Playfair (มีเชิง)"),
  tf("lora", "Lora", "formal", [400, 500, 600, 700], "Lora (มีเชิง)"),
];

/** คู่แนะนำ หัวข้อ + เนื้อหา */
export const FONT_PAIRS: { label: string; heading: string; body: string }[] = [
  { label: "Kanit + Sarabun", heading: "kanit", body: "sarabun" },
  { label: "Prompt + Anuphan", heading: "prompt", body: "anuphan" },
  { label: "Mitr + IBM Plex", heading: "mitr", body: "ibm-plex-thai" },
  { label: "Trirong + Sarabun", heading: "trirong", body: "sarabun" },
  { label: "Mali + Noto", heading: "mali", body: "inter-noto" },
];

export type LineHeight = "tight" | "normal" | "loose";
export type NumStyle = "same" | "tabular" | "mono";
export type FontWeightOpt = 500 | 600 | 700;

export type ThemeTypography = {
  /** ฟอนต์เนื้อหา (key ใน THEME_FONTS) */
  font: string;
  /** ฟอนต์หัวข้อ · null = เหมือนเนื้อหา */
  headingFont: string | null;
  /** ฟอนต์อังกฤษ+ตัวเลข · null = ตามฟอนต์ไทย */
  latinFont: string | null;
  /** ขนาดตัวอักษร 12–17 (14 = เดิม) */
  baseSize: number;
  headingWeight: FontWeightOpt;
  /** หัวข้อใหญ่กว่าเนื้อหากี่เท่า 1.1–2 · null = ขนาดเดิมของแต่ละหน้า */
  headingScale: number | null;
  lineHeight: LineHeight;
  numbers: NumStyle;
  /** ความหนาแยกจุด · null = เดิม */
  weights: { button: FontWeightOpt | null; tableHead: FontWeightOpt | null; menu: FontWeightOpt | null };
};

export const BASE_SIZE_MIN = 12, BASE_SIZE_MAX = 17, BASE_SIZE_DEFAULT = 14;
export const HSCALE_MIN = 1.1, HSCALE_MAX = 2;
export const LINE_HEIGHT: Record<LineHeight, number> = { tight: 1.3, normal: 1.5, loose: 1.75 };
const WEIGHTS = [500, 600, 700] as const;

export const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  font: "inter-noto", headingFont: null, latinFont: null, baseSize: BASE_SIZE_DEFAULT, headingWeight: 600,
  headingScale: null, lineHeight: "normal", numbers: "same", weights: { button: null, tableHead: null, menu: null },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fontKey = (v: unknown, list: ThemeFont[]) => (typeof v === "string" && list.some((f) => f.key === v) ? v : null);
const weight = (v: unknown): FontWeightOpt | null => (WEIGHTS.includes(v as FontWeightOpt) ? (v as FontWeightOpt) : null);
const clampNum = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
/** ขนาดหัวข้อแบบเก่า (chrome.headingSize) → เท่า */
const LEGACY_HSIZE: Record<string, number> = { sm: 1.3, lg: 1.7 };

export function normalizeTypography(raw: unknown, legacyHeadingSize?: unknown): ThemeTypography {
  const t = isObj(raw) ? raw : {};
  const w = isObj(t.weights) ? t.weights : {};
  const scale = t.headingScale === null ? null : clampNum(t.headingScale, HSCALE_MIN, HSCALE_MAX);
  const legacy = typeof legacyHeadingSize === "string" ? LEGACY_HSIZE[legacyHeadingSize] ?? null : null;
  return {
    font: fontKey(t.font, THEME_FONTS) ?? DEFAULT_TYPOGRAPHY.font,
    headingFont: fontKey(t.headingFont, THEME_FONTS),
    latinFont: fontKey(t.latinFont, LATIN_FONTS),
    baseSize: Math.round(clampNum(t.baseSize, BASE_SIZE_MIN, BASE_SIZE_MAX) ?? BASE_SIZE_DEFAULT),
    headingWeight: weight(t.headingWeight) ?? DEFAULT_TYPOGRAPHY.headingWeight,
    headingScale: scale !== null ? Math.round(scale * 10) / 10 : "headingScale" in t ? null : legacy,
    lineHeight: (["tight", "normal", "loose"] as const).includes(t.lineHeight as LineHeight) ? (t.lineHeight as LineHeight) : "normal",
    numbers: (["same", "tabular", "mono"] as const).includes(t.numbers as NumStyle) ? (t.numbers as NumStyle) : "same",
    weights: { button: weight(w.button), tableHead: weight(w.tableHead), menu: weight(w.menu) },
  };
}

export const themeFont = (key: string | null | undefined) => THEME_FONTS.find((f) => f.key === key) ?? THEME_FONTS[0];
export const latinFont = (key: string | null | undefined) => (key ? LATIN_FONTS.find((f) => f.key === key) ?? null : null);

/** font-family ทั้งชุด: [อังกฤษ] + ไทย + สำรอง */
export function fontStack(thaiKey: string, latinKey: string | null): string {
  const th = themeFont(thaiKey), la = latinFont(latinKey);
  const fam = la && la.key !== "inter" ? `${la.family},${th.family}` : la?.key === "inter" && th.key !== "inter-noto" ? `'Inter',${th.family}` : th.family;
  return `${fam},system-ui,sans-serif`;
}

const LOAD_WEIGHTS = [400, 500, 600, 700];
/** ลิงก์ Google Fonts ของฟอนต์ที่ใช้ (ข้ามตัวที่ฝังมากับระบบ) · weightsOnly = โหลดแค่น้ำหนักนี้ (การ์ดตัวอย่าง) */
export function fontsHref(fonts: (ThemeFont | null)[], weightsOnly?: number[]): string | null {
  const fams = [...new Map(fonts.filter((f): f is ThemeFont => !!f?.google).map((f) => [f.google, f])).values()];
  if (!fams.length) return null;
  return "https://fonts.googleapis.com/css2?" + fams.map((f) => {
    const ws = f.weights.filter((w) => (weightsOnly ?? LOAD_WEIGHTS).includes(w));
    return `family=${f.google!.replace(/ /g, "+")}:wght@${(ws.length ? ws : [f.weights[0]]).join(";")}`;
  }).join("&") + "&display=swap";
}

/** ฟอนต์ที่ธีมนี้ต้องโหลด */
export function typographyFonts(t: ThemeTypography): ThemeFont[] {
  return [themeFont(t.font), t.headingFont ? themeFont(t.headingFont) : null, latinFont(t.latinFont)].filter((f): f is ThemeFont => !!f);
}

/** น้ำหนักโหลดโดยประมาณ (KB) — ไทย ~25 KB/น้ำหนัก · อังกฤษ ~15 KB/น้ำหนัก (เบราว์เซอร์โหลดเฉพาะชุดตัวอักษรที่ใช้) */
export function fontLoadKb(t: ThemeTypography): number {
  const seen = new Set<string>();
  let kb = 0;
  for (const f of typographyFonts(t)) {
    if (!f.google || seen.has(f.key)) continue;
    seen.add(f.key);
    const n = f.weights.filter((w) => LOAD_WEIGHTS.includes(w)).length || 1;
    kb += n * (LATIN_FONTS.includes(f) ? 15 : 25);
  }
  return kb;
}
export const FONT_MID_KB = 120, FONT_HEAVY_KB = 220;

/** ขนาดหัวข้อ h1/h2/h3 (px) จากขนาดเนื้อหา × เท่า */
export function headingSizes(base: number, scale: number): [number, number, number] {
  const r = (x: number) => Math.round(x * 10) / 10;
  return [r(base * scale), r(base * (1 + (scale - 1) * 0.7)), r(base * (1 + (scale - 1) * 0.45))];
}

export const TYPE_ATTRS = ["tm-hfont", "tm-hweight", "tm-fsize", "tm-hscale", "tm-lh", "tm-num", "tm-wbtn", "tm-wth", "tm-wmenu"] as const;

/** attr + ตัวแปร CSS ของตัวอักษร (ฟอนต์เนื้อหา = --tm-font ใน themeCssVars เสมอ) */
export function typeEffects(t: ThemeTypography): { attrs: Record<string, string>; vars: Record<string, string> } {
  const attrs: Record<string, string> = {}, vars: Record<string, string> = {};
  if (t.headingFont && t.headingFont !== t.font) { attrs["tm-hfont"] = "1"; vars["--tm-font-heading"] = fontStack(t.headingFont, t.latinFont); }
  if (t.headingWeight !== 600) attrs["tm-hweight"] = String(t.headingWeight);
  if (t.baseSize !== BASE_SIZE_DEFAULT) { attrs["tm-fsize"] = String(t.baseSize); vars["--tm-fs-k"] = String(Math.round((t.baseSize / BASE_SIZE_DEFAULT) * 1000) / 1000); }
  if (t.headingScale !== null) {
    const [h1, h2, h3] = headingSizes(t.baseSize, t.headingScale);
    attrs["tm-hscale"] = "1";
    Object.assign(vars, { "--tm-h1": `${h1}px`, "--tm-h2": `${h2}px`, "--tm-h3": `${h3}px` });
  }
  if (t.lineHeight !== "normal") { attrs["tm-lh"] = t.lineHeight; vars["--tm-lh"] = String(LINE_HEIGHT[t.lineHeight]); }
  if (t.numbers !== "same") attrs["tm-num"] = t.numbers;
  if (t.weights.button) { attrs["tm-wbtn"] = "1"; vars["--tm-w-btn"] = String(t.weights.button); }
  if (t.weights.tableHead) { attrs["tm-wth"] = "1"; vars["--tm-w-th"] = String(t.weights.tableHead); }
  if (t.weights.menu) { attrs["tm-wmenu"] = "1"; vars["--tm-w-menu"] = String(t.weights.menu); }
  return { attrs, vars };
}
