/**
 * 🎞️ ภาพเคลื่อนไหวสอน — รายการคลังสำเร็จรูป + ตรวจค่า (ไม่มี React · ใช้ได้ทั้งหน้าเว็บและ API)
 *   ตัววาดจริงอยู่ components/lesson-anim (แต่ละ key = ฉากที่กดเล่นได้)
 *   แบบเฉพาะเรื่อง (custom) = HTML/SVG ที่ Claude เขียนตอนสรุปลิงก์ → แสดงใน iframe sandbox (ไม่มี same-origin แตะระบบไม่ได้)
 * คู่มือ docs/learning-center.md
 */

export type LessonAnimation =
  | { type: "preset"; key: string }
  | { type: "custom"; html: string; height: number };

export type AnimPresetMeta = { key: string; label: string; group: string; hint: string };

/** คลังสำเร็จรูป — เพิ่มฉากใหม่: เพิ่มที่นี่ + ตัววาดใน components/lesson-anim/presets.tsx */
export const ANIM_PRESETS: AnimPresetMeta[] = [
  { key: "light-mood", label: "แสงกำหนดอารมณ์ภาพ", group: "แสง", hint: "สลับ สดใส / ดราม่า" },
  { key: "light-sources", label: "แสงมีกี่แบบ", group: "แสง", hint: "แดด · ไฟในเฟรม · ไฟที่มีอยู่แล้ว" },
  { key: "light-falloff", label: "แสงจางตามระยะ", group: "แสง", hint: "ลากไฟออกห่าง แสงเหลือกี่ %" },
  { key: "color-temp", label: "สีของแสง (เคลวิน)", group: "แสง", hint: "ลาก 2700K → 6500K" },
  { key: "iso-noise", label: "ISO กับเม็ดหยาบ", group: "กล้อง", hint: "ดัน ISO ภาพสว่างแต่หยาบ" },
  { key: "key-contrast", label: "High-key / Low-key", group: "แสง", hint: "ความต่างแสงกับเงา" },
  { key: "hard-soft", label: "แสงแข็ง vs แสงนุ่ม", group: "แสง", hint: "ลากความนุ่ม ดูเงา" },
  { key: "light-position", label: "ตำแหน่งไฟ (Broad / Short)", group: "แสง", hint: "ส่องด้านไหนของหน้า" },
  { key: "light-types", label: "ชนิดของไฟ", group: "อุปกรณ์", hint: "ทังสเตน · HMI · LED" },
  { key: "histogram", label: "อ่าน Histogram", group: "กล้อง", hint: "ค่าแสงเกิน/ขาด กราฟชนขอบ" },
  { key: "diffusion", label: "ทำแสงให้นุ่ม (ซอฟต์บ็อกซ์)", group: "อุปกรณ์", hint: "ใส่/ไม่ใส่ตัวกระจายแสง" },
  { key: "flag", label: "บังแสงด้วย Flag", group: "อุปกรณ์", hint: "กันแสงหกโดนฉากหลัง" },
];

export const ANIM_KEYS = new Set(ANIM_PRESETS.map((p) => p.key));
export const animPreset = (key: string) => ANIM_PRESETS.find((p) => p.key === key) ?? null;

const CUSTOM_MAX = 60_000;

/** ตรวจค่าภาพเคลื่อนไหว · ผิด/ว่าง = null (ไม่มีภาพ) */
export function cleanAnimation(v: unknown): LessonAnimation | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.type === "preset") {
    const key = String(o.key ?? "");
    return ANIM_KEYS.has(key) ? { type: "preset", key } : null;
  }
  if (o.type === "custom") {
    const html = String(o.html ?? "").trim();
    if (!html || html.length > CUSTOM_MAX) return null;
    const h = Math.round(Number(o.height));
    return { type: "custom", html, height: Number.isFinite(h) ? Math.min(900, Math.max(120, h)) : 300 };
  }
  return null;
}

/** ข้อความสั้นสำหรับ audit / รายการ */
export function animLabel(a: LessonAnimation | null | undefined): string | null {
  if (!a) return null;
  return a.type === "preset" ? (animPreset(a.key)?.label ?? a.key) : "ภาพเฉพาะเรื่อง";
}
