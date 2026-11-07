/**
 * ↔ SplitPanes (กล่องแบ่งซ้าย-ขวาดันกันได้) — ส่วน pure: ชนิด + ตรวจค่าที่จำไว้ + คิดขนาดแต่ละฝั่ง
 * หน้าจอ: components/split-panes · เทสต์: lib/__tests__/split-panes.test.ts · คู่มือ: docs/split-panes.md
 */
export type SplitSide = "left" | "right";
export type SplitMode = "push" | "fold";
/** ขนาดที่กล่องได้ตอนนี้: half = ครึ่ง-ครึ่ง · wide = กำลังขยาย · narrow = ถูกดันให้แคบ · rail = ถูกพับเหลือแถบ · stack = เรียงบน-ล่าง (ที่แคบ) */
export type SplitSize = "half" | "wide" | "narrow" | "rail" | "stack";
export type SplitState = { focus: SplitSide | null; mode: SplitMode };

/** ค่าที่จำไว้ (user_ui_prefs) → สถานะ · ผิดรูป = null (ใช้ค่าตั้งต้น) */
export function parseSplitState(v: unknown): SplitState | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return { focus: o.focus === "left" || o.focus === "right" ? o.focus : null, mode: o.mode === "fold" ? "fold" : "push" };
}

/** ขนาดของแต่ละฝั่ง — split = กล่องแม่กว้างพอแบ่งซ้ายขวา */
export function splitSizeOf(side: SplitSide, st: SplitState, split: boolean): SplitSize {
  if (!split) return "stack";
  if (st.focus == null) return "half";
  if (st.focus === side) return "wide";
  return st.mode === "fold" ? "rail" : "narrow";
}

/** ค่า CSS flex ของฝั่งนั้น (ratio = ฝั่งที่ขยายกว้างกี่เท่าของอีกฝั่ง) */
export function splitFlexOf(size: SplitSize, ratio = 2): string | undefined {
  if (size === "stack") return undefined;
  if (size === "rail") return "0 0 44px";
  return size === "wide" ? `${ratio} 1 0px` : "1 1 0px";
}
