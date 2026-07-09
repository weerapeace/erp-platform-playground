"use client";

/**
 * /account/security — หน้าเต็ม "ความปลอดภัย: อุปกรณ์ที่เข้าสู่ระบบ"
 * เนื้อหาอยู่ในของกลาง <SecurityDevices /> — ใช้ซ้ำใน Popup ได้ (เมนูบัญชีในแอป)
 */
import { PlaygroundShell } from "@/components/playground-shell";
import { SecurityDevices } from "@/components/security-devices";

export default function SecurityPage() {
  return (
    <PlaygroundShell>
      <div className="max-w-3xl mx-auto px-5 py-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2 mb-4">🔐 ความปลอดภัย — อุปกรณ์ที่เข้าสู่ระบบ</h1>
        <SecurityDevices />
      </div>
    </PlaygroundShell>
  );
}
