"use client";
/**
 * PagerBar — ของกลาง: แถบเลื่อนหน้า (ก่อนหน้า / หน้าที่ / ถัดไป)
 *
 * ใช้ทำอะไร: ให้รายการยาว ๆ (ป๊อปค้นหา, รายการในโมดัล) เดินหน้า-ถอยหลังเป็น "หน้า" ได้
 *            แทนปุ่ม "โหลดเพิ่ม" ที่ต้องกดรัวและหาของเก่าไม่เจอ
 * ใช้เมื่อไหร่: ทุกที่ที่ดึงข้อมูลทีละหน้าด้วย limit/offset
 *
 * รู้จำนวนทั้งหมด (total) → โชว์ "หน้า 2/9 · 41-80 จาก 337"
 * ไม่รู้ total → ใช้ hasMore บอกว่ายังมีหน้าถัดไปไหม
 */
import { useT } from "@/components/i18n";

export function PagerBar({
  page, pageSize, count, total, hasMore, loading, onPage, className = "",
}: {
  /** หน้าปัจจุบัน เริ่มที่ 0 */
  page: number;
  pageSize: number;
  /** จำนวนรายการที่แสดงอยู่ในหน้านี้ */
  count: number;
  /** จำนวนทั้งหมด (ถ้ารู้) */
  total?: number | null;
  /** ยังมีหน้าถัดไปไหม (ใช้เมื่อไม่รู้ total) */
  hasMore?: boolean;
  loading?: boolean;
  onPage: (page: number) => void;
  className?: string;
}) {
  const t = useT();
  const from = count > 0 ? page * pageSize + 1 : 0;
  const to = page * pageSize + count;
  const lastPage = typeof total === "number" && total > 0 ? Math.max(0, Math.ceil(total / pageSize) - 1) : null;
  const canPrev = page > 0 && !loading;
  const canNext = !loading && (lastPage !== null ? page < lastPage : !!hasMore);
  if (page === 0 && !canNext && count <= pageSize) return null;   // มีหน้าเดียว → ไม่ต้องโชว์แถบ

  const btn = "h-8 px-3 text-[12.5px] rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white";
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <span className="text-[11.5px] text-slate-500 tabular-nums">
        {loading
          ? t("กำลังโหลด…", "Loading…")
          : typeof total === "number"
            ? t(`หน้า ${page + 1}${lastPage !== null ? `/${lastPage + 1}` : ""} · ${from}-${to} จาก ${total.toLocaleString()}`,
                `Page ${page + 1}${lastPage !== null ? `/${lastPage + 1}` : ""} · ${from}-${to} of ${total.toLocaleString()}`)
            : t(`หน้า ${page + 1} · รายการ ${from}-${to}`, `Page ${page + 1} · items ${from}-${to}`)}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={!canPrev} onClick={() => onPage(page - 1)}>‹ {t("ก่อนหน้า", "Prev")}</button>
        <button type="button" className={btn} disabled={!canNext} onClick={() => onPage(page + 1)}>{t("ถัดไป", "Next")} ›</button>
      </div>
    </div>
  );
}
