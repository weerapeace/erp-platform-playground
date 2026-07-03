"use client";

/**
 * ConnectionError (ของกลาง) — แสดงแทนหน้าค้าง "กำลังโหลด" เมื่อโหลดข้อมูลไม่ได้
 * (เช่น DB/Supabase ล่มชั่วคราว) พร้อมปุ่มลองใหม่ · บอกผู้ใช้ว่าไม่ใช่ความผิดเขา
 */
import { useT } from "@/components/i18n";

export function ConnectionError({ onRetry, retrying = false }: { onRetry: () => void; retrying?: boolean }) {
  const t = useT();
  return (
    <div className="py-16 px-6 text-center max-w-md mx-auto">
      <div className="text-5xl mb-3">🔌</div>
      <p className="text-lg font-semibold text-slate-700">{t("เชื่อมต่อฐานข้อมูลไม่ได้", "Can't reach the database")}</p>
      <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
        {t("ตอนนี้โหลดข้อมูลไม่ได้ — ระบบฐานข้อมูล (Supabase) อาจขัดข้องชั่วคราว ไม่ใช่ที่เครื่องคุณ · รอสักครู่แล้วลองใหม่",
          "Couldn't load data — the database service (Supabase) may be temporarily down. This isn't a problem on your side. Wait a moment and try again.")}
      </p>
      <button onClick={onRetry} disabled={retrying}
        className="mt-4 h-10 px-5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
        {retrying ? t("กำลังลองใหม่...", "Retrying...") : `🔄 ${t("ลองใหม่", "Try again")}`}
      </button>
      <p className="text-[11px] text-slate-400 mt-3">{t("ถ้ายังไม่หายเกิน 2–3 นาที เช็กที่ status.supabase.com", "If it lasts more than a few minutes, check status.supabase.com")}</p>
    </div>
  );
}
