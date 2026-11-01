/**
 * หน้าเดิม "จัดการงานเหมารายชิ้น" — ย้ายไปเมนู ผลิต → จัดการงานเหมา (/master/piecework-jobs) แล้ว (2026-11-01)
 * เก็บไว้ให้ลิงก์/บุ๊กมาร์กเก่าไม่เสีย
 */
import { redirect } from "next/navigation";

export default function OldPieceworkJobsPage() {
  redirect("/master/piecework-jobs");
}
