/** /admin/belt-builder/studio → สตูดิโออยู่ที่ /admin/belt-builder แล้ว (ลิงก์เก่า/ลิงก์จากตัวจัดหน้าเว็บยังใช้ได้) */
import { redirect } from "next/navigation";

export default function BeltStudioRedirect() {
  redirect("/admin/belt-builder");
}
