"use client";

/**
 * Layout ของแอปเดี่ยว Payroll (standalone)
 * - ตั้ง ShellPresentContext=true → MasterCRUDPage ไม่ห่อ PlaygroundShell (เมนู ERP เต็ม) ซ้ำ
 * - ห่อด้วย PayrollShell (เปลือกโฟกัสเฉพาะงานเงินเดือน + nav ของ payroll เอง)
 * ทุกหน้า /payroll/* จึงกลายเป็นแอปเดี่ยว เปิด/บุ๊กมาร์ก/ติดตั้งบนมือถือได้
 */
import { ShellPresentContext } from "@/components/playground-shell";
import { PayrollShell } from "@/components/payroll/payroll-shell";

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShellPresentContext.Provider value={true}>
      <PayrollShell>{children}</PayrollShell>
    </ShellPresentContext.Provider>
  );
}
