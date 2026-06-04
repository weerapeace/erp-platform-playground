"use client";

/**
 * Payroll module — ตัวช่วย render cell ของกลางในโมดูล (กัน duplication)
 * ไม่มี import server-only (ใช้ได้ใน client page)
 */
import React from "react";

export const money = (v: unknown): React.ReactNode => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0
    ? <span className="tabular-nums text-slate-700">฿{n.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
    : <span className="text-slate-300">—</span>;
};

/**
 * ลิงก์ "เชื่อม" ไปหน้า view อื่นพร้อมกรองล่วงหน้า (deep-link)
 * master-crud อ่าน ?flt=<json> → กรองตามคอลัมน์จริง (เช่น employee_id / contract_id)
 * ใช้เชื่อมความสัมพันธ์ เช่น สัญญา → ค่าประจำของพนักงาน/สัญญานั้น
 */
export function relLink(href: string, col: string, id: unknown, label: string): React.ReactNode {
  if (!id) return <span className="text-slate-300">—</span>;
  const flt = encodeURIComponent(JSON.stringify({ [col]: { type: "text", value: String(id) } }));
  return (
    <a href={`${href}?flt=${flt}`} onClick={(e) => e.stopPropagation()}
       className="text-blue-600 hover:underline text-xs whitespace-nowrap">{label}</a>
  );
}

export function statusBadge(map: Record<string, { th: string; cls: string }>) {
  return (v: unknown): React.ReactNode => {
    const s = map[String(v)] ?? { th: String(v ?? "—"), cls: "bg-slate-100 text-slate-600" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.th}</span>;
  };
}

/** ป้ายสถานะที่ใช้ร่วมหลายหน้า payroll */
export const PAY_STATUS: Record<string, { th: string; cls: string }> = {
  draft:     { th: "ร่าง",       cls: "bg-slate-100 text-slate-600" },
  calculating: { th: "กำลังคำนวณ", cls: "bg-sky-100 text-sky-700" },
  review:    { th: "รอตรวจ",     cls: "bg-amber-100 text-amber-700" },
  approved:  { th: "อนุมัติ",    cls: "bg-blue-100 text-blue-700" },
  locked:    { th: "ล็อกแล้ว",   cls: "bg-purple-100 text-purple-700" },
  paid:      { th: "จ่ายแล้ว",   cls: "bg-emerald-100 text-emerald-700" },
  issued:    { th: "ออกแล้ว",    cls: "bg-emerald-100 text-emerald-700" },
  pending:   { th: "รอดำเนินการ", cls: "bg-amber-100 text-amber-700" },
  held:      { th: "พักไว้",     cls: "bg-orange-100 text-orange-700" },
  cancelled: { th: "ยกเลิก",     cls: "bg-red-100 text-red-700" },
  void:      { th: "ยกเลิกเอกสาร", cls: "bg-red-100 text-red-700" },
  rejected:  { th: "ปฏิเสธ",     cls: "bg-red-100 text-red-700" },
  active:    { th: "ใช้งาน",     cls: "bg-emerald-100 text-emerald-700" },
};
