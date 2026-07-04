// ============================================================
// ชิปประเภทงาน (ของกลาง) — เรนเดอร์ชื่อประเภทงานเป็นชิปสี
//  • มีสี (color เป็น hex) → ชิปสีอ่อนของประเภทนั้น (+ emoji นำหน้าถ้ามี)
//  • ไม่มีสี → ชิป slate มาตรฐาน
// ป้ายชื่อ resolve จาก use-options (รวมประเภทที่ปิดใช้งานด้วย → งานเก่าไม่โชว์ code ดิบ)
// มิเรอร์ PlatformChip (task_type ไม่มีรูปไอคอน icon_key — มีแค่ emoji)
// ============================================================
import { taskTypeLabel, taskTypeMeta } from "./use-options";

const isHex = (c?: string | null): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c);

export function TaskTypeChip({ code, className = "" }: { code: string; className?: string }) {
  const meta = taskTypeMeta(code);
  const label = taskTypeLabel(code) || code;
  const color = isHex(meta?.color) ? meta!.color! : null;
  const emoji = meta?.icon || null;

  const style = color ? { backgroundColor: `${color}1a`, color, borderColor: `${color}55` } : undefined;
  const base = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border max-w-[120px]";
  const fallback = color ? "" : "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <span className={`${base} ${fallback} ${className}`} style={style} title={label}>
      {emoji && <span className="leading-none">{emoji}</span>}
      <span className="truncate">{label}</span>
    </span>
  );
}
