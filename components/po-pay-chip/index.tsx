/**
 * ของกลาง: ป้ายสถานะจ่ายเงินของใบสั่งซื้อ — สีตามกติกา lib/po-pay-state (ข้อมูลคิดฝั่ง server แล้วส่งมาเป็น { state, label })
 *   แดง = ยังไม่จ่าย (ร้านไม่มีเครดิต) · แดงเข้ม = เลยกำหนดจ่าย · เหลือง = ลงบิลแล้ว รอโอน · ส้ม = ค้างจ่าย (ร้านเครดิต) · เขียว = จ่ายแล้ว
 * ใช้ที่: หน้ารับสินค้าเข้า · หน้าสั่งซื้อ โหมดรับของ · รายการ PO · ป๊อปใบสั่งซื้อ (PoDetailModal)
 * คลาส Tailwind ต้องเป็นตัวหนังสือตรง ๆ ในไฟล์นี้ (ระบบ override "blue" = ส้ม → ใช้ orange/amber/rose/emerald ตรง ๆ)
 */
import type { PoPayState, PoPayStateKey } from "@/lib/po-pay-state";

export const PO_PAY_CLS: Record<PoPayStateKey, string> = {
  unpaid:     "bg-rose-50 text-rose-700 border-rose-200",
  overdue:    "bg-rose-100 text-rose-800 border-rose-400 font-semibold",
  billed:     "bg-amber-50 text-amber-800 border-amber-300",
  credit_due: "bg-orange-50 text-orange-700 border-orange-300",
  paid:       "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const DOT: Record<PoPayStateKey, string> = {
  unpaid: "bg-rose-500", overdue: "bg-rose-700", billed: "bg-amber-400", credit_due: "bg-orange-500", paid: "bg-emerald-500",
};

export function PoPayChip({ pay, className = "" }: { pay: Pick<PoPayState, "state" | "label"> | null | undefined; className?: string }) {
  if (!pay) return null;
  return (
    <span className={`inline-flex items-center gap-1 max-w-full truncate text-[11px] font-medium px-1.5 py-0.5 rounded border ${PO_PAY_CLS[pay.state]} ${className}`} title={pay.label}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[pay.state]}`} />
      <span className="truncate">{pay.label}</span>
    </span>
  );
}
