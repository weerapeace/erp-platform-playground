"use client";

/**
 * Layout ของแอปเดี่ยว "เป้าหมาย" (standalone /goals/*)
 * - ห่อด้วย StandaloneShell (ของกลาง) → topbar โฟกัส ไม่มี sidebar ERP รก ๆ
 * - ShellPresentContext=true กัน component กลางที่ห่อ shell ซ้ำ
 * เปิด/บุ๊กมาร์ก/ติดตั้งบนมือถือได้ (ผ่านทางเข้า /app/goals)
 */
import { ShellPresentContext } from "@/components/playground-shell";
import { StandaloneShell } from "@/components/standalone-shell";

export default function GoalsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShellPresentContext.Provider value={true}>
      <StandaloneShell title="เป้าหมาย & เส้นทางสู่ความสำเร็จ" icon="🎯" accent="violet">
        {children}
      </StandaloneShell>
    </ShellPresentContext.Provider>
  );
}
