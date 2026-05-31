"use client";

import Link from "next/link";
import { Logo, BRAND } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/40 flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <Logo size={56} className="mx-auto mb-6 opacity-60" />

        <div className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-indigo-600 mb-3 leading-none">
          404
        </div>

        <h1 className="text-2xl font-semibold text-slate-800 mb-2">ไม่พบหน้าที่ค้นหา</h1>
        <p className="text-sm text-slate-500 mb-8">
          อาจมีการพิมพ์ URL ผิด หรือหน้านี้ถูกย้าย/ลบไปแล้ว
        </p>

        <div className="flex gap-2 justify-center flex-wrap">
          <Link href="/"
            className="h-10 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 transition-colors">
            ← กลับหน้าหลัก
          </Link>
          <button onClick={() => history.back()}
            className="h-10 px-5 text-sm font-medium border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
            หน้าก่อนหน้า
          </button>
        </div>

        <div className="mt-12 text-xs text-slate-400">
          {BRAND.name} · ลองใช้ <kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px]">⌘K</kbd> เพื่อค้นหาที่ต้องการ
        </div>
      </div>
    </div>
  );
}
