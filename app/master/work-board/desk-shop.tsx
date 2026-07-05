"use client";

/**
 * "งานในโต๊ะ" (ช้อป) — มุมมองแบบช้อปปิ้งของงานที่จ่ายเข้าโต๊ะแล้ว (ใบจ่ายงาน active)
 *  • การ์ด + ค้นหา / เรียง / จัดกลุ่ม (โต๊ะ/ช่าง) / กรอง (โต๊ะ) — คู่กับมุมมอง "รอจ่าย"
 *  • ปุ่มรายใบ "📤 ส่งงาน" → เปิดป๊อปรายละเอียด/ส่งงานเดิม (ผ่าน onOpenWO)
 * ของกลาง: HoverImage · reuse ป๊อปส่งงานเดิมของบอร์ด
 */
import { useMemo, useState } from "react";
import { HoverImage } from "@/components/hover-image";

type ShopWO = {
  id: string; wo_no: string; mo_no: string; product_sku: string | null; product_name: string | null;
  department_id: string | null; department_name: string | null; assignee_name: string | null;
  qty: number; received_qty: number; status: string; due_date: string | null;
  image_url?: string | null; brand_color?: string | null;
};
type ShopDept = { id: string; name: string };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const daysUntil = (due: string | null): number | null => {
  if (!due) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.floor((new Date(due + "T00:00:00").getTime() - t.getTime()) / 86400000);
};
const dueText = (due: string | null) => (due ? new Date(due + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");
const dueClass = (due: string | null) => { const d = daysUntil(due); if (d == null) return "text-slate-400"; if (d < 0) return "text-rose-600 font-semibold"; if (d < 3) return "text-amber-600 font-semibold"; return "text-slate-500"; };
const WO_ST: Record<string, { t: string; c: string }> = {
  dispatched: { t: "จ่ายแล้ว", c: "bg-blue-50 text-blue-700" },
  in_progress: { t: "กำลังทำ", c: "bg-amber-50 text-amber-700" },
  partial_return: { t: "ส่งบางส่วน", c: "bg-orange-50 text-orange-700" },
  done: { t: "ส่งครบ", c: "bg-emerald-50 text-emerald-700" },
};

type SortKey = "due" | "remaining" | "sku";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "due", label: "ใกล้ครบกำหนด" },
  { key: "remaining", label: "เหลือส่งมาก→น้อย" },
  { key: "sku", label: "รหัสสินค้า" },
];

export function DeskShop({ workOrders, departments, onOpenWO }: {
  workOrders: ShopWO[];
  departments: ShopDept[];
  onOpenWO: (wo: ShopWO) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [groupMode, setGroupMode] = useState<"desk" | "worker" | "none">("desk");
  const [deptFilter, setDeptFilter] = useState<string>("__all__");

  const remaining = (w: ShopWO) => Math.max(0, (w.qty || 0) - (w.received_qty || 0));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = workOrders.filter((w) =>
      w.status !== "done" &&                                            // ยังอยู่ในโต๊ะ (ส่งครบแล้ว = ออกไป)
      (deptFilter === "__all__" || w.department_id === deptFilter) &&
      (q === "" || `${w.product_sku ?? ""} ${w.product_name ?? ""} ${w.mo_no} ${w.wo_no} ${w.assignee_name ?? ""} ${w.department_name ?? ""}`.toLowerCase().includes(q)));
    return [...list].sort((a, b) =>
      sortKey === "due" ? (daysUntil(a.due_date) ?? 99999) - (daysUntil(b.due_date) ?? 99999) :
      sortKey === "remaining" ? remaining(b) - remaining(a) :
      String(a.product_sku ?? "").localeCompare(String(b.product_sku ?? "")));
  }, [workOrders, search, deptFilter, sortKey]);

  const buckets = useMemo(() => {
    if (groupMode === "none") return [{ name: "", items: filtered }];
    const m = new Map<string, ShopWO[]>();
    for (const w of filtered) { const k = (groupMode === "desk" ? w.department_name : w.assignee_name) ?? "— ไม่ระบุ —"; (m.get(k) ?? m.set(k, []).get(k)!).push(w); }
    return [...m.entries()].map(([name, items]) => ({ name, items })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [filtered, groupMode]);

  const gridCls = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5";
  const selCls = "h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500";

  const renderCard = (w: ShopWO) => {
    const st = WO_ST[w.status] ?? WO_ST.dispatched;
    return (
      <div key={w.id} onClick={() => onOpenWO(w)}
        className="rounded-xl bg-white border border-slate-200 shadow-sm p-2.5 cursor-pointer hover:border-indigo-300"
        style={w.brand_color ? { borderLeft: `4px solid ${w.brand_color}` } : undefined}>
        <div className="flex items-start gap-2">
          <div className="shrink-0"><HoverImage url={w.image_url ?? null} size={44} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-slate-800 truncate">{w.product_sku}</span>
              <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full ${st.c}`}>{st.t}</span>
            </div>
            <div className="text-[11px] text-slate-500 truncate">{w.product_name}</div>
            <div className="text-[10px] text-slate-400 font-mono truncate">{w.wo_no} · {w.mo_no}</div>
            <div className="text-[11px] text-slate-500 truncate">👤 {w.assignee_name ?? w.department_name ?? "—"}</div>
          </div>
          <span className={`text-[11px] shrink-0 ${dueClass(w.due_date)}`}>📅 {dueText(w.due_date)}</span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-2">
          <span className="text-[11px] text-slate-500">จ่าย {fmt(w.qty)} · ส่งแล้ว {fmt(w.received_qty)} · <b className="text-indigo-600">เหลือ {fmt(remaining(w))}</b></span>
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpenWO(w); }} className="text-[11px] px-2 py-1 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 shrink-0">📤 ส่งงาน</button>
        </div>
      </div>
    );
  };

  const activeDepts = departments.filter((d) => workOrders.some((w) => w.department_id === d.id && w.status !== "done"));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา สินค้า / ใบสั่งผลิต / ใบจ่ายงาน / ช่าง / โต๊ะ"
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[200px] flex-1" />
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} title="เรียงลำดับ" className={selCls}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>↕ {s.label}</option>)}
        </select>
        <select value={groupMode} onChange={(e) => setGroupMode(e.target.value as "desk" | "worker" | "none")} title="จัดกลุ่ม" className={selCls}>
          <option value="desk">จัดกลุ่ม: โต๊ะ</option>
          <option value="worker">จัดกลุ่ม: ช่าง</option>
          <option value="none">ไม่จัดกลุ่ม</option>
        </select>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} title="กรองโต๊ะ" className={selCls}>
          <option value="__all__">🪑 ทุกโต๊ะ</option>
          {activeDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-1 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-300 text-sm">ไม่มีงานในโต๊ะ (งานที่จ่ายเข้าโต๊ะแล้วยังไม่ส่งครบจะมาโชว์ที่นี่)</div>
        ) : groupMode === "none" ? (
          <div className={gridCls}>{filtered.map(renderCard)}</div>
        ) : (
          buckets.map((b) => {
            const pcs = b.items.reduce((n, w) => n + remaining(w), 0);
            return (
              <div key={b.name}>
                <div className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 mb-2 flex items-center justify-between">
                  <span>{groupMode === "desk" ? "🪑 " : "👤 "}{b.name} <span className="text-slate-400 font-normal">({b.items.length} ใบ)</span></span>
                  <span className="text-slate-400 font-normal">เหลือส่งรวม {fmt(pcs)} ชิ้น</span>
                </div>
                <div className={gridCls}>{b.items.map(renderCard)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
