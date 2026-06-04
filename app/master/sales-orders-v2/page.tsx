import { redirect } from "next/navigation";

// หน้าเดโม่เก่า (MasterPage generic) — เลิกใช้ เปลี่ยนมาใช้ใบสั่งขายตัวจริง /sales-orders
// ตาราง sales_orders ใน DB ยังอยู่ (ไม่ลบ) — แค่พาผู้ใช้ไปหน้าใหม่ที่มีบรรทัดสินค้า/workflow ครบ
export default function Page() {
  redirect("/sales-orders");
}
