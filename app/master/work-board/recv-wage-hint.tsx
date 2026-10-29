"use client";

/**
 * ใต้ช่อง "ค่าแรง/ชิ้น" ตอนรับงานคืน (ป๊อปการ์ดใบจ่าย + แท็บรับงานคืนในป๊อปใบงาน)
 * บอกยอดค่าแรงของรอบนี้ (ต่อชิ้น × จำนวนที่ส่ง) และบอกว่ากำลังใช้ค่าแรงตามใบจ่ายอยู่
 */
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

export function RecvWageHint({ rate, fromSlip, total }: { rate: string; fromSlip: string; total: number }) {
  if (rate.trim() === "") return <span className="mt-0.5 block text-[11px] text-slate-400">{fromSlip ? "" : "ใบจ่ายยังไม่มีค่าแรง — พิมพ์ต่อชิ้น"}</span>;
  return (
    <span className="mt-0.5 block text-[11px] text-slate-500">
      รอบนี้ ฿{fmt(total)}{fromSlip && Number(rate) === Number(fromSlip) ? <span className="text-emerald-700"> · ตามใบจ่าย</span> : null}
    </span>
  );
}
