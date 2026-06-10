"use client";

/**
 * แผนก (Payroll) — รวมเป็นหน้าเดียวแล้ว
 * ตาราง departments จัดการที่ /admin/departments หน้าเดียว (เลิกหน้าซ้ำ)
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PayrollDepartmentsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/departments"); }, [router]);
  return <div className="p-10 text-center text-slate-400">ย้ายไปหน้า “แผนก” รวมแล้ว กำลังพาไป…</div>;
}
