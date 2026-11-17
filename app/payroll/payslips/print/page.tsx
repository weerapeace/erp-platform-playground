"use client";

// หน้า /payroll/payslips/print — ครอบ PayslipPrintContent (เนื้อหาจริงอยู่ใน content.tsx เพื่อให้ import ฝังที่อื่นได้)
import { LoadingState } from "@/components/state-views";
import { Suspense } from "react";
import { PayslipPrintContent } from "./content";

export default function PayrollPayslipPrintPage() {
  return (
    <Suspense fallback={<LoadingState label="กำลังโหลดหน้าพิมพ์..." boxClassName="p-8 text-sm text-slate-500" />}>
      <PayslipPrintContent />
    </Suspense>
  );
}
