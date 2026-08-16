/**
 * สีประจำแผนก/โต๊ะ — ของกลาง
 *
 * ใช้ทำให้ "งานของโต๊ะไหน" ดูออกด้วยสีตั้งแต่แวบแรก (ปฏิทิน, การ์ด, ตัวกรอง)
 * โดยไม่ต้องให้ใครไปนั่งตั้งค่าสีทีละแผนกก่อน — สีคิดจากชื่อแผนก จึงคงที่เสมอ
 * (ชื่อเดิม = สีเดิมทุกหน้า ทุกเครื่อง ทุกครั้งที่เปิด)
 *
 * ใช้:
 *   const c = deptColor("เย็บ");
 *   <span style={{ background: c.bg, borderColor: c.border, color: c.text }} />
 *   <i style={{ background: c.dot }} />           // จุดสีเล็ก ๆ
 *
 * ถ้าวันหนึ่งอยากให้ตั้งสีเองได้ ให้เพิ่มคอลัมน์ departments.color แล้วส่งเข้ามาแทนค่าจากที่นี่
 */
export type DeptColor = { dot: string; bg: string; border: string; text: string };

const PALETTE: DeptColor[] = [
  { dot: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", text: "#4338ca" },   // indigo
  { dot: "#10b981", bg: "#ecfdf5", border: "#a7f3d0", text: "#047857" },   // emerald
  { dot: "#f59e0b", bg: "#fffbeb", border: "#fde68a", text: "#b45309" },   // amber
  { dot: "#f43f5e", bg: "#fff1f2", border: "#fecdd3", text: "#be123c" },   // rose
  { dot: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1" },   // sky
  { dot: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9" },   // violet
  { dot: "#14b8a6", bg: "#f0fdfa", border: "#99f6e4", text: "#0f766e" },   // teal
  { dot: "#f97316", bg: "#fff7ed", border: "#fed7aa", text: "#c2410c" },   // orange
  { dot: "#65a30d", bg: "#f7fee7", border: "#d9f99d", text: "#4d7c0f" },   // lime
  { dot: "#d946ef", bg: "#fdf4ff", border: "#f5d0fe", text: "#a21caf" },   // fuchsia
];

// ยังไม่ระบุแผนก = เทา (ไม่กินสีของแผนกจริง)
const NONE: DeptColor = { dot: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0", text: "#64748b" };

export function deptColor(name: string | null | undefined): DeptColor {
  const key = (name ?? "").trim();
  if (!key) return NONE;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
