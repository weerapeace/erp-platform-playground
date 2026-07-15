"use client";

// ============================================================
// ปฏิทินคอนเทนต์ (หน้าแยก) — ดูคอนเทนต์ทั้งหมดตามวันโพสต์ + แท็บแยกแบรนด์
// ของกลาง: StandaloneShell, ContentDrawer, ContentCreateModal, listContent, listBrands
// เฟส 2: ปฏิทินรายเดือน + แท็บแบรนด์ (สีแบรนด์) + คลิกการ์ดเปิด drawer
// เฟส 3: คลิกช่องวัน=สร้างงาน (เติมวัน+แบรนด์) · กล่อง "ยังไม่ลงวันที่" · ลากวางเปลี่ยนวัน
// ============================================================

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useSWRLite } from "@/lib/swr-lite";
import { StandaloneShell } from "@/components/standalone-shell";
import { useT } from "@/components/i18n";
import { listContent, listBrands, listCampaigns, listContentTemplates, listBrandCalStyles, updateContent, CONTENT_STATUS_META, type ContentItem, type BrandCalStyle } from "../data";
import { ContentDrawer } from "../content/content";
import { ContentCreateModal } from "../content/content-create-modal";
import { BrandStyleModal } from "./brand-style-modal";
import { platformLabel } from "../use-options";
import { r2ImageUrl } from "@/lib/r2-image";

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

