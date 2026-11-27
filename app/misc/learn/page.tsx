"use client";

/**
 * /misc/learn — 🎓 ศูนย์เรียนรู้ (แอป "งานอื่นๆ")
 *   หมวด → บทเรียน → ขั้นตอน (ข้อความ · รูป · คลิป YouTube/TikTok/Drive + นาที · คลิปสั้นอัปเอง · เช็กลิสต์)
 *   สิทธิ์ learn.view (อ่าน) / learn.manage (สร้าง แก้ เผยแพร่ ลบ) · คู่มือ docs/learning-center.md
 */
import { PlaygroundShell } from "@/components/playground-shell";
import { LearnApp } from "./learn-app";

export default function LearnPage() {
  return (
    <PlaygroundShell>
      <LearnApp />
    </PlaygroundShell>
  );
}
