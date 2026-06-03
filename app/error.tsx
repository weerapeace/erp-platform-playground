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
  // ChunkLoadError มักเกิดหลัง deploy (ไฟล์ย่อยเปลี่ยน hash) → reload ดึงเวอร์ชันใหม่ให้อัตโนมัติ
  const isChunkError =
    error?.name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed|ChunkLoadError|error loading dynamically imported module|importing a module script failed/i.test(error?.message || "");

  useEffect(() => {
    console.error("[app/error]", error);
    if (isChunkError && typeof window !== "undefined") {
      const KEY = "__chunk_reload_at";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      // กู้คืนอัตโนมัติ: reload ได้ 1 ครั้งต่อ 10 วินาที (กันลูปถ้าเกิดซ้ำจริง ๆ)
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    }
  }, [error, isChunkError]);

  // ระหว่างกำลัง reload (chunk error) → โชว์หน้าโหลดแทนหน้า error สีแดง
  if (isChunkError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center text-slate-500 text-sm">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          กำลังโหลดเวอร์ชันใหม่…
        </div>
      </div>
    );
  }

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
