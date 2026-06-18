/** ของใช้ร่วมของ carton-labels API (แยกจาก route.ts) */
import type { CartonItem } from "./route";

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// แปลง body → คอลัมน์ที่อนุญาต (กันยัดคอลัมน์มั่ว)
export function cleanCartons(v: unknown): CartonItem[] {
  if (!Array.isArray(v)) return [];
  return v.map((c) => ({ qty: n((c as Record<string, unknown>)?.qty) })).filter((c) => c.qty >= 0);
}
