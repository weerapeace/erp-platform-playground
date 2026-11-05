"use client";

/**
 * ↩ BackButton — ของกลาง: ปุ่ม "ย้อนกลับ" ไปหน้าที่ผู้ใช้เข้ามา
 *   <BackButton fallback="/" />
 * ลำดับการหาปลายทาง:
 *   1) หน้าก่อนหน้าในแท็บนี้ (lib/nav-trail — ข้ามหน้าเว็บนอก เช่น ตอนไปเชื่อม Facebook/Lazada แล้วกลับมา)
 *   2) เปิดมาเป็นแท็บใหม่ (ไม่มีประวัติ) → ปิดแท็บนี้ กลับแท็บเดิม · ปิดไม่ได้ → ไปข้อ 3
 *   3) หน้าที่ลิงก์มา (document.referrer เว็บเดียวกัน) → ไม่มี = fallback
 * ใช้กับหน้าตั้งค่า/หน้าย่อยที่ถูกเปิดจากหลายที่ (ไม่ใช่จอซ้อนใน state — อันนั้นใช้ lib/use-back-close)
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { previousEntry, truncateTrail } from "@/lib/nav-trail";

export function BackButton({ fallback = "/", label = "ย้อนกลับ", className = "" }: { fallback?: string; label?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [hint, setHint] = useState("");   // ปลายทาง (โชว์ตอนชี้) — อ่านหลัง mount กัน hydration ไม่ตรง

  useEffect(() => {
    const prev = previousEntry(pathname);
    setHint(prev ? prev.entry.path + prev.entry.search : "");
  }, [pathname]);

  const sameOriginReferrer = (): string | null => {
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      return r && r.origin === window.location.origin && r.pathname !== pathname ? r.pathname + r.search : null;
    } catch { return null; }
  };

  const go = () => {
    const prev = previousEntry(pathname);
    if (prev) { truncateTrail(prev.index); router.push(prev.entry.path + prev.entry.search); return; }
    if (window.history.length <= 1) {
      try { window.close(); } catch { /* ปิดไม่ได้ */ }
      window.setTimeout(() => { if (!window.closed) router.push(sameOriginReferrer() ?? fallback); }, 150);
      return;
    }
    router.push(sameOriginReferrer() ?? fallback);
  };

  return (
    <button type="button" onClick={go} title={hint ? `กลับไป ${hint}` : label}
      className={`inline-flex items-center gap-1 h-8 -ml-2 px-2 rounded-lg text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors ${className}`}>
      <Icon name="back" />{label}
    </button>
  );
}
