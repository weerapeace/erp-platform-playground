"use client";

import { LoadingState } from "@/components/state-views";
import { Suspense } from "react";
import { PayslipPrintContent } from "@/app/payroll/payslips/print/content";

export default function PayrollPayslipStandalonePrintPage() {
  return (
    <Suspense fallback={<LoadingState label="กำลังโหลดหน้าพิมพ์..." boxClassName="p-8 text-sm text-slate-500" />}>
      <PayslipPrintContent embedded />
    </Suspense>
  );
}
