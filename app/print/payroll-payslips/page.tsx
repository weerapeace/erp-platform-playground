"use client";

import { Suspense } from "react";
import { PayslipPrintContent } from "@/app/payroll/payslips/print/content";

export default function PayrollPayslipStandalonePrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">กำลังโหลดหน้าพิมพ์...</div>}>
      <PayslipPrintContent embedded />
    </Suspense>
  );
}
