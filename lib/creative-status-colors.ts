// ============================================================
// ชุดสีสถานะ (pure) — เก็บเป็นคลาส literal เพื่อให้ Tailwind ไม่ purge
// DB เก็บแค่ชื่อสี (เช่น 'violet') แล้ว map เป็นคลาสที่นี่
// ============================================================
export type StatusColorClasses = { cls: string; dot: string };

export const STATUS_COLORS: Record<string, StatusColorClasses> = {
  slate:   { cls: "bg-slate-50 text-slate-600 border-slate-200",     dot: "bg-slate-400" },
  gray:    { cls: "bg-gray-50 text-gray-600 border-gray-200",        dot: "bg-gray-400" },
  red:     { cls: "bg-red-50 text-red-700 border-red-200",           dot: "bg-red-500" },
  orange:  { cls: "bg-orange-50 text-orange-700 border-orange-200",  dot: "bg-orange-500" },
  amber:   { cls: "bg-amber-50 text-amber-700 border-amber-200",     dot: "bg-amber-500" },
  yellow:  { cls: "bg-yellow-50 text-yellow-700 border-yellow-200",  dot: "bg-yellow-500" },
  lime:    { cls: "bg-lime-50 text-lime-700 border-lime-200",        dot: "bg-lime-500" },
  green:   { cls: "bg-green-50 text-green-700 border-green-200",     dot: "bg-green-500" },
  emerald: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  teal:    { cls: "bg-teal-50 text-teal-700 border-teal-200",        dot: "bg-teal-500" },
  cyan:    { cls: "bg-cyan-50 text-cyan-700 border-cyan-200",        dot: "bg-cyan-500" },
  sky:     { cls: "bg-sky-50 text-sky-700 border-sky-200",           dot: "bg-sky-500" },
  blue:    { cls: "bg-blue-50 text-blue-700 border-blue-200",        dot: "bg-blue-500" },
  indigo:  { cls: "bg-indigo-50 text-indigo-700 border-indigo-200",  dot: "bg-indigo-500" },
  violet:  { cls: "bg-violet-50 text-violet-700 border-violet-200",  dot: "bg-violet-500" },
  purple:  { cls: "bg-purple-50 text-purple-700 border-purple-200",  dot: "bg-purple-500" },
  fuchsia: { cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", dot: "bg-fuchsia-500" },
  pink:    { cls: "bg-pink-50 text-pink-700 border-pink-200",        dot: "bg-pink-500" },
  rose:    { cls: "bg-rose-50 text-rose-700 border-rose-200",        dot: "bg-rose-500" },
};

export const STATUS_COLOR_OPTIONS = Object.keys(STATUS_COLORS);
export function statusColor(color?: string | null): StatusColorClasses {
  return STATUS_COLORS[color ?? "slate"] ?? STATUS_COLORS.slate;
}
