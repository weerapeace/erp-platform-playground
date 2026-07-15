"use client";

// ============================================================
// ปฏิทินคอนเทนต์ (หน้าแยก) — ดูคอนเทนต์ทั้งหมดตามวันโพสต์ + แท็บแยกแบรนด์
// ของกลาง: StandaloneShell, ContentDrawer (จาก ../content/content), listContent, listBrands
// เฟส 2: ปฏิทินรายเดือน + แท็บแบรนด์ (สีแบรนด์) + คลิกการ์ดเปิด drawer แก้
// ============================================================

import { useCallback, useMemo, useState, useEffect } from "react";
import { useSWRLite } from "@/lib/swr-lite";
import { StandaloneShell } from "@/components/standalone-shell";
import { useT } from "@/components/i18n";
import { listContent, listBrands, CONTENT_STATUS_META, type ContentItem } from "../data";
import { ContentDrawer } from "../content/content";
import { platformLabel } from "../use-options";

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

export function ContentCalendarView() {
  const t = useT();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>("all");   // "all" | brandId
  const [offset, setOffset] = useState(0);                          // เลื่อนเดือน (0 = เดือนนี้)
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3500);
  }, []);

  // ใช้ cache ร่วมกับหน้าคอนเทนต์ (key เดียวกัน) — เข้าหน้านี้เห็นทันที
  const itemsSWR = useSWRLite("creative:content", () => listContent());
  const brandsSWR = useSWRLite("creative:brands", () => listBrands());
  const items = itemsSWR.data ?? [];
  const brands = brandsSWR.data ?? [];
  const reload = useCallback(() => { void itemsSWR.revalidate(true); }, [itemsSWR]);
  // เปิด drawer จากลิงก์ ?content=<id>
  useEffect(() => { const cid = new URLSearchParams(window.location.search).get("content"); if (cid) setDetailId(cid); }, []);

  // กรองตามแบรนด์ที่เลือก
  const filtered = useMemo(
    () => brandFilter === "all" ? items : items.filter((c) => c.brand_id === brandFilter),
    [items, brandFilter],
  );

  // เดือนที่กำลังดู
  const base = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + offset, 1); }, [offset]);
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = base.toLocaleDateString(t("th-TH", "en-US"), { month: "long", year: "numeric" });
  const todayKey = new Date().toISOString().slice(0, 10);

  // จัดคอนเทนต์เข้าแต่ละวัน (ตามวันตั้งโพสต์)
  const byDay = useMemo(() => {
    const map: Record<string, ContentItem[]> = {};
    for (const c of filtered) { if (!c.scheduled_at) continue; const d = c.scheduled_at.slice(0, 10); (map[d] ??= []).push(c); }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    return map;
  }, [filtered]);

  const scheduledThisMonth = useMemo(
    () => filtered.filter((c) => c.scheduled_at && c.scheduled_at.slice(0, 7) === ym).length,
    [filtered, ym],
  );
  const unscheduledCount = useMemo(() => filtered.filter((c) => !c.scheduled_at).length, [filtered]);

  const brandColor = (id: string | null | undefined) => brands.find((b) => b.id === id)?.color || "#cbd5e1";
  const weekdays = [t("อา", "Sun"), t("จ", "Mon"), t("อ", "Tue"), t("พ", "Wed"), t("พฤ", "Thu"), t("ศ", "Fri"), t("ส", "Sat")];

  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium border transition-colors ${
      active ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"
    }`;

  return (
    <StandaloneShell title={t("ปฏิทินคอนเทนต์", "Content Calendar")} icon="🗓️" accent="violet">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🗓️ {t("ปฏิทินคอนเทนต์", "Content Calendar")}</h1>
            <p className="text-slate-500 mt-1">{t("คอนเทนต์ทุกแบรนด์รวมที่เดียว · เรียงตามวันตั้งโพสต์ · คลิกเพื่อแก้", "All content in one place · by scheduled date · click to edit")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/tasks/content" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📋 {t("รายการคอนเทนต์", "Content list")}</a>
          </div>
        </div>

        {/* แท็บแยกแบรนด์ */}
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <button onClick={() => setBrandFilter("all")} className={tabCls(brandFilter === "all")}>{t("ทั้งหมด", "All")}</button>
          {brands.map((b) => (
            <button key={b.id} onClick={() => setBrandFilter(b.id)} className={tabCls(brandFilter === b.id)}>
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: b.color || "#cbd5e1" }} />
              {b.name}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {/* แถบเดือน + สรุป */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => setOffset((o) => o - 1)} aria-label={t("เดือนก่อน", "Previous month")} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">‹</button>
            <h2 className="text-lg font-semibold text-slate-800 min-w-[150px] text-center">{monthName}</h2>
            <button onClick={() => setOffset((o) => o + 1)} aria-label={t("เดือนถัดไป", "Next month")} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">›</button>
            {offset !== 0 && <button onClick={() => setOffset(0)} className="h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">{t("วันนี้", "Today")}</button>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">🗓 {t("เดือนนี้", "This month")} {scheduledThisMonth}</span>
            {unscheduledCount > 0 && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100" title={t("คอนเทนต์ที่ยังไม่ตั้งวันโพสต์", "Content without a scheduled date")}>📥 {t("ยังไม่ลงวันที่", "Unscheduled")} {unscheduledCount}</span>}
          </div>
        </div>

        {/* ตารางปฏิทิน */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-400 mb-1.5">
            {weekdays.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: days }).map((_, i) => {
              const day = i + 1;
              const key = `${ym}-${String(day).padStart(2, "0")}`;
              const list = byDay[key] ?? [];
              const isToday = key === todayKey;
              return (
                <div key={day} className={`min-h-[104px] rounded-lg border p-1.5 align-top ${isToday ? "border-violet-300 bg-violet-50/40" : "border-slate-100"}`}>
                  <div className={`text-xs mb-1 px-0.5 ${isToday ? "font-semibold text-violet-700" : "text-slate-400"}`}>
                    {isToday ? <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-violet-600 text-white">{day}</span> : day}
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, 4).map((c) => {
                      const m = CONTENT_STATUS_META[c.status] ?? CONTENT_STATUS_META.draft;
                      const plats = (c.platforms ?? []).slice(0, 3).map((p) => platformLabel(p)).join(" · ");
                      return (
                        <button key={c.id} onClick={() => setDetailId(c.id)} title={`${c.title}${plats ? ` · ${plats}` : ""}`}
                          className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded border flex items-center gap-1 ${m.cls}`}>
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: brandColor(c.brand_id) }} />
                          <span className="truncate">{c.scheduled_at ? `${c.scheduled_at.slice(11, 16)} ` : ""}{c.title}</span>
                        </button>
                      );
                    })}
                    {list.length > 4 && <div className="text-[10px] text-slate-400 pl-0.5">+{list.length - 4} {t("อื่น ๆ", "more")}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">💡 {t("คลิกการ์ดเพื่อเปิดแก้คอนเทนต์ · จุดสี = แบรนด์", "Click a card to edit · color dot = brand")}</p>
      </div>

      {detailId && <ContentDrawer contentId={detailId} brands={brands} onClose={() => setDetailId(null)} onChanged={reload} pushToast={pushToast} />}

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((x) => <div key={x.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${x.type === "success" ? "bg-emerald-600" : x.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{x.message}</div>)}
      </div>
    </StandaloneShell>
  );
}
