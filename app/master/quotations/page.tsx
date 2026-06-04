import { redirect } from "next/navigation";

// หน้าเดโม่เก่า (MasterPage generic) — เลิกใช้ เปลี่ยนมาใช้ใบเสนอราคาตัวจริง /quotations
// ตาราง quotations ใน DB ยังอยู่ (ไม่ลบ) — แค่พาผู้ใช้ไปหน้าใหม่ที่มีบรรทัดสินค้า/คิดเงินครบ
export default function Page() {
  redirect("/quotations");
}
