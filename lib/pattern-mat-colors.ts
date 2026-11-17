/**
 * 🎨 สีวัสดุบนกระดานแพทเทิร์น + ขนาดตัวหนังสือให้พอดีชิ้น (เจ้าของขอ 2026-11-17)
 *   boardMatColors = วัสดุละสี: สีที่ตั้งไว้ในวัสดุ (matProps.color — สีเดียวกับภาพ 3D) ก่อน · ยังไม่ตั้ง = ระบบให้สีจากชื่อ (ชุดสี NAME_COLOR_PALETTE)
 *     ชื่อเดิมได้สีเดิมเสมอ · ถ้าสีชนกับวัสดุอื่นบนกระดานเดียวกัน เลื่อนไปสีถัดไป (กระดานเดียวกันไม่มี 2 วัสดุสีเดียวกัน จนกว่าเกิน 10 วัสดุ)
 *   fitFontSize = ย่อตัวหนังสือให้ไม่ล้นกว้างชิ้น (นับสระบน/ล่าง/วรรณยุกต์ไทยเป็นศูนย์ เพราะไม่กินที่ด้านกว้าง)
 *   ใช้: components/pattern-sheet/shape-editor (ป้ายวัสดุบนชิ้น + ป้ายบอกสี) · เทสต์ lib/__tests__/pattern-mat-colors.test.ts
 */
import { NAME_COLOR_PALETTE, type DeptColor } from "@/lib/dept-color";

export type MatColor = DeptColor;

const HEX = /^#([0-9a-f]{6})$/i;
const mix = (hex: string, toward: number, f: number) => {
  const n = parseInt(hex.slice(1), 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (toward - c) * f));
  return "#" + ch.map((c) => c.toString(16).padStart(2, "0")).join("");
};

/** สีที่ผู้ใช้ตั้งเอง (hex) → ชุด จุด/พื้น/ขอบ/ตัวหนังสือ */
export function colorFromHex(hex: string): MatColor {
  return { dot: hex, bg: mix(hex, 255, 0.86), border: mix(hex, 255, 0.55), text: mix(hex, 0, 0.45) };
}

function nameHash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

/** วัสดุทุกตัวบนกระดาน (ตามลำดับที่เจอ) → สีของแต่ละ id */
export function boardMatColors(mats: { id: string; name: string }[], matProps?: Record<string, { color?: string | null } | undefined> | null): Record<string, MatColor> {
  const out: Record<string, MatColor> = {}, used = new Set<number>();
  const auto: { id: string; name: string }[] = [];
  for (const m of mats) {
    if (out[m.id] || auto.some((a) => a.id === m.id)) continue;
    const c = matProps?.[m.id]?.color;
    if (c && HEX.test(c)) out[m.id] = colorFromHex(c);
    else auto.push(m);
  }
  const N = NAME_COLOR_PALETTE.length;
  for (const m of auto) {
    let k = nameHash(m.name.trim().toLowerCase() || m.id) % N;
    for (let s = 0; s < N && used.has(k); s++) k = (k + 1) % N;
    used.add(k); out[m.id] = NAME_COLOR_PALETTE[k];
  }
  return out;
}

const THAI_MARK = /[ัิ-ฺ็-๎]/g;
/** ขนาดตัวหนังสือที่ไม่ล้นความกว้าง width (หน่วยเดียวกับ base) · ไม่เล็กกว่า base × minRatio */
export function fitFontSize(text: string, width: number, base: number, minRatio = 0.35): number {
  const n = text.replace(THAI_MARK, "").length;
  if (!n || !(width > 0)) return base;
  return Math.max(base * minRatio, Math.min(base, (width * 0.9) / (n * 0.58)));
}
