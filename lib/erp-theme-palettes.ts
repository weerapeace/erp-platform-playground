// ============================================================
// ชุดสี + สีที่เข้ากัน + ดูดหลายสีจากรูป (ธีมกลาง · แผงสีแบบ A · 2026-11-26)
//   COLOR_SETS = ชุดสีสำเร็จรูป 16 ชุด (สีหลัก + สีรอง + สีที่ 2 ของไล่สี)
//   harmonyColors = สีรองที่เข้ากับสีหลัก 3 แบบ (ตรงข้าม · ใกล้เคียง · โทนเดียว)
//   swatchesFromPixels = ดูดสีเด่นจากรูป N สี (โทนไม่ซ้ำกัน)
//   PART_COLORS = สีแยกทีละส่วน (แถบบน · เมนูข้าง · พื้นหลังหน้า · หัวข้อ · ลิงก์ · เส้นขอบ)
// ไฟล์ pure — เทสต์ lib/__tests__/erp-theme-palettes.test.ts
// ============================================================
import type { ColorParts } from "./erp-theme-config";

export type ColorSet = { key: string; name: string; primary: string; accent: string; color2: string };

export const COLOR_SETS: ColorSet[] = [
  { key: "orange", name: "ส้มคลาสสิก", primary: "#f97316", accent: "#8b5cf6", color2: "#d97706" },
  { key: "ocean", name: "น้ำทะเล", primary: "#0e7490", accent: "#0284c7", color2: "#0891b2" },
  { key: "violet", name: "ม่วงชมพู", primary: "#7c3aed", accent: "#db2777", color2: "#be185d" },
  { key: "forest", name: "เขียวป่า", primary: "#15803d", accent: "#65a30d", color2: "#a16207" },
  { key: "gold", name: "ดำทอง", primary: "#292524", accent: "#a16207", color2: "#a16207" },
  { key: "sakura", name: "ซากุระ", primary: "#db2777", accent: "#e11d48", color2: "#be185d" },
  { key: "navy", name: "น้ำเงินกรม", primary: "#1e40af", accent: "#4f46e5", color2: "#0369a1" },
  { key: "brick", name: "อิฐ", primary: "#9a3412", accent: "#78716c", color2: "#c2410c" },
  { key: "mint", name: "มินต์", primary: "#0d9488", accent: "#0891b2", color2: "#047857" },
  { key: "lavender", name: "ลาเวนเดอร์", primary: "#6d28d9", accent: "#7c3aed", color2: "#a21caf" },
  { key: "desert", name: "ทะเลทราย", primary: "#b45309", accent: "#a16207", color2: "#92400e" },
  { key: "berry", name: "สตรอว์เบอร์รี", primary: "#e11d48", accent: "#db2777", color2: "#be123c" },
  { key: "sky", name: "ฟ้าใส", primary: "#0284c7", accent: "#0891b2", color2: "#2563eb" },
  { key: "olive", name: "มะกอก", primary: "#4d7c0f", accent: "#65a30d", color2: "#3f6212" },
  { key: "slate", name: "เทาเรียบ", primary: "#334155", accent: "#0f766e", color2: "#475569" },
  { key: "copper", name: "ทองแดง", primary: "#c2410c", accent: "#b91c1c", color2: "#9a3412" },
];

/** ชุดสีที่ตรงกับค่าปัจจุบัน (null = กำหนดเอง) */
export function currentColorSet(c: { primary: string; accent: string }): string | null {
  return COLOR_SETS.find((s) => s.primary === c.primary.toLowerCase() && s.accent === c.accent.toLowerCase())?.key ?? null;
}

// ── HSL ─────────────────────────────────────────────
export function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  const R = ((n >> 16) & 255) / 255, G = ((n >> 8) & 255) / 255, B = (n & 255) / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}
export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360, ss = Math.min(1, Math.max(0, s)), ll = Math.min(1, Math.max(0, l));
  const k = (n: number) => (n + hh / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** สีรองที่เข้ากับสีหลัก — ความสว่างอยู่ช่วงกลาง ให้ปุ่ม/แท็บตัวหนังสือขาวยังอ่านออก */
export function harmonyColors(primary: string): { key: "complement" | "analogous" | "mono"; label: string; color: string }[] {
  const [h, s, l] = hexToHsl(primary);
  const mid = Math.min(0.5, Math.max(0.36, l));
  const sat = Math.max(0.45, s);
  return [
    { key: "complement", label: "ตรงข้าม", color: hslToHex(h + 180, sat, mid) },
    { key: "analogous", label: "ใกล้เคียง", color: hslToHex(h + 35, sat, mid) },
    { key: "mono", label: "โทนเดียว", color: hslToHex(h, Math.max(0.3, s * 0.7), Math.max(0.3, mid - 0.1)) },
  ];
}

/** ดูดสีเด่นจากพิกเซลรูป (RGBA เรียงกัน) — คืนไม่เกิน n สี เรียงจากเจอบ่อย · โทนต่างกันอย่างน้อย 25° (ไม่พอค่อยเติมสีใกล้กัน) */
export function swatchesFromPixels(data: ArrayLike<number>, n = 5): string[] {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number; h: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    const [h, s, l] = hexToHsl(hex);
    if (s < 0.2 || l < 0.12 || l > 0.9) continue;
    const k = `${r >> 4},${g >> 4},${b >> 4}`;
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0, h };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(k, e);
  }
  const list = [...buckets.values()].sort((x, y) => y.n - x.n);
  const gap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const picked: typeof list = [];
  for (const e of list) { if (picked.length >= n) break; if (picked.every((p) => gap(p.h, e.h) >= 25)) picked.push(e); }
  for (const e of list) { if (picked.length >= n) break; if (!picked.includes(e)) picked.push(e); }
  return picked.map((e) => `#${[e.r / e.n, e.g / e.n, e.b / e.n].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`);
}

// ── สีแยกทีละส่วน ───────────────────────────────────────
export type ColorPartKey = keyof ColorParts;
export const PART_COLORS: { key: ColorPartKey; label: string; hint: string; suggest: string }[] = [
  { key: "topbar", label: "แถบบน", hint: "แถบบนสุด (มือถือ) และหัวเมนูข้าง (PC) · ตัวหนังสือเปลี่ยนขาว/ดำให้เองตามความเข้ม", suggest: "#1e293b" },
  { key: "sidebar", label: "เมนูข้าง", hint: "พื้นเมนูซ้าย · สีเข้ม = ตัวหนังสือขาว · สีอ่อน = ตัวหนังสือเดิม", suggest: "#f1f5f9" },
  { key: "page", label: "พื้นหลังหน้า", hint: "สีพื้นด้านหลังการ์ดและตาราง · ควรเป็นสีอ่อน", suggest: "#f8fafc" },
  { key: "heading", label: "หัวข้อ", hint: "ตัวหนังสือหัวข้อ (ชื่อหน้า ชื่อกล่อง)", suggest: "#0f172a" },
  { key: "link", label: "ลิงก์", hint: "ตัวหนังสือที่กดได้ เช่น เลขเอกสาร", suggest: "#2563eb" },
  { key: "border", label: "เส้นขอบ", hint: "เส้นขอบกล่อง ตาราง และเส้นแบ่ง (สีเทาเดิม)", suggest: "#e2e8f0" },
];
