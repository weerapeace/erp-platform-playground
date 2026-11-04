/**
 * ของกลาง: ป้ายสถานะจ่ายเงินของใบสั่งซื้อ — สีตามกติกา lib/po-pay-state (ข้อมูลคิดฝั่ง server แล้วส่งมาเป็น { state, label })
 *   แดง = ยังไม่จ่าย (ร้านไม่มีเครดิต) · แดงเข้ม = เลยกำหนดจ่าย · เหลือง = ลงบิลแล้ว รอโอน · ส้ม = ค้างจ่าย (ร้านเครดิต) · เขียว = จ่ายแล้ว
 * ใช้ที่: หน้ารับสินค้าเข้า · หน้าสั่งซื้อ โหมดรับของ · รายการ PO · ป๊อปใบสั่งซื้อ (PoDetailModal)
 * PoPayFilterBar = แถบชิปกรอง ยังไม่จ่าย / ลงบิลแล้ว รอโอน / ค้างจ่าย (เครดิต) / จ่ายแล้ว (นับจำนวนให้) — หน้ารับสินค้าเข้า + หน้าสั่งซื้อโหมดรับของ
 * คลาส Tailwind ต้องเป็นตัวหนังสือตรง ๆ ในไฟล์นี้ (ระบบ override "blue" = ส้ม → ใช้ orange/amber/rose/emerald ตรง ๆ)
 */
import { PO_PAY_FILTERS, countPayFilters, type PoPayFilterKey, type PoPayState, type PoPayStateKey } from "@/lib/po-pay-state";

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

const FILTER_STATE: Record<PoPayFilterKey, PoPayStateKey> = { unpaid: "unpaid", billed: "billed", credit: "credit_due", paid: "paid" };

/**
 * แถบชิปกรองสถานะจ่ายเงิน — items = รายการหลังกรองอื่น (ร้าน/ค้นหา) แต่ก่อนกรองสถานะจ่าย → ตัวเลขบนชิปตรงกับที่จะเห็น
 * value "" = ทั้งหมด · ไม่มีรายการไหนมีข้อมูลจ่าย = ไม่โชว์แถบ
 */
export function PoPayFilterBar({ items, value, onChange, className = "" }: {
  items: { pay?: Pick<PoPayState, "state"> | null }[];
  value: string;
  onChange: (key: PoPayFilterKey | "") => void;
  className?: string;
}) {
  if (!items.some((i) => i.pay)) return null;
  const n = countPayFilters(items);
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`} role="group" aria-label="กรองสถานะจ่ายเงิน">
      <span className="text-xs text-slate-400 mr-0.5">จ่ายเงิน</span>
      {[{ key: "" as const, label: "ทั้งหมด" }, ...PO_PAY_FILTERS].map((f) => {
        const on = value === f.key;
        const cnt = f.key ? n[f.key] : n.all;
        const st = f.key ? FILTER_STATE[f.key] : null;
        return (
          <button key={f.key || "all"} type="button" aria-pressed={on} onClick={() => onChange(f.key)}
            className={`h-7 px-2.5 inline-flex items-center gap-1.5 text-xs rounded-full border ${st ? PO_PAY_CLS[st] : "bg-white border-slate-200 text-slate-600"} ${on ? "ring-2 ring-offset-1 ring-slate-500 font-semibold" : "hover:brightness-95"} ${st && cnt === 0 ? "opacity-50" : ""}`}>
            {st && <span className={`w-1.5 h-1.5 rounded-full ${DOT[st]}`} />}
            {f.label} <b className="tabular-nums">{cnt.toLocaleString()}</b>
          </button>
        );
      })}
    </div>
  );
}

export function PoPayChip({ pay, className = "" }: { pay: Pick<PoPayState, "state" | "label"> | null | undefined; className?: string }) {
  if (!pay) return null;
  return (
    <span className={`inline-flex items-center gap-1 max-w-full truncate text-[11px] font-medium px-1.5 py-0.5 rounded border ${PO_PAY_CLS[pay.state]} ${className}`} title={pay.label}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[pay.state]}`} />
      <span className="truncate">{pay.label}</span>
    </span>
  );
}
