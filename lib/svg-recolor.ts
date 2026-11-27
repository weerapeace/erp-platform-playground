// ============================================================
// เปลี่ยนสีไฟล์เวกเตอร์ (SVG) — ของกลาง (pure · ใช้ได้ทั้งเบราว์เซอร์และเซิร์ฟเวอร์ · เทสต์ lib/__tests__/svg-recolor.test.ts)
//   listSvgColors  = สีทั้งหมดในไฟล์ (fill / stroke / stop-color · ทั้งแบบ attribute และใน style) เรียงตามที่ใช้บ่อย
//   recolorSvg     = แทนสีตามแผนที่ {"#e24b4a": "#1d9e75"}
//   colorMapParam  = แผนที่ ↔ ข้อความสั้นในลิงก์ (e24b4a-1d9e75.791f1f-085041)
//   sanitizeSvg    = ตัด <script> / on*= / ลิงก์ javascript: ออก (ไฟล์ที่ผู้ใช้โยนมา)
// ใช้กับ: หน้าต่างเปลี่ยนสีในคลังไฟล์ (components/asset-recolor) · ตัวออกแบบการ์ด · /api/assets/vector
// ============================================================

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00",
  orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", gray: "#808080", grey: "#808080", brown: "#a52a2a",
  navy: "#000080", teal: "#008080", silver: "#c0c0c0", maroon: "#800000", lime: "#00ff00", aqua: "#00ffff",
  cyan: "#00ffff", magenta: "#ff00ff", fuchsia: "#ff00ff", olive: "#808000", gold: "#ffd700",
};

/** สีหนึ่งค่า → #rrggbb (ตัวเล็ก) · ไม่ใช่สี (none / url(#..) / currentColor) = null */
export function normColor(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return "#" + m[1].split("").map((c) => c + c).join("");
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s);
  if (m) return "#" + m[1];
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/.exec(s);
  if (m) {
    const ch = (x: string) => Math.max(0, Math.min(255, Math.round(x.endsWith("%") ? parseFloat(x) * 2.55 : parseFloat(x))));
    return "#" + [m[1], m[2], m[3]].map((x) => ch(x).toString(16).padStart(2, "0")).join("");
  }
  return NAMED[s] ?? null;
}

// สีในไฟล์ปรากฏได้ 2 แบบ: fill="#abc" (attribute) · style="fill:#abc;stroke:red"
const ATTR_RE = /\b(fill|stroke|stop-color|color|flood-color|lighting-color)\s*=\s*(["'])([^"']*)\2/gi;
const PROP_RE = /(^|[;{\s"'])(fill|stroke|stop-color|color|flood-color|lighting-color)\s*:\s*([^;}"']+)/gi;

/** สีทั้งหมดในไฟล์ (ไม่ซ้ำ) เรียงตามจำนวนครั้งที่ใช้ มาก → น้อย */
export function listSvgColors(svg: string): { color: string; count: number }[] {
  const counts = new Map<string, number>();
  const add = (raw: string) => { const c = normColor(raw); if (c) counts.set(c, (counts.get(c) ?? 0) + 1); };
  for (const m of svg.matchAll(ATTR_RE)) add(m[3]);
  for (const m of svg.matchAll(PROP_RE)) add(m[3]);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color, count]) => ({ color, count }));
}

/** แทนสีตามแผนที่ (คีย์/ค่า = #rrggbb) · สีที่ไม่อยู่ในแผนที่คงเดิม */
export function recolorSvg(svg: string, map: Record<string, string>): string {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(map)) { const a = normColor(k), b = normColor(v); if (a && b && a !== b) m.set(a, b); }
  if (!m.size) return svg;
  const swap = (raw: string) => { const c = normColor(raw); return c && m.has(c) ? m.get(c)! : raw; };
  return svg
    .replace(ATTR_RE, (all, name: string, q: string, val: string) => `${name}=${q}${swap(val)}${q}`)
    .replace(PROP_RE, (all, pre: string, name: string, val: string) => {
      const tail = /\s*$/.exec(val)?.[0] ?? "";
      return `${pre}${name}:${swap(val.trim())}${tail}`;
    });
}

/** แผนที่สี → ข้อความสั้น "e24b4a-1d9e75.791f1f-085041" (ใส่ในลิงก์ได้) · ข้ามคู่ที่ไม่ถูกต้อง · สูงสุด 32 คู่ */
export function colorMapParam(map: Record<string, string>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(map)) {
    const a = normColor(k), b = normColor(v);
    if (a && b && a !== b) out.push(`${a.slice(1)}-${b.slice(1)}`);
    if (out.length >= 32) break;
  }
  return out.join(".");
}
export function parseColorMapParam(p: string | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const pair of String(p ?? "").split(".").slice(0, 32)) {
    const m = /^([0-9a-f]{6})-([0-9a-f]{6})$/i.exec(pair.trim());
    if (m) map["#" + m[1].toLowerCase()] = "#" + m[2].toLowerCase();
  }
  return map;
}
/** ทำความสะอาดแผนที่สีที่มาจากข้อมูลที่บันทึก (การ์ด ฯลฯ) */
export function cleanColorMap(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const map = parseColorMapParam(colorMapParam(v as Record<string, string>));
  return Object.keys(map).length ? map : undefined;
}

/** ตัดของอันตรายออกจากไฟล์ SVG ที่ผู้ใช้โยนมา (สคริปต์ · on*= · javascript: · foreignObject) */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}

/** key ไฟล์เวกเตอร์ในที่เก็บ (กันขอไฟล์อื่น) */
export const VECTOR_KEY_RE = /^library\/[\w.\-]{1,120}-vec\.svg$/;
/** ลิงก์ไฟล์เวกเตอร์ (เปลี่ยนสีแล้ว) — ใช้ใน <img> ได้ (ไม่ต้องล็อกอิน · เหมือนรูปในคลัง) */
export function vectorUrl(key: string, map?: Record<string, string> | null): string {
  const c = map ? colorMapParam(map) : "";
  return `/api/assets/vector?key=${encodeURIComponent(key)}${c ? `&c=${c}` : ""}`;
}
