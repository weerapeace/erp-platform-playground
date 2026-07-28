"use client";

// ============================================================
// ตั้งเครดิต + ระยะเวลาส่งของ ทุกร้าน (หน้าเต็ม)
// เนื้อในเป็นของกลาง: ShopTermsBoard (ฝังที่อื่นได้)
// ============================================================
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { ShopTermsBoard } from "@/components/shop-terms-board";

export default function ShopTermsPage() {
  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="max-w-5xl mx-auto w-full flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">💳 เครดิต &amp; วันส่งของ ต่อร้าน</h1>
            <p className="text-sm text-slate-500 mt-1">ตั้งครั้งเดียว — ปฏิทินจัดซื้อคิดวันจ่ายและวันของเข้าให้เองทุกใบ</p>
          </div>
          <Link href="/purchasing/calendar"
            className="h-[38px] px-4 text-[13px] font-semibold rounded-[10px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center no-underline">
            📅 ไปปฏิทินจัดซื้อ
          </Link>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 max-w-5xl mx-auto w-full">
        <ShopTermsBoard />
      </div>
    </PlaygroundShell>
  );
}
