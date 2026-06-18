"use client";

// หน้า /payroll/payslips/print — ครอบ PayslipPrintContent (เนื้อหาจริงอยู่ใน content.tsx เพื่อให้ import ฝังที่อื่นได้)
import { Suspense } from "react";
import { PayslipPrintContent } from "./content";

export default function PayrollPayslipPrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">กำลังโหลดหน้าพิมพ์...</div>}>
      <PayslipPrintContent />
    </Suspense>
  );
}
