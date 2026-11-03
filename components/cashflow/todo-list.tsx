"use client";

/**
 * "ต้องจัดการก่อนเชื่อตัวเลข" ของหน้ากระแสเงินสด (/cashflow) — ป้ายเตือนจาก /api/cashflow (meta.warnings) + ปุ่มไปแก้ตรงจุด
 * ⚠️ ห้ามซ่อนคำเตือน (กันคนเอาตัวเลขผิดไปตัดสินใจ) — ย่อได้ แต่จำนวนเรื่องโชว์เสมอ
 * เพิ่ม code ใหม่ใน API แล้วอยากได้ปุ่มเฉพาะ → เพิ่มใน ACTIONS · ไม่เพิ่ม = ปุ่ม "ไปแก้" ตาม href ของคำเตือน
 */
import { useState } from "react";
import Link from "next/link";
import type { CashflowWarning } from "@/app/api/cashflow/route";

export type CashflowTab = "pay" | "recv" | "debt" | "all" | "settings";

const ACTIONS: Record<string, { label: string; tab?: CashflowTab; href?: string }> = {
  no_opening_balance: { label: "กรอกยอดเงิน", tab: "settings" },
  no_manual_items: { label: "เพิ่มรายการประจำ", tab: "settings" },
  so_no_credit_term: { label: "ตั้งเครดิตลูกค้า", tab: "recv" },
  po_no_credit_term: { label: "ตั้งเครดิตร้าน", tab: "pay" },
  loan_overdue_unreconciled: { label: "ตัดยอดเงินกู้", tab: "debt" },
  no_receipt_records: { label: "บันทึกรับเงิน", href: "/receipts" },
  payroll_unmarked_paid: { label: "ไปกดจ่ายแล้ว", href: "/payroll/payments" },
};

export function CashflowTodo({ warnings, onTab }: { warnings: CashflowWarning[]; onTab: (t: CashflowTab) => void }) {
  const [open, setOpen] = useState(true);
  if (!warnings.length) {
    return <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">✓ ข้อมูลตั้งต้นครบ — ตัวเลขในหน้านี้เชื่อได้ตามเอกสารในระบบ</div>;
  }
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100/50">
        <span className="text-sm font-semibold text-amber-800">ต้องจัดการก่อนเชื่อตัวเลข · {warnings.length} เรื่อง</span>
        <span className="text-amber-600 text-xs">{open ? "ย่อ ▲" : "ดู ▼"}</span>
      </button>
      {open && (
        <ul className="divide-y divide-amber-100 border-t border-amber-100">
          {warnings.map((w) => {
            const a = ACTIONS[w.code];
            const cls = "shrink-0 h-8 px-3 inline-flex items-center text-xs font-medium rounded-lg border border-amber-300 bg-white text-amber-800 hover:bg-amber-100";
            return (
              <li key={w.code} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-amber-400" aria-hidden="true">•</span>
                <span className="flex-1 min-w-0 text-sm text-amber-900">{w.message}</span>
                {a?.tab ? <button type="button" onClick={() => onTab(a.tab!)} className={cls}>{a.label}</button>
                  : (a?.href ?? w.href) ? <Link href={(a?.href ?? w.href)!} className={cls}>{a?.label ?? "ไปแก้"}</Link> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
