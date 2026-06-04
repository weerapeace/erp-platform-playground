/**
 * ทางเข้าแอปเดี่ยว Payroll จาก App Launcher / portal (/app/payroll)
 * → redirect เข้าหน้าแรกของแอปเงินเดือน (focused shell อยู่ที่ /payroll/*)
 * (route static นี้ชนะ /app/[appKey] dynamic — กันไปเข้าเชลล์ generic ที่ผูกกับ master-v2)
 */
import { redirect } from "next/navigation";

export default function PayrollAppEntry() {
  redirect("/payroll/dashboard");
}