export function ContentCalendarView() {
  const t = useT();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>("all");   // "all" | brandId
  const [offset, setOffset] = useState(0);                          // เลื่อนเดือน (0 = เดือนนี้)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | null>(null);   // วันตั้งโพสต์ prefill (จากช่องที่คลิก)
  // ลากวาง: จำ id + เวลาเดิมของการ์ดที่กำลังลาก + ช่องที่เมาส์ลอยอยู่
  const dragRef = useRef<{ id: string; time: string | null } | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3500);
  }, []);

  // ใช้ cache ร่วมกับหน้าคอนเทนต์ (key เดียวกัน) — เข้าหน้านี้เห็นทันที
  const itemsSWR = useSWRLite("creative:content", () => listContent());
  const brandsSWR = useSWRLite("creative:brands", () => listBrands());
  const campaignsSWR = useSWRLite("creative:campaigns", () => listCampaigns());
  const templatesSWR = useSWRLite("creative:content-templates", () => listContentTemplates());
  const stylesSWR = useSWRLite("creative:brand-cal-styles", () => listBrandCalStyles());
  const items = itemsSWR.data ?? [];
  const brands = brandsSWR.data ?? [];
  const campaigns = campaignsSWR.data ?? [];
  const templates = templatesSWR.data ?? [];
  const styleMap = useMemo(() => Object.fromEntries((stylesSWR.data ?? []).map((s) => [s.brand_id, s])) as Record<string, BrandCalStyle>, [stylesSWR.data]);
  const [styleBrandId, setStyleBrandId] = useState<string | null>(null);   // แบรนด์ที่กำลังแต่งหน้า
  const reload = useCallback(() => { void itemsSWR.revalidate(true); }, [itemsSWR]);
  // เปิด drawer จากลิงก์ ?content=<id>
  useEffect(() => { const cid = new URLSearchParams(window.location.search).get("content"); if (cid) setDetailId(cid); }, []);

  // กรองตามแบรนด์ที่เลือก (ไม่รวมแม่แบบ)
  const filtered = useMemo(
    () => items.filter((c) => !c.is_template && (brandFilter === "all" || c.brand_id === brandFilter)),
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

  // จัดคอนเทนต์เข้าแต่ละวัน (ตามวันตั้งโพสต์) + กล่องยังไม่ลงวันที่
  const byDay = useMemo(() => {
    const map: Record<string, ContentItem[]> = {};
    for (const c of filtered) { if (!c.scheduled_at) continue; const d = c.scheduled_at.slice(0, 10); (map[d] ??= []).push(c); }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    return map;
  }, [filtered]);
  const unscheduled = useMemo(
    () => filtered.filter((c) => !c.scheduled_at).sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")),
    [filtered],
  );
  const scheduledThisMonth = useMemo(
    () => filtered.filter((c) => c.scheduled_at && c.scheduled_at.slice(0, 7) === ym).length,
    [filtered, ym],
  );

  const brandColor = (id: string | null | undefined) => brands.find((b) => b.id === id)?.color || "#cbd5e1";
  const activeStyle = brandFilter !== "all" ? (styleMap[brandFilter] ?? null) : null;   // สไตล์ของแบรนด์ที่เลือก (แบนเนอร์)
  const weekdays = [t("อา", "Sun"), t("จ", "Mon"), t("อ", "Tue"), t("พ", "Wed"), t("พฤ", "Thu"), t("ศ", "Fri"), t("ส", "Sat")];

  // ย้ายวัน (ลากวาง) — optimistic แล้วบันทึกจริง · error = คืนค่าเดิม
  const reschedule = useCallback(async (id: string, newAt: string | null) => {
    const cur = items;
    itemsSWR.mutate(cur.map((c) => c.id === id ? { ...c, scheduled_at: newAt } : c));
    try { await updateContent(id, { scheduled_at: newAt }); pushToast("success", newAt ? t("ย้ายวันโพสต์แล้ว", "Rescheduled") : t("ย้ายไปกล่องยังไม่ลงวันที่แล้ว", "Moved to backlog")); }
    catch (e) { itemsSWR.mutate(cur); pushToast("error", (e as Error).message); }
    finally { void itemsSWR.revalidate(true); }
  }, [items, itemsSWR, pushToast, t]);

  const onDropDay = (dayKey: string) => {
    setOverKey(null);
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    const time = d.time || "10:00";
    reschedule(d.id, `${dayKey}T${time}`);
  };
  const onDropBacklog = () => {
    setOverKey(null);
    const d = dragRef.current; dragRef.current = null;
    if (d) reschedule(d.id, null);
  };
  const startDrag = (c: ContentItem) => { dragRef.current = { id: c.id, time: c.scheduled_at ? c.scheduled_at.slice(11, 16) : null }; };

  const openCreate = (date: string | null) => { setCreateDate(date); setCreateOpen(true); };

  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium border transition-colors ${
      active ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"
    }`;

  // การ์ดคอนเทนต์ (ใช้ทั้งในปฏิทินและกล่องค้าง)
  const Chip = ({ c, showTime }: { c: ContentItem; showTime?: boolean }) => {
    const m = CONTENT_STATUS_META[c.status] ?? CONTENT_STATUS_META.draft;
    const plats = (c.platforms ?? []).slice(0, 3).map((p) => platformLabel(p)).join(" · ");
    return (
      <button draggable onDragStart={() => startDrag(c)} onDragEnd={() => { dragRef.current = null; setOverKey(null); }}
        onClick={(e) => { e.stopPropagation(); setDetailId(c.id); }} title={`${c.title}${plats ? ` · ${plats}` : ""}`}
        className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded border flex items-center gap-1 cursor-pointer ${m.cls}`}>
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: brandColor(c.brand_id) }} />
        <span className="truncate">{showTime && c.scheduled_at ? `${c.scheduled_at.slice(11, 16)} ` : ""}{c.title}</span>
      </button>
    );
  };

  return (
    <StandaloneShell title={t("ปฏิทินคอนเทนต์", "Content Calendar")} icon="🗓️" accent="violet">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🗓️ {t("ปฏิทินคอนเทนต์", "Content Calendar")}</h1>
            <p className="text-slate-500 mt-1">{t("คอนเทนต์ทุกแบรนด์รวมที่เดียว · เรียงตามวันตั้งโพสต์ · ลากวางเปลี่ยนวันได้", "All content in one place · by scheduled date · drag to reschedule")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/tasks/content" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📋 {t("รายการคอนเทนต์", "Content list")}</a>
            <button onClick={() => openCreate(null)} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างคอนเทนต์", "Create Content")}</button>
          </div>
        </div>

        {/* แท็บแยกแบรนด์ (สี = ที่แต่งไว้ต่อแบรนด์) */}
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <button onClick={() => setBrandFilter("all")} className={tabCls(brandFilter === "all")}>{t("ทั้งหมด", "All")}</button>
          {brands.map((b) => {
            const st = styleMap[b.id];
            const active = brandFilter === b.id;
            const accent = st?.accent_color || b.color || "#cbd5e1";
            return (
              <button key={b.id} onClick={() => setBrandFilter(b.id)} className={tabCls(active)}
                style={active && st?.accent_color ? { background: st.accent_color, borderColor: st.accent_color, color: "#fff" } : undefined}>
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: active ? "#fff" : accent }} />
                {b.name}
              </button>
            );
          })}
          {brandFilter !== "all" && !(activeStyle?.accent_color || activeStyle?.bg_image_key) && (
            <button onClick={() => setStyleBrandId(brandFilter)} className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-sm text-slate-400 border border-dashed border-slate-300 hover:border-violet-300 hover:text-violet-700">🎨 {t("แต่งหน้าแท็บนี้", "Style this tab")}</button>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {/* แบนเนอร์แบรนด์ (แต่งหน้า) */}
        {activeStyle && (activeStyle.accent_color || activeStyle.bg_image_key) && (() => {
          const accent = activeStyle.accent_color || "#7c3aed";
          const bg = activeStyle.bg_image_key ? r2ImageUrl(activeStyle.bg_image_key, 800) : null;
          return (
            <div className="rounded-xl overflow-hidden border border-slate-200 mb-4" style={{ background: accent }}>
              <div className="h-16 flex items-center justify-between px-4 relative" style={bg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                <div className="absolute inset-0" style={{ background: bg ? `linear-gradient(to top, ${accent}cc, ${accent}33)` : "transparent" }} />
                <span className="relative text-white font-semibold text-lg drop-shadow">{brands.find((b) => b.id === brandFilter)?.name}</span>
                <button onClick={() => setStyleBrandId(brandFilter)} className="relative text-white/90 hover:text-white text-xs border border-white/40 rounded-full px-2.5 py-1">🎨 {t("แต่งหน้า", "Edit style")}</button>
              </div>
            </div>
          );
        })()}

        {/* แถบเดือน + สรุป */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => setOffset((o) => o - 1)} aria-label={t("เดือนก่อน", "Previous month")} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">‹</button>
            <h2 className="text-lg font-semibold text-slate-800 min-w-[150px] text-center">{monthName}</h2>
            <button onClick={() => setOffset((o) => o + 1)} aria-label={t("เดือนถัดไป", "Next month")} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">›</button>
            {offset !== 0 && <button onClick={() => setOffset(0)} className="h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">{t("วันนี้", "Today")}</button>}
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100 text-xs">🗓 {t("เดือนนี้", "This month")} {scheduledThisMonth}</span>
        </div>

        <div className="flex gap-4 items-start flex-col lg:flex-row">
          {/* ตารางปฏิทิน */}
          <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4">
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
                const isOver = overKey === key;
                return (
                  <div key={day} onClick={() => openCreate(`${key}T10:00`)}
                    onDragOver={(e) => { e.preventDefault(); if (overKey !== key) setOverKey(key); }}
                    onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
                    onDrop={() => onDropDay(key)}
                    className={`group relative min-h-[104px] rounded-lg border p-1.5 align-top cursor-pointer transition-colors ${isOver ? "border-violet-400 bg-violet-50 ring-1 ring-violet-300" : isToday ? "border-violet-300 bg-violet-50/40" : "border-slate-100 hover:bg-slate-50"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs px-0.5 ${isToday ? "font-semibold text-violet-700" : "text-slate-400"}`}>
                        {isToday ? <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-violet-600 text-white">{day}</span> : day}
                      </span>
                      <span className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-violet-600 text-sm leading-none" title={t("เพิ่มคอนเทนต์วันนี้", "Add content")}>＋</span>
                    </div>
                    <div className="space-y-1">
                      {list.slice(0, 4).map((c) => <Chip key={c.id} c={c} showTime />)}
                      {list.length > 4 && <div className="text-[10px] text-slate-400 pl-0.5">+{list.length - 4} {t("อื่น ๆ", "more")}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">💡 {t("คลิกช่องวันว่าง = เพิ่มงาน · ลากการ์ดข้ามวัน = เปลี่ยนวัน · จุดสี = แบรนด์", "Click a day = add · drag a card = reschedule · color dot = brand")}</p>
          </div>

          {/* กล่อง "ยังไม่ลงวันที่" — ลากไปวางในวันได้ */}
          <div onDragOver={(e) => { e.preventDefault(); if (overKey !== "backlog") setOverKey("backlog"); }}
            onDragLeave={() => setOverKey((k) => (k === "backlog" ? null : k))}
            onDrop={onDropBacklog}
            className={`w-full lg:w-[260px] shrink-0 rounded-xl border p-3 ${overKey === "backlog" ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-slate-700">📥 {t("ยังไม่ลงวันที่", "Unscheduled")}</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{unscheduled.length}</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">{t("ลากการ์ดไปวางในวันที่ต้องการโพสต์ · หรือลากการ์ดจากปฏิทินมาที่นี่เพื่อเอาวันออก", "Drag a card onto a day · or drop here to clear its date")}</p>
            {unscheduled.length === 0 ? (
              <div className="text-center text-xs text-slate-300 py-6">{t("ไม่มีงานค้าง 🎉", "All scheduled 🎉")}</div>
            ) : (
              <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-0.5">
                {unscheduled.map((c) => (
                  <div key={c.id} draggable onDragStart={() => startDrag(c)} onDragEnd={() => { dragRef.current = null; setOverKey(null); }}
                    onClick={() => setDetailId(c.id)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer hover:border-violet-300 flex items-center gap-2">
                    <span className="text-slate-300 shrink-0" title={t("ลากเพื่อจัดวัน", "Drag to schedule")}>⠿</span>
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: brandColor(c.brand_id) }} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-700 truncate">{c.title}</div>
                      <div className="text-[10px] text-slate-400 truncate">{c.brand_label ?? c.sku_code ?? c.campaign_label ?? c.content_no ?? ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {detailId && <ContentDrawer contentId={detailId} brands={brands} onClose={() => setDetailId(null)} onChanged={reload} pushToast={pushToast} />}

      <ContentCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); reload(); }}
        brands={brands} campaigns={campaigns} templates={templates}
        defaultBrandId={brandFilter === "all" ? null : brandFilter} defaultDate={createDate} pushToast={pushToast} />

      {styleBrandId && (() => {
        const b = brands.find((x) => x.id === styleBrandId);
        return b ? (
          <BrandStyleModal brand={b} current={styleMap[styleBrandId] ?? null} onClose={() => setStyleBrandId(null)}
            onSaved={(s) => {
              const rest = (stylesSWR.data ?? []).filter((x) => x.brand_id !== s.brand_id);
              stylesSWR.mutate((s.accent_color || s.bg_image_key) ? [...rest, s] : rest);
              setStyleBrandId(null);
            }} pushToast={pushToast} />
        ) : null;
      })()}

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((x) => <div key={x.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${x.type === "success" ? "bg-emerald-600" : x.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{x.message}</div>)}
      </div>
    </StandaloneShell>
  );
}
