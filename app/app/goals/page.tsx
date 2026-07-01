/**
 * ทางเข้าแอปเดี่ยว "เป้าหมาย" จาก App Launcher / portal (/app/goals)
 * → redirect เข้าหน้ารายการเป้าหมาย (focused shell อยู่ที่ /goals/*)
 * (route static นี้ชนะ /app/[appKey] dynamic — กันไปเข้าเชลล์ generic)
 */
import { redirect } from "next/navigation";

export default function GoalsAppEntry() {
  redirect("/goals");
}
