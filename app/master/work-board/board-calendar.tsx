"use client";

/**
 * BoardCalendar — มุมมองปฏิทินของบอร์ดจ่ายงาน (2 ปฏิทินในตัวเดียว)
 *
 *  1) 📦 นัดส่งลูกค้า  = วันกำหนดส่งของ "ใบสั่งผลิต" (manufacturing_orders.due_date)
 *  2) 🪑 นัดส่งงาน (ภายใน) = วันกำหนดเสร็จของ "ใบจ่ายงาน" ที่จ่ายให้โต๊ะ/ช่าง (mo_work_orders.due_date)
 *
 * ทำอะไรได้:
 *  - ดูเป็นเดือน · เลื่อนเดือน · กดวันนี้ · นับงาน/ชิ้นต่อวัน
 *  - งานที่ "ยังไม่กำหนดวัน" อยู่แถบบนสุด → ลากไปวางบนวัน = ตั้งวันให้เลย
 *  - ลากการ์ดในปฏิทินไปวางวันอื่น = เลื่อนวัน · ลากกลับแถบบน = ล้างวัน
 *  - กดการ์ด = เปิดรายละเอียดงาน (ป๊อปเดียวกับบอร์ด)
 *
 * ของกลาง: apiFetch · useToast · HoverImage · /api/mo/set-due-date (ใบสั่งผลิต) · /api/mo/work-orders/<id> (ใบจ่ายงาน)
 */
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { HoverImage } from "@/components/hover-image";

