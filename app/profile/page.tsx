"use client";

/**
 * โปรไฟล์ของฉัน — ผู้ใช้ทุกคนแก้ชื่อ/รูป/รหัสผ่านของตัวเองได้
 * เนื้อหาแก้ไขใช้ของกลาง <ProfileEditor/> (ใช้ซ้ำในป๊อปอัป AccountMenu ด้วย)
 */
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth } from "@/components/auth";
import { ProfileEditor } from "@/components/profile-editor";

export default function ProfilePage() {
  const { ready } = useAuth();
  if (!ready) return <PlaygroundShell><div className="p-10 text-center text-slate-400">กำลังโหลด...</div></PlaygroundShell>;
  return (
    <PlaygroundShell>
      <div className="max-w-lg mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-800">โปรไฟล์ของฉัน</h1>
        <p className="text-sm text-slate-500 mt-0.5 mb-6">แก้ชื่อแสดงผล รูป และรหัสผ่านของคุณ</p>
        <ProfileEditor />
      </div>
    </PlaygroundShell>
  );
}
