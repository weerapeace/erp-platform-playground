"use client";

// ============================================================
// ปฏิทินจัดซื้อ — 2 โหมด: 📦 ของเข้า (expected_date) · 💰 จ่ายเงิน (payment_due_date)
// ใช้ ScheduleBoard (ของกลาง): ลากการ์ดไปวางบนวัน = ตั้งวัน · ปุ่ม "ติดตาม" (งานเร่ง) เน้นแดง
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { ScheduleBoard, type SchedFilter } from "@/components/schedule-board";
import { HoverImage } from "@/components/hover-image";
import type { PoCalItem } from "@/app/api/purchasing/calendar/route";

const baht = (n: number) => "฿" + Math.round(n || 0).toLocaleString("th-TH");

export default function PurchasingCalendarPage() {
  const [mode, setMode] = useState<"in" | "pay">("in");
  const [items, setItems] = useState<PoCalItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/purchasing/calendar?mode=${mode}`).then((r) => r.json())
      .then((j) => setItems((j.data ?? []) as PoCalItem[])).catch(() => setItems([])).finally(() => setLoading(false));
  }, [mode]);
  useEffect(() => { load(); }, [load]);

  const dateField = mode === "pay" ? "payment_due_date" : "expected_date";

  // ลากตั้งวัน (optimistic + เซฟจริง)
  const setDate = async (it: PoCalItem, date: string | null) => {
    const prev = it.date;
    setItems((is) => is.map((x) => (x.id === it.id ? { ...x, date } : x)));
    try {
      const r = await apiFetch("/api/purchasing/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, [dateField]: date }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
    } catch { setItems((is) => is.map((x) => (x.id === it.id ? { ...x, date: prev } : x))); }
  };
  // ติดตาม (งานเร่ง)
  const toggleFollow = async (it: PoCalItem) => {
    const next = !it.follow_up;
    setItems((is) => is.map((x) => (x.id === it.id ? { ...x, follow_up: next } : x)));
    try {
      const r = await apiFetch("/api/purchasing/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, follow_up: next }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
    } catch { setItems((is) => is.map((x) => (x.id === it.id ? { ...x, follow_up: !next } : x))); }
  };

  const filters = useMemo<SchedFilter[]>(() => {
    const s = [...new Set(items.map((i) => i.seller_name).filter(Boolean) as string[])].sort();
    return [{ value: "all", label: "ทุกร้าน" }, ...s.map((x) => ({ value: x, label: x }))];
  }, [items]);

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">📅 ปฏิทินจัดซื้อ</h1>
            <p className="text-sm text-slate-500 mt-1">ลากใบสั่งซื้อไปวางบนวัน = ตั้งวัน · กด ⚑ = ติดตาม (งานเร่ง)</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setMode("in")} className={`text-sm px-3 py-1.5 rounded-md font-medium ${mode === "in" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>📦 ของเข้า</button>
              <button onClick={() => setMode("pay")} className={`text-sm px-3 py-1.5 rounded-md font-medium ${mode === "pay" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>💰 จ่ายเงิน</button>
            </div>
            <button onClick={load} disabled={loading} className="h-9 px-2.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm">🔄</button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 max-w-5xl mx-auto w-full">
        <ScheduleBoard<PoCalItem>
          items={items}
          getDate={(i) => i.date}
          onSchedule={setDate}
          filters={filters}
          getFilter={(i) => i.seller_name ?? undefined}
          getSearchText={(i) => `${i.po_no} ${i.seller_name ?? ""}`}
          backlogTitle={mode === "pay" ? "ยังไม่ลงวันจ่าย" : "ยังไม่ลงวันเข้า"}
          hint={mode === "pay" ? "ลากไปวางบนวัน = ตั้งวันวางแผนจ่ายเงิน · กด ⚑ = ติดตาม" : "ลากไปวางบนวัน = ตั้งวันคาดว่าของจะเข้า · กด ⚑ = ติดตาม"}
          dayFooter={(its) => {
            const total = its.reduce((a, x) => a + x.amount_thb, 0);
            const hasF = its.some((x) => x.follow_up);
            return <div className={`text-[9px] px-1 tabular-nums ${hasF ? "text-rose-600 font-semibold" : "text-slate-400"}`}>รวม {baht(total)}</div>;
          }}
          renderChip={(i) => (
            <div title={`${i.po_no} · ${i.seller_name ?? ""}`}
              className={`text-[9px] leading-tight rounded px-1 py-0.5 flex items-center gap-1 ${i.follow_up ? "bg-rose-50 text-rose-700 font-bold" : "bg-slate-100 text-slate-600"}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${i.follow_up ? "bg-rose-500" : "bg-slate-400"}`} />
              <span className="truncate flex-1">{i.po_no}</span>
              <span className="shrink-0 tabular-nums">{baht(i.amount_thb)}</span>
            </div>
          )}
          renderCard={(i) => (
            <div className={`rounded-xl border bg-white p-2.5 ${i.follow_up ? "border-rose-300" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{i.po_no}</div>
                  <div className="text-[11px] text-slate-400 truncate">🏪 {i.seller_name || "—"}</div>
                </div>
                <span className="text-xs font-medium text-slate-700 tabular-nums shrink-0">{baht(i.amount_thb)}</span>
              </div>
              {/* สินค้าในใบ — รูปเล็กๆ (ชี้เพื่อดูรูปใหญ่) + จำนวนรายการ */}
              {i.products.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                  {i.products.map((p, idx) => (
                    <span key={idx} title={`${p.name}${p.qty ? ` × ${p.qty}` : ""}`} className="inline-flex">
                      <HoverImage url={p.img} size={26} alt={p.name} fallback="📦" />
                    </span>
                  ))}
                  {i.product_count > i.products.length && (
                    <span className="text-[10px] text-slate-400 self-center px-0.5">+{i.product_count - i.products.length}</span>
                  )}
                </div>
              )}
              <button onClick={(e) => { e.stopPropagation(); toggleFollow(i); }}
                className={`mt-1.5 w-full text-xs py-1 rounded-lg border ${i.follow_up ? "bg-rose-50 border-rose-300 text-rose-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                {i.follow_up ? "⚑ กำลังติดตาม (งานเร่ง)" : "⚐ กดติดตาม"}
              </button>
            </div>
          )}
        />
      </div>
    </PlaygroundShell>
  );
}
