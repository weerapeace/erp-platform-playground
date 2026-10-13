// 🗓️ วางแผนคอนเทนต์ — ย้ายไปรวมเป็นแท็บ "🧭 วางแผน" ในปฏิทินคอนเทนต์แล้ว (2026-10-13)
// ลิงก์/เมนูเดิมยังใช้ได้: เด้งไปแท็บวางแผนให้อัตโนมัติ · ตัวหน้าจอยังอยู่ที่ view.tsx (ใช้ร่วม)
import { redirect } from "next/navigation";

export default function ContentPlanPage() {
  redirect("/tasks/content-calendar?cal=plan");
}
