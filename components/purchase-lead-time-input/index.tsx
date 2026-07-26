"use client";

/**
 * PurchaseLeadTimeInput — ของกลาง: ตั้ง "ระยะเวลาส่งของ (Lead Time)" ต่อร้าน
 * ค่า = text เดียว: "N" (N วันจากวันสั่ง) หรือ "N|after_pay" (N วันหลังชำระเงิน)
 * ปฏิทินจัดซื้อโหมด "ของเข้า" เอาไปคำนวณวันของเข้าอัตโนมัติ (lib/credit-term → computeArrivalDate)
 */
import { parseLeadTime } from "@/lib/credit-term";

const QUICK = [7, 15, 30];

export function PurchaseLeadTimeInput({ value, onChange, disabled }: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const t = parseLeadTime(value);
  const days = t?.days ?? "";
  const afterPay = t?.afterPayment ?? false;

  const setDays = (raw: string | number) => {
    const n = Math.round(Number(raw));
    if (!isFinite(n) || n < 0 || raw === "") return onChange(null);
    onChange(afterPay ? `${n}|after_pay` : String(n));
  };
  const setAfterPay = (v: boolean) => {
    if (typeof days !== "number") return;   // ยังไม่ใส่จำนวนวัน
    onChange(v ? `${days}|after_pay` : String(days));
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* ปุ่มลัด */}
      <div className="inline-flex gap-1">
        {QUICK.map((q) => (
          <button key={q} type="button" disabled={disabled} onClick={() => setDays(q)}
            className={`h-8 px-2.5 text-xs rounded-md border transition-colors ${days === q
              ? "bg-blue-600 text-white border-blue-600"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{q} วัน</button>
        ))}
      </div>
      {/* ใส่เองกี่วันก็ได้ */}
      <span className="inline-flex items-center gap-1">
        <input type="number" min={0} value={days} disabled={disabled} placeholder="—"
          onChange={(e) => setDays(e.target.value)}
          className="h-8 w-20 px-2 text-sm text-right border border-slate-200 rounded-md disabled:bg-slate-50" />
        <span className="text-xs text-slate-500">วัน</span>
      </span>
      {/* นับจากวันไหน */}
      <label className={`inline-flex items-center gap-1 text-xs ${typeof days === "number" ? "text-slate-600" : "text-slate-300"}`}
        title="ติ๊ก = ร้านส่งของหลังเราจ่ายเงิน (นับวันจากวันจ่าย) · ไม่ติ๊ก = นับจากวันสั่งซื้อ">
        <input type="checkbox" checked={afterPay} disabled={disabled || typeof days !== "number"}
          onChange={(e) => setAfterPay(e.target.checked)} />
        ส่งหลังชำระเงิน
      </label>
    </div>
  );
}
