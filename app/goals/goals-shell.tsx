"use client";

// เปลือก client ของแอปเป้าหมาย (แยกจาก layout เพื่อให้ layout เป็น server + export metadata/manifest ได้)
import { ShellPresentContext } from "@/components/playground-shell";
import { StandaloneShell } from "@/components/standalone-shell";

export function GoalsShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellPresentContext.Provider value={true}>
      <StandaloneShell title="เป้าหมาย & เส้นทางสู่ความสำเร็จ" icon="🎯" accent="violet">
        {children}
      </StandaloneShell>
    </ShellPresentContext.Provider>
  );
}
