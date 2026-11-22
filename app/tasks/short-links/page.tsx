"use client";

// 🔗 ลิงก์สั้น — หน้า /tasks/short-links (ทางเข้า: แคปชั่นโพสต์ "ดูยอดคลิก" + เมนูแอปจัดการงาน)
// ตัวหน้าอยู่ที่ components/short-links (หน้านี้แค่ห่อด้วย StandaloneShell)
import { StandaloneShell } from "@/components/standalone-shell";
import { ShortLinksManager } from "@/components/short-links";

export default function ShortLinksPage() {
  return (
    <StandaloneShell title="ลิงก์สั้น" icon="i:link" accent="violet">
      <ShortLinksManager />
    </StandaloneShell>
  );
}
