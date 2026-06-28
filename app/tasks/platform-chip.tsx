// ============================================================
// ชิปแพลตฟอร์ม (ของกลาง) — เรนเดอร์ชื่อแพลตฟอร์มเป็นชิป
//  • มีรูปไอคอน (icon_key) → โชว์รูป + ชื่อ
//  • มีสี (color เป็น hex) → ชิปสีอ่อนของแพลตฟอร์มนั้น (+ emoji นำหน้าถ้ามี)
//  • ไม่มีอะไร → ชิป slate มาตรฐาน
// ใช้ที่ task-detail-drawer ก่อน; ที่อื่น (การ์ด/คิว/คานบัน) ค่อยเปลี่ยนมาใช้ตัวนี้ได้
// ============================================================
import { r2ImageUrl } from "@/lib/r2-image";
import { platformLabel, platformMeta } from "./use-options";

const isHex = (c?: string | null): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c);

export function PlatformChip({ code }: { code: string }) {
  const meta = platformMeta(code);
  const label = platformLabel(code) || code;
  const img = meta?.icon_key ? r2ImageUrl(meta.icon_key, 32) : null;
  const color = isHex(meta?.color) ? meta!.color! : null;
  const emoji = meta?.icon || null;

  // ชิปสีอ่อนจากสีแพลตฟอร์ม (พื้น ~10%, ขอบ ~33%, ตัวอักษรสีเข้ม)
  const style = color ? { backgroundColor: `${color}1a`, color, borderColor: `${color}55` } : undefined;
  const base = "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border";
  const fallback = color ? "" : "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <span className={`${base} ${fallback}`} style={style}>
      {img
        ? <img src={img} alt="" className="h-3.5 w-3.5 rounded-sm object-contain" />
        : emoji ? <span className="leading-none">{emoji}</span> : null}
      {label}
    </span>
  );
}
