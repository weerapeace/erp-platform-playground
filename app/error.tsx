"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo, BRAND } from "@/components/brand";

export default function Error({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // log ไปยัง console — ในอนาคต ส่งไป error tracking service ได้ที่นี่
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <Logo size={56} className="mx-auto mb-6 opacity-60" />

        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 text-red-500 mb-4">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-slate-800 mb-2">เกิดข้อผิดพลาด</h1>
        <p className="text-sm text-slate-500 mb-1">
          ระบบทำงานผิดพลาดในส่วนนี้ ลองรีโหลดดูใหม่
        </p>
        {error.message && (
          <details className="text-left mb-5" open>
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
              รายละเอียดเทคนิค
            </summary>
            <pre className="mt-2 p-3 bg-slate-100 rounded text-[11px] font-mono text-slate-700 overflow-auto max-h-64 text-left whitespace-pre-wrap break-words">
              {error.message}
              {error.digest && `\n\nDigest: ${error.digest}`}
              {error.stack && `\n\nStack:\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="flex gap-2 justify-center flex-wrap">
          <button onClick={reset}
            className="h-10 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2">
            🔄 ลองใหม่
          </button>
          <Link href="/"
            className="h-10 px-5 text-sm font-medium border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50">
            กลับหน้าหลัก
          </Link>
        </div>

        <div className="mt-12 text-xs text-slate-400">{BRAND.name}</div>
      </div>
    </div>
  );
}
