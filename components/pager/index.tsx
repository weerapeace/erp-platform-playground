"use client";
/**
 * Pager — แถบแบ่งหน้าแบบของกลาง (ใช้ซ้ำได้ทุกหน้า)
 * - บอกจำนวนทั้งหมด + ช่วงที่แสดง
 * - ปุ่ม « หน้าแรก · ‹ ก่อนหน้า · ถัดไป › · » หน้าสุดท้าย
 * - พิมพ์เลขหน้าเพื่อกระโดดไปได้ (Enter/ออกจากช่อง)
 *
 * page = 0-based (หน้าแรก = 0) · onPage คืน index หน้าใหม่ (0-based)
 * เลือกจำนวนต่อหน้าได้ ถ้าส่ง onPageSize + pageSizes มา (ไม่ส่ง = ไม่โชว์ตัวเลือก)
 *
 * ไม่รู้จำนวนทั้งหมด (total = null) — เช่น ดึงทีละหน้าด้วย limit/offset แล้วรู้แค่ว่า "ยังมีต่อไหม"
 *   → ส่ง count (จำนวนในหน้านี้) + hasMore · แถบเหลือ "หน้า N · รายการ a-b" + ก่อนหน้า/ถัดไป
 *   (รวมมาจาก PagerBar เดิม 2026-11-07 — ตัวเลือกวัตถุดิบใช้แบบนี้ตอนยังไม่พิมพ์ค้น)
 * loading = ปุ่มกดไม่ได้ระหว่างโหลด · hideWhenSingle = มีหน้าเดียวไม่ต้องโชว์แถบ
 */
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n";

export function Pager({ page, pageSize, total, onPage, unitLabel, onPageSize, pageSizes, count, hasMore, loading, hideWhenSingle }: {
  page: number; pageSize: number;
  /** จำนวนทั้งหมด · null/undefined = ไม่รู้ (ใช้ count + hasMore แทน) */
  total?: number | null;
  onPage: (p: number) => void; unitLabel?: string;
  onPageSize?: (s: number) => void; pageSizes?: number[];
  /** จำนวนรายการในหน้านี้ — ใช้ตอนไม่รู้ total */
  count?: number;
  /** ยังมีหน้าถัดไปไหม — ใช้ตอนไม่รู้ total */
  hasMore?: boolean;
  /** กำลังโหลด → ปุ่มกดไม่ได้ */
  loading?: boolean;
  /** มีหน้าเดียว → ไม่ต้องโชว์แถบ */
  hideWhenSingle?: boolean;
}) {
  const t = useT();
  const unit = unitLabel ?? t("รายการ", "items");
  const known = typeof total === "number";
  const pages = known ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const [draft, setDraft] = useState(String(page + 1));
  useEffect(() => { setDraft(String(page + 1)); }, [page]);   // sync ช่องพิมพ์ตามหน้าจริง
  const btn = "h-8 min-w-[2rem] px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600";

  // ── ไม่รู้จำนวนทั้งหมด: ก่อนหน้า / ถัดไป ตาม hasMore ──
  if (!known) {
    const n = count ?? 0;
    if (hideWhenSingle && page === 0 && !hasMore) return null;
    const from = n > 0 ? page * pageSize + 1 : 0;
    const to = page * pageSize + n;
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap text-[12px] text-slate-500">
        <span className="tabular-nums">
          {loading ? t("กำลังโหลด…", "Loading…") : t(`หน้า ${page + 1} · ${unit} ${from}-${to}`, `Page ${page + 1} · ${unit} ${from}-${to}`)}
        </span>
        <div className="flex items-center gap-1.5">
          <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page <= 0 || loading}>‹ {t("ก่อนหน้า", "Prev")}</button>
          <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={!hasMore || loading}>{t("ถัดไป", "Next")} ›</button>
        </div>
      </div>
    );
  }

  if (hideWhenSingle && pages <= 1 && page === 0) return null;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const go = (p: number) => { const c = Math.min(pages - 1, Math.max(0, p)); if (c !== page) onPage(c); };
  const commit = () => { const n = parseInt(draft, 10); if (!isNaN(n)) go(n - 1); setDraft(String(page + 1)); };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-[12px] text-slate-500">
      <span className="flex items-center gap-2">
        {t("ทั้งหมด", "Total")} <b className="text-slate-700">{total.toLocaleString()}</b> {unit} · {t("แสดง", "showing")} {from.toLocaleString()}–{to.toLocaleString()}
        {onPageSize && (
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}
            className="h-7 px-1.5 border border-slate-200 rounded-lg bg-white text-[12px] text-slate-600">
            {(pageSizes ?? [10, 20, 50]).map((s) => <option key={s} value={s}>{s}/{t("หน้า", "page")}</option>)}
          </select>
        )}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} onClick={() => go(0)} disabled={page <= 0 || loading} title={t("หน้าแรก", "First page")}>«</button>
        <button type="button" className={btn} onClick={() => go(page - 1)} disabled={page <= 0 || loading}>‹ {t("ก่อนหน้า", "Prev")}</button>
        <span className="flex items-center gap-1 px-1">{t("หน้า", "Page")}
          <input value={draft} inputMode="numeric"
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); } }}
            onBlur={commit}
            className="w-12 h-8 px-1 text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <span className="text-slate-400">/ {pages}</span>
        </span>
        <button type="button" className={btn} onClick={() => go(page + 1)} disabled={page >= pages - 1 || loading}>{t("ถัดไป", "Next")} ›</button>
        <button type="button" className={btn} onClick={() => go(pages - 1)} disabled={page >= pages - 1 || loading} title={t("หน้าสุดท้าย", "Last page")}>»</button>
      </div>
    </div>
  );
}
