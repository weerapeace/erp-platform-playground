"use client";

/**
 * /website/access — 🔐 ใครทำอะไรได้ในเว็บไซต์ (ตามตำแหน่ง + ยกเว้นรายคน + ร้านที่เข้าได้)
 * เปิดได้จาก: ปุ่ม "🔐 ใครทำอะไรได้" หน้าเว็บไซต์ · แท็บ ⚙️ ของแอปจัดการงาน (?embed=1)
 * สิทธิ์: admin.users (แก้ตามตำแหน่งต้อง admin.roles เพิ่ม) · ตัวจัด components/website-access-settings
 */
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { AccessDenied, useAuth } from "@/components/auth";
import { WebsiteAccessSettings } from "@/components/website-access-settings";

export default function WebsiteAccessPage() {
  const { can, permsReady, user } = useAuth();
  const know = permsReady || user?.role === "admin";
  return (
    <PlaygroundShell>
      <div className="max-w-[1400px] mx-auto px-5 py-6">
        <Link href="/website" className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center gap-1">
          ← เว็บไซต์ทั้งหมด
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold text-slate-900">🔐 ใครทำอะไรได้ในเว็บไซต์</h1>
        <p className="mt-1 mb-4 text-sm text-slate-500">ตั้งว่าแต่ละคนเห็นหรือแก้ส่วนไหนของเว็บได้ และเข้าร้านไหนได้ — ระบบกันทั้งหน้าจอและตอนบันทึก</p>
        {!know ? (
          <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
        ) : can("admin.users") ? (
          <WebsiteAccessSettings />
        ) : (
          <AccessDenied message="หน้านี้สำหรับผู้ดูแลที่จัดการผู้ใช้ได้" />
        )}
      </div>
    </PlaygroundShell>
  );
}
