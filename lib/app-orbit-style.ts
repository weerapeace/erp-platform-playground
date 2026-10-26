/**
 * ◎ ค่าหน้าตา/เอฟเฟกต์ของวงแอป (ของกลาง) — แอดมินตั้งค่ากลางทั้งทีม + แต่ละคนปรับของตัวเองได้ (ของคนนั้นใช้ก่อน)
 * (ไฟล์ pure ห้ามใส่ "use client" — เทสต์ import ได้)
 *
 *   ค่าที่ใช้จริง = ค่าเริ่มต้นในโค้ด ← ทับด้วยค่ากลางทีม ← ทับด้วยค่าของฉัน (ทับทีละช่อง: ปรับแค่ความเร็ว ช่องอื่นยังตามทีม)
 *   ค่ากลางทีม = ui_config key ORBIT_TEAM_KEY (ขึ้นต้น admin_ → แก้ได้เฉพาะ admin.users · มี audit setting_change)
 *   ค่าของฉัน  = user_ui_prefs key ORBIT_MINE_KEY (/api/user-prefs)
 *   เครื่องที่ตั้ง "ลดภาพเคลื่อนไหว" → ปิดหมุนเอง/หลบเมาส์/เอียงตามเมาส์/ลูกเล่นตอนเปิดเสมอ
 * ใช้ที่: components/app-orbit (วาด) · components/app-orbit/tuner (แผงปรับ) · app/apps/page.tsx (โหลด/บันทึก)
 */

export type OrbitMode = "ellipse" | "circle" | "ring" | "row" | "gallery";
export type OrbitIntro = "spin" | "burst" | "drop" | "none";
export type OrbitShape = "round" | "circle" | "portrait";
export type OrbitColor = "tint" | "solid" | "white";

export type OrbitStyle = {
  mode: OrbitMode;
  radius: number;    // ระยะห่างจากกลาง (%)
  tilt: number;      // ความเอียง 3 มิติ (องศา) — วงแหวน/แถวเอียง
  depth: number;     // ใกล้ใหญ่ไกลเล็ก (%) — วงแหวน
  spin: boolean;     // หมุนเอง (แกลเลอรี = เลื่อนเองจนกว่าจะมีคนกด)
  speed: number;     // 1–10
  dir: 1 | -1;       // 1 = ตามเข็ม
  pause: boolean;    // หยุดหมุนเมื่อชี้
  intro: OrbitIntro; // ลูกเล่นตอนเปิดหน้า
  push: boolean;     // การ์ดหลบเมาส์
  pushStr: number;   // แรงหลบ (px)
  pushR: number;     // ระยะหลบ (px)
  zoom: number;      // ขยายเมื่อชี้ (%)
  parallax: boolean; // ทั้งวงเอียงตามเมาส์
  size: number;      // ขนาดการ์ด (px)
  shape: OrbitShape;
  color: OrbitColor; // tint = สีอ่อนตาม theme_color แอป · solid = สีเต็ม · white = ขาวล้วน
  labels: boolean;   // ชื่อใต้การ์ด
};

export const ORBIT_TEAM_KEY = "admin_launcher_orbit";
export const ORBIT_MINE_KEY = "launcher_orbit";

/** ค่าเริ่มต้น = หน้าตาที่ขึ้นเว็บครั้งแรก (วงรี เรียบ ไม่หมุนเอง) */
export const ORBIT_DEFAULT: OrbitStyle = {
  mode: "ellipse", radius: 100, tilt: 60, depth: 40, spin: false, speed: 3, dir: 1, pause: true, intro: "spin",
  push: false, pushStr: 40, pushR: 110, zoom: 110, parallax: false, size: 60, shape: "round", color: "tint", labels: true,
};

/** ช่วงค่าตัวเลข (แผงปรับใช้ทำแถบเลื่อน · ตัวทำความสะอาดใช้ตัดค่าเกิน) */
export const ORBIT_RANGES = {
  radius: { min: 60, max: 100, step: 1, unit: "%" },
  tilt: { min: 0, max: 80, step: 1, unit: "°" },
  depth: { min: 0, max: 80, step: 1, unit: "%" },
  speed: { min: 1, max: 10, step: 1, unit: "" },
  pushStr: { min: 10, max: 90, step: 1, unit: "px" },
  pushR: { min: 60, max: 200, step: 5, unit: "px" },
  zoom: { min: 100, max: 150, step: 1, unit: "%" },
  size: { min: 40, max: 76, step: 1, unit: "px" },
} as const;
type RangeKey = keyof typeof ORBIT_RANGES;

