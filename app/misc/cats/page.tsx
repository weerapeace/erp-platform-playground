"use client";

/**
 * /misc/cats — 🐾 ทะเบียนแมว (แอป "งานอื่นๆ")
 *   แมว (รูปใหญ่) · วัคซีน · ยาถ่ายพยาธิ/หยดกันเห็บหมัด · น้ำหนัก + กราฟ · คลินิก · ใกล้ถึงกำหนด · ปฏิทิน · ถังขยะ
 *   ติดตั้งเป็นแอปบนมือถือได้ (/solo/misc/cats) · สิทธิ์ cats.view / cats.edit · คู่มือ docs/cat-registry.md
 */
import { PlaygroundShell } from "@/components/playground-shell";
import { CatsApp } from "./cats-app";

export default function CatsPage() {
  return (
    <PlaygroundShell>
      <div className="min-h-full bg-slate-50">
        <CatsApp />
      </div>
    </PlaygroundShell>
  );
}
