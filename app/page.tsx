import { redirect } from "next/navigation";

/**
 * Root — redirect ไป App Launcher (/apps)
 *
 * F21: หน้า "Preview ของกลาง" เดิม (sections[] ลิงก์ demo) ย้ายไป app/_demos แล้ว
 * → redirect ไปหน้าจริงแทน (เบา ไม่มี dead link)
 */
export default function RootPage() {
  redirect("/apps");
}