const CHOICES = {
  mode: ["ellipse", "circle", "ring", "row", "gallery"],
  intro: ["spin", "burst", "drop", "none"],
  shape: ["round", "circle", "portrait"],
  color: ["tint", "solid", "white"],
} as const;
const BOOLS = ["spin", "pause", "push", "parallax", "labels"] as const;

/** ชุดสำเร็จรูป (เหมือนใน widget ที่เจ้าของลอง) */
export const ORBIT_PRESETS: { key: string; label: string; style: OrbitStyle }[] = [
  { key: "calm", label: "เรียบ ใช้งานจริง", style: { ...ORBIT_DEFAULT } },
  { key: "pin", label: "เหมือนภาพ Pinterest", style: { ...ORBIT_DEFAULT, mode: "circle", spin: true, speed: 3, push: true, pushStr: 55, pushR: 120, zoom: 112, shape: "portrait", labels: false, size: 54 } },
  { key: "fun", label: "สนุก 3 มิติ", style: { ...ORBIT_DEFAULT, mode: "ring", spin: true, speed: 5, push: true, pushStr: 45, pushR: 120, zoom: 130, parallax: true, shape: "circle", color: "solid", intro: "burst", depth: 55, tilt: 62 } },
];

/** เก็บเฉพาะช่องที่รู้จัก + ค่าถูกชนิด · ตัวเลขตัดให้อยู่ในช่วง · ค่าแปลก ๆ ทิ้ง (ไม่พังหน้า) */
export function cleanOrbitStyle(raw: unknown): Partial<OrbitStyle> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(ORBIT_RANGES) as RangeKey[]) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.min(ORBIT_RANGES[k].max, Math.max(ORBIT_RANGES[k].min, Math.round(v)));
  }
  for (const k of Object.keys(CHOICES) as (keyof typeof CHOICES)[]) {
    const v = r[k];
    if (typeof v === "string" && (CHOICES[k] as readonly string[]).includes(v)) out[k] = v;
  }
  for (const k of BOOLS) if (typeof r[k] === "boolean") out[k] = r[k];
  if (r.dir === 1 || r.dir === -1) out.dir = r.dir;
  return out as Partial<OrbitStyle>;
}

/** ค่าที่ใช้จริง: ค่าเริ่มต้น ← ค่ากลางทีม ← ค่าของฉัน (ทีละช่อง) · ลดภาพเคลื่อนไหว = ปิดของที่ขยับเอง */
export function resolveOrbitStyle(team: unknown, mine: unknown, reducedMotion = false): OrbitStyle {
  const s: OrbitStyle = { ...ORBIT_DEFAULT, ...cleanOrbitStyle(team), ...cleanOrbitStyle(mine) };
  return reducedMotion ? { ...s, spin: false, push: false, parallax: false, intro: "none" } : s;
}

/** ช่องที่ค่าของฉันต่างจากค่ากลาง (ไว้บอกว่า "ปรับเองกี่อย่าง") */
export function orbitOverrideCount(team: unknown, mine: unknown): number {
  const base: OrbitStyle = { ...ORBIT_DEFAULT, ...cleanOrbitStyle(team) };
  const m = cleanOrbitStyle(mine);
  return (Object.keys(m) as (keyof OrbitStyle)[]).filter((k) => m[k] !== base[k]).length;
}

/** ชุดสำเร็จรูปที่ตรงกับค่าปัจจุบันทุกช่อง (ไม่ตรง = null) */
export function matchOrbitPreset(s: OrbitStyle): string | null {
  return ORBIT_PRESETS.find((p) => (Object.keys(ORBIT_DEFAULT) as (keyof OrbitStyle)[]).every((k) => p.style[k] === s[k]))?.key ?? null;
}