type CalMO = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; remaining: number; due_date: string | null; image_url: string | null;
  brand?: string | null; brand_oem?: boolean; ready?: boolean;
};
type CalWO = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; due_date?: string | null; department_name?: string | null; assignee_name: string | null;
  image_url?: string | null; status: string; brand?: string | null; brand_oem?: boolean;
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TH_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export function BoardCalendar({ pending, workOrders, canEdit, moGroups, groupOf, onOpenMO, onOpenWO, onReload }: {
  pending: CalMO[];
  workOrders: CalWO[];
  canEdit: boolean;
  moGroups: { name: string; mo_nos: string[] }[];
  groupOf: (moNo: string) => string | null;
  onOpenMO: (moId: string) => void;
  onOpenWO: (woId: string) => void;
  onReload: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"customer" | "internal">("customer");
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<{ kind: "mo" | "wo"; id: string; label: string } | null>(null);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("__all__");
  const [brandFilter, setBrandFilter] = useState("__all__");
  // นัดส่งลูกค้า: ปกติโชว์เฉพาะ "งานลูกค้า (OEM)" — ของแบรนด์เราเองไม่ใช่นัดส่งลูกค้า
  // แต่บางทีก็ต้องส่งของแบรนด์เราไปขาย offline → กดสวิตช์นี้เพื่อโชว์เพิ่ม
  const [showOwn, setShowOwn] = useState(false);

  const today = ymd(new Date());

  // ── รายการที่จะวางบนปฏิทิน (ตามโหมด) ──
  type Item = { key: string; kind: "mo" | "wo"; id: string; moNo: string; date: string | null; sku: string | null; name: string | null; qty: number; img: string | null; sub: string; brand: string | null; oem: boolean };
  const allItems: Item[] = useMemo(() => {
    if (mode === "customer") {
      return pending.map((m) => ({
        key: `mo:${m.id}`, kind: "mo" as const, id: m.id, moNo: m.mo_no, date: m.due_date, sku: m.product_sku, name: m.product_name,
        qty: m.remaining, img: m.image_url, sub: `${m.mo_no}${m.brand ? ` · ${m.brand}` : ""}`, brand: m.brand ?? null, oem: !!m.brand_oem,
      }));
    }
    return workOrders.filter((w) => w.status !== "done").map((w) => ({
      key: `wo:${w.id}`, kind: "wo" as const, id: w.id, moNo: w.mo_no, date: w.due_date ?? null, sku: w.product_sku, name: w.product_name,
      qty: w.qty, img: w.image_url ?? null, sub: `${w.department_name ?? "—"}${w.assignee_name ? ` · ${w.assignee_name}` : ""}`, brand: w.brand ?? null, oem: !!w.brand_oem,
    }));
  }, [mode, pending, workOrders]);

  const brandOptions = useMemo(() => [...new Set(allItems.map((i) => i.brand).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "th")), [allItems]);
  const ownCount = useMemo(() => (mode === "customer" ? allItems.filter((i) => !i.oem).length : 0), [allItems, mode]);

  const items: Item[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((i) => {
      // นัดส่งลูกค้า = เฉพาะงาน OEM (รับจ้างผลิต) เว้นแต่กดโชว์แบรนด์เราเอง
      if (mode === "customer" && !showOwn && !i.oem) return false;
      if (groupFilter !== "__all__") {
        const g = groupOf(i.moNo);
        if (groupFilter === "__none__" ? g !== null : g !== groupFilter) return false;
      }
      if (brandFilter !== "__all__") {
        if (brandFilter === "__none__" ? !!i.brand : i.brand !== brandFilter) return false;
      }
      if (q && !`${i.sku ?? ""} ${i.name ?? ""} ${i.moNo} ${i.sub}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allItems, mode, showOwn, groupFilter, brandFilter, groupOf, search]);

  const byDate = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) { if (!it.date) continue; const k = it.date.slice(0, 10); (m.get(k) ?? m.set(k, []).get(k)!).push(it); }
    return m;
  }, [items]);
  const noDate = useMemo(() => items.filter((i) => !i.date), [items]);

  // ── ตารางเดือน (เริ่มวันอาทิตย์) ──
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const inMonth = (d: Date) => d.getMonth() === cursor.getMonth();

  // ── ตั้ง/ล้างวัน ──
  const setDate = async (it: { kind: "mo" | "wo"; id: string; label: string }, date: string | null) => {
    if (!canEdit) return;
    setBusy(true);
    try {
      const res = it.kind === "mo"
        ? await apiFetch("/api/mo/set-due-date", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, due_date: date }) })
        : await apiFetch(`/api/mo/work-orders/${encodeURIComponent(it.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ due_date: date }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(date ? `ตั้งวัน ${it.label} → ${new Date(date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" })}` : `ล้างวันของ ${it.label} แล้ว`);
      await onReload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ตั้งวันไม่สำเร็จ"); }
    finally { setBusy(false); setDrag(null); }
  };

  const chip = (it: Item, compact = false) => (
    <div key={it.key}
      draggable={canEdit}
      onDragStart={() => setDrag({ kind: it.kind, id: it.id, label: it.sku ?? it.sub })}
      onDragEnd={() => setDrag(null)}
      onClick={() => (it.kind === "mo" ? onOpenMO(it.id) : onOpenWO(it.id))}
      title={`${it.sku ?? ""} ${it.name ?? ""}\n${it.sub}\n${fmt(it.qty)} ชิ้น${canEdit ? "\n(ลากไปวางวันอื่นเพื่อเลื่อนวัน)" : ""}`}
      className={`group flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-0.5 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 ${canEdit ? "active:cursor-grabbing" : ""}`}>
      <HoverImage url={it.img} size={compact ? 16 : 20} previewSize={220} />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold text-slate-700 truncate leading-tight">{it.sku ?? "—"}</span>
        {!compact && <span className="block text-[9px] text-slate-400 truncate leading-tight">{it.sub}</span>}
      </span>
      <span className="shrink-0 text-[9px] text-indigo-700 font-semibold">{fmt(it.qty)}</span>
    </div>
  );

  return (
    <div className="space-y-2">
      {/* แถบเครื่องมือ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          <button onClick={() => setMode("customer")} className={`h-9 px-3 font-medium ${mode === "customer" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📦 นัดส่งลูกค้า</button>
          <button onClick={() => setMode("internal")} className={`h-9 px-3 font-medium border-l border-slate-200 ${mode === "internal" ? "bg-violet-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🪑 นัดส่งงาน (ภายใน)</button>
        </div>
        <div className="inline-flex items-center gap-1">
          <button onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="h-9 w-9 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">‹</button>
          <span className="min-w-[150px] text-center text-sm font-semibold text-slate-700">{monthLabel}</span>
          <button onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="h-9 w-9 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">›</button>
          <button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">วันนี้</button>
        </div>
        <span className="text-[11px] text-slate-500">
          {mode === "customer" ? "วันกำหนดส่งของใบสั่งผลิต (ส่งลูกค้า)" : "วันกำหนดเสร็จของใบจ่ายงาน (ช่าง/โต๊ะ)"}
          {" · "}มีวันแล้ว {items.length - noDate.length} · ยังไม่กำหนด {noDate.length}
        </span>
      </div>

      {/* ค้นหา + กรอง */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ค้นหา รหัส / ชื่อ / เลขใบ / โต๊ะ-ช่าง…"
          className="h-8 px-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[220px] flex-1 max-w-sm" />
        {moGroups.length > 0 && (
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} title="กรองตามกลุ่มงาน"
            className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white text-slate-600">
            <option value="__all__">🗂 ทุกกลุ่ม</option>
            {moGroups.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
            <option value="__none__">— ยังไม่จับกลุ่ม —</option>
          </select>
        )}
        {brandOptions.length > 0 && (
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} title="กรองตามแบรนด์"
            className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white text-slate-600">
            <option value="__all__">🏷 ทุกแบรนด์</option>
            {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
            <option value="__none__">— ไม่ระบุแบรนด์ —</option>
          </select>
        )}
        {mode === "customer" && (
          <label className={`flex items-center gap-1.5 h-8 px-2.5 text-[12px] rounded-lg border cursor-pointer ${showOwn ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600"}`}
            title="ปกติปฏิทินนี้โชว์เฉพาะงานลูกค้า (OEM) — ติ๊กเพื่อโชว์ของแบรนด์เราเองด้วย (เช่น ส่งไปขาย offline)">
            <input type="checkbox" checked={showOwn} onChange={(e) => setShowOwn(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
            🏷 รวมแบรนด์เราเอง{ownCount > 0 ? ` (${ownCount})` : ""}
          </label>
        )}
      </div>

      {/* ยังไม่กำหนดวัน — ลากไปวางบนวันได้ */}
      <div
        onDragOver={(e) => { if (canEdit && drag) e.preventDefault(); }}
        onDrop={() => { if (canEdit && drag) void setDate(drag, null); }}
        className="rounded-xl border border-amber-200 bg-amber-50/60 p-2">
        <div className="text-[11px] font-semibold text-amber-800 mb-1">
          ⏳ ยังไม่กำหนดวัน ({noDate.length}) <span className="font-normal text-amber-600">{canEdit ? "— ลากไปวางบนวันในปฏิทินเพื่อตั้งวัน · ลากกลับมาที่นี่ = ล้างวัน" : ""}</span>
        </div>
        {noDate.length === 0 ? <div className="text-[11px] text-amber-600/70 py-1">กำหนดวันครบทุกงานแล้ว 🎉</div> : (
          <div className="grid gap-1 max-h-28 overflow-y-auto scrollbar-hide" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {noDate.slice(0, 200).map((it) => chip(it, true))}
          </div>
        )}
      </div>

      {/* ตารางเดือน */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {TH_DAYS.map((d, i) => <div key={d} className={`px-2 py-1 text-[11px] font-semibold text-center ${i === 0 || i === 6 ? "text-rose-500" : "text-slate-500"}`}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const key = ymd(d);
            const list = byDate.get(key) ?? [];
            const isToday = key === today;
            const past = key < today;
            const qty = list.reduce((n, x) => n + x.qty, 0);
            return (
              <div key={key}
                onDragOver={(e) => { if (canEdit && drag) e.preventDefault(); }}
                onDrop={() => { if (canEdit && drag) void setDate(drag, key); }}
                className={`min-h-[110px] border-b border-r border-slate-100 p-1 ${inMonth(d) ? "bg-white" : "bg-slate-50/60"} ${isToday ? "ring-2 ring-inset ring-indigo-400" : ""} ${canEdit && drag ? "hover:bg-indigo-50/50" : ""}`}>
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className={`text-[11px] font-semibold ${isToday ? "text-indigo-700" : inMonth(d) ? "text-slate-600" : "text-slate-300"}`}>{d.getDate()}</span>
                  {list.length > 0 && (
                    <span className={`text-[9px] px-1 rounded ${past ? "bg-rose-100 text-rose-700" : "bg-indigo-50 text-indigo-700"}`}>{list.length} ใบ · {fmt(qty)}</span>
                  )}
                </div>
                <div className="space-y-0.5 max-h-[120px] overflow-y-auto scrollbar-hide">{list.map((it) => chip(it, true))}</div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-slate-400">
        กดการ์ด = เปิดรายละเอียดงาน · {canEdit ? "ลากการ์ดวางบนวัน = ตั้ง/เลื่อนวัน (บันทึกทันที)" : "ดูอย่างเดียว (ไม่มีสิทธิ์แก้)"} · วันที่ผ่านมาแล้วขึ้นป้ายแดง
      </p>
      {busy && <div className="text-[11px] text-indigo-500">กำลังบันทึก…</div>}
    </div>
  );
}
