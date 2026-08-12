"use client";

/**
 * "แผนผู้บริหาร" — แท็บใน /master/work-board (เห็นเฉพาะแอดมิน)
 *
 * ทำไมต้องมี: บอร์ด/ช้อปจ่ายงานตอบว่า "งานไหนพร้อมทำ" แต่ไม่ตอบว่า "งานไหนคุ้มเงินที่สุด"
 *   หน้านี้เอาใบสั่งผลิตที่ยังเปิดอยู่มาตีเป็นเงิน — ราคาขาย × จำนวน, ต้นทุนวัตถุดิบ, กำไรประมาณ —
 *   แล้วให้ผู้บริหารติดธง "เร่งด่วน/สำคัญ" ซึ่งไปโผล่บนการ์ดหน้าช้อปจ่ายงานให้คนจ่ายงานเห็น
 *
 * 🔒 ตัวเลขทั้งหมดมาจาก /api/mo/exec-plan ซึ่งล็อกด้วยสิทธิ์ admin.users ที่ฝั่งเซิร์ฟเวอร์
 *    (ซ่อนแท็บอย่างเดียวไม่พอ — คนไม่มีสิทธิ์ยิง API ตรงก็ไม่ได้ข้อมูล)
 * ของกลางที่ใช้: apiFetch · useToast · HoverImage · ERPModal
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { HoverImage } from "@/components/hover-image";
import { ERPModal } from "@/components/modal";

export type ExecRow = {
  id: string; mo_no: string;
  product_sku: string | null; product_name: string | null; color: string | null;
  image_url: string | null; brand: string | null; brand_color: string | null;
  qty: number; dispatched: number; remaining: number;
  due_date: string | null; status: string | null;
  priority: number; priority_note: string | null; priority_by: string | null;
  list_price: number; mat_cost: number; mat_no_price: number;
  labor_cost: number; labor_src: "central" | "est" | "none"; piece_cost: number; labor_paid: number;
  has_bom: boolean; prep_total: number; prep_ready: number; cut_total: number; cut_ready: number; ready: boolean;
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const money = (n: number) => "฿" + (Math.round(n)).toLocaleString("th-TH");
const moneyK = (n: number) => (Math.abs(n) >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)}M` : Math.abs(n) >= 1000 ? `฿${Math.round(n / 1000).toLocaleString("th-TH")}K` : money(n));
const daysUntil = (due: string | null): number | null => {
  if (!due) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.floor((new Date(due + "T00:00:00").getTime() - t.getTime()) / 86400000);
};
const dueText = (due: string | null) => (due ? new Date(due + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const dueClass = (due: string | null) => { const d = daysUntil(due); if (d == null) return "text-slate-400"; if (d < 0) return "text-rose-600 font-semibold"; if (d < 7) return "text-amber-600 font-semibold"; return "text-slate-500"; };
const monthKey = (due: string | null) => (due ? due.slice(0, 7) : "9999-99");
const monthLabel = (key: string) => (key === "9999-99" ? "— ยังไม่กำหนดวันส่ง —" : new Date(key + "-01T00:00:00").toLocaleDateString("th-TH", { month: "long", year: "numeric" }));

const PRIO: Record<number, { label: string; icon: string; cls: string; dot: string }> = {
  2: { label: "เร่งด่วน", icon: "🔥", cls: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  1: { label: "สำคัญ", icon: "⭐", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  0: { label: "ปกติ", icon: "", cls: "bg-white text-slate-400 border-slate-200", dot: "bg-slate-300" },
};

/** ต้นทุนรวม/ชิ้น (วัตถุดิบ + ค่าแรงผลิต + ค่าแรงเหมา) */
const unitCost = (r: ExecRow) => r.mat_cost + r.labor_cost + r.piece_cost;
/** กำไร/ชิ้น — คิดได้ต่อเมื่อ "มีราคาขาย" และ "มีสูตรวัตถุดิบ" (ไม่งั้นเป็นตัวเลขหลอก) */
const canProfit = (r: ExecRow) => r.list_price > 0 && r.has_bom;
const unitProfit = (r: ExecRow) => r.list_price - unitCost(r);
const marginPct = (r: ExecRow) => (r.list_price > 0 ? (unitProfit(r) / r.list_price) * 100 : 0);

type SortKey = "value" | "due" | "profit" | "margin" | "priority";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "value", label: "มูลค่าค้าง มาก→น้อย" },
  { key: "priority", label: "งานเร่งก่อน" },
  { key: "due", label: "ใกล้ครบกำหนด" },
  { key: "profit", label: "กำไร/ชิ้น มาก→น้อย" },
  { key: "margin", label: "%มาร์จิน มาก→น้อย" },
];
type GroupMode = "month" | "brand" | "none";
type FilterKey = "all" | "urgent" | "noprice" | "ready" | "late" | "pending";

export function ExecPlan({ onOpenMO }: { onOpenMO?: (moId: string) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<ExecRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  // เริ่มที่ "ไม่จัดกลุ่ม" — ข้อมูลจริงตอนนี้เกือบทุกใบยังไม่กรอกวันกำหนดส่ง
  // ถ้าจัดกลุ่มตามเดือนตั้งแต่แรกจะกองอยู่ถังเดียว ("ยังไม่กำหนดวันส่ง") ดูไม่รู้เรื่อง
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [flagFor, setFlagFor] = useState<ExecRow | null>(null);   // ป๊อปติดธงงานเร่ง
  const [flagVal, setFlagVal] = useState(0);
  const [flagNote, setFlagNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await apiFetch("/api/mo/exec-plan");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setRows((j.rows ?? []) as ExecRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter === "urgent" && r.priority === 0) return false;
      if (filter === "noprice" && r.list_price > 0) return false;
      if (filter === "ready" && !r.ready) return false;
      if (filter === "late" && (daysUntil(r.due_date) ?? 99999) >= 0) return false;
      if (filter === "pending" && !(r.remaining > 0.0001)) return false;
      if (q && !`${r.product_sku ?? ""} ${r.product_name ?? ""} ${r.mo_no} ${r.brand ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const val = (r: ExecRow) => r.remaining * r.list_price;
    return [...list].sort((a, b) => {
      if (sortKey === "value") return val(b) - val(a);
      if (sortKey === "due") return (daysUntil(a.due_date) ?? 99999) - (daysUntil(b.due_date) ?? 99999);
      if (sortKey === "profit") return unitProfit(b) - unitProfit(a);
      if (sortKey === "margin") return marginPct(b) - marginPct(a);
      // งานเร่งก่อน → แล้วค่อยใกล้ครบกำหนด
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (daysUntil(a.due_date) ?? 99999) - (daysUntil(b.due_date) ?? 99999);
    });
  }, [rows, search, filter, sortKey]);

  // ยอดรวมของ "รายการที่เห็นอยู่ตอนนี้" (ตัวกรองมีผลกับ KPI ด้วย — จะได้ดูรายเดือน/รายแบรนด์ได้)
  const kpi = useMemo(() => {
    let value = 0, valueAll = 0, qty = 0, profit = 0, profitBase = 0, profitUnknown = 0;
    let late = 0, urgent = 0, noPrice = 0, noLabor = 0, noDue = 0;
    for (const r of filtered) {
      value += r.remaining * r.list_price;
      valueAll += r.qty * r.list_price;
      qty += r.remaining;
      if (canProfit(r)) { profit += unitProfit(r) * r.remaining; profitBase += r.remaining * r.list_price; } else profitUnknown += 1;
      if ((daysUntil(r.due_date) ?? 99999) < 0) late += 1;
      if (r.priority > 0) urgent += 1;
      if (!(r.list_price > 0)) noPrice += 1;
      if (!(r.labor_cost > 0) && !(r.piece_cost > 0)) noLabor += 1;
      if (!r.due_date) noDue += 1;
    }
    return { value, valueAll, qty, profit, profitBase, profitUnknown, late, urgent, noPrice, noLabor, noDue, count: filtered.length };
  }, [filtered]);

  const buckets = useMemo(() => {
    if (groupMode === "none") return [{ key: "", label: "", items: filtered }];
    const map = new Map<string, ExecRow[]>();
    for (const r of filtered) {
      const k = groupMode === "month" ? monthKey(r.due_date) : (r.brand ?? "— ไม่ระบุแบรนด์ —");
      const arr = map.get(k) ?? []; arr.push(r); map.set(k, arr);
    }
    return [...map.entries()]
      .sort((a, b) => (groupMode === "month" ? a[0].localeCompare(b[0]) : a[0].localeCompare(b[0], "th")))
      .map(([key, items]) => ({ key, label: groupMode === "month" ? monthLabel(key) : key, items }));
  }, [filtered, groupMode]);

  const openFlag = (r: ExecRow) => { setFlagFor(r); setFlagVal(r.priority); setFlagNote(r.priority_note ?? ""); };
  const saveFlag = async () => {
    if (!flagFor) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/mo/exec-plan", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mo_id: flagFor.id, priority: flagVal, note: flagNote }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setRows((s) => s.map((r) => r.id === flagFor.id ? { ...r, priority: flagVal, priority_note: flagVal === 0 ? null : (flagNote.trim() || null) } : r));
      toast.success(flagVal === 0 ? "ปลดธงแล้ว" : `ตั้งเป็น “${PRIO[flagVal].label}” แล้ว — หน้าจ่ายงานจะเห็นธงนี้`);
      setFlagFor(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const selCls = "h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500";

  if (loading) return <div className="text-center py-20 text-slate-400">กำลังโหลดตัวเลข…</div>;
  if (err) return (
    <div className="text-center py-20">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-slate-700 font-medium">โหลดแผนผู้บริหารไม่สำเร็จ</p>
      <p className="text-slate-400 text-sm mt-1">{err}</p>
      <button onClick={() => { setLoading(true); void load(); }} className="mt-4 h-9 px-4 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700">↻ ลองใหม่</button>
    </div>
  );

  const groupSum = (items: ExecRow[]) => {
    let v = 0, p = 0, q = 0;
    for (const r of items) { v += r.remaining * r.list_price; q += r.remaining; if (canProfit(r)) p += unitProfit(r) * r.remaining; }
    return { v, p, q };
  };

  return (
    <div className="space-y-3">
      {/* ── ตัวเลขสรุป (ตามตัวกรองที่เลือกอยู่) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
          <div className="text-[11px] text-indigo-700/70">มูลค่างานที่ยังไม่ได้จ่าย (ราคาขาย)</div>
          <div className="text-2xl font-bold text-indigo-700 tabular-nums">{moneyK(kpi.value)}</div>
          <div className="text-[11px] text-indigo-600/60 mt-0.5">ค้างจ่าย {fmt(kpi.qty)} ชิ้น · ใบสั่งผลิตที่เปิดอยู่ {kpi.count} ใบ · รวมทั้งใบ {moneyK(kpi.valueAll)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="text-[11px] text-emerald-700/70">กำไรประมาณ (ขาย − วัตถุดิบ − ค่าแรง)</div>
          <div className="text-2xl font-bold text-emerald-700 tabular-nums">{moneyK(kpi.profit)}</div>
          <div className="text-[11px] text-emerald-600/60 mt-0.5">
            {kpi.profitBase > 0 ? `~${Math.round((kpi.profit / kpi.profitBase) * 100)}% ของมูลค่าที่คิดได้` : "—"}
            {kpi.profitUnknown > 0 ? ` · อีก ${kpi.profitUnknown} ใบคิดไม่ได้` : ""}
          </div>
          {kpi.noLabor > 0 && (
            <div className="text-[10px] text-amber-700 bg-amber-100/70 rounded px-1.5 py-0.5 mt-1">
              ⚠️ {kpi.noLabor} ใบยังไม่ตั้งค่าแรง → ตัวเลขนี้ยังไม่ได้หักค่าแรง (กำไรจริงต่ำกว่านี้)
            </div>
          )}
        </div>
        <button onClick={() => setFilter(filter === "late" ? "all" : "late")}
          className={`text-left rounded-xl border p-3 transition ${filter === "late" ? "border-rose-400 bg-rose-50 ring-2 ring-rose-200" : "border-rose-200 bg-rose-50/60 hover:border-rose-300"}`}>
          <div className="text-[11px] text-rose-700/70">เลยกำหนดส่งแล้ว</div>
          <div className="text-2xl font-bold text-rose-700 tabular-nums">{kpi.late} <span className="text-sm font-normal">ใบ</span></div>
          <div className="text-[11px] text-rose-600/60 mt-0.5">{kpi.noDue > 0 ? `⚠️ อีก ${kpi.noDue} ใบยังไม่กรอกวันส่ง จึงยังไม่รู้ว่าสายไหม` : "กดเพื่อดูเฉพาะใบที่เลยกำหนด"}</div>
        </button>
        <button onClick={() => setFilter(filter === "urgent" ? "all" : "urgent")}
          className={`text-left rounded-xl border p-3 transition ${filter === "urgent" ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200" : "border-amber-200 bg-amber-50/60 hover:border-amber-300"}`}>
          <div className="text-[11px] text-amber-700/70">งานที่ติดธงไว้ (เร่ง/สำคัญ)</div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums">{kpi.urgent} <span className="text-sm font-normal">ใบ</span></div>
          <div className="text-[11px] text-amber-600/60 mt-0.5">ธงนี้โผล่บนการ์ดหน้าช้อปจ่ายงานด้วย</div>
        </button>
      </div>

      {kpi.noPrice > 0 && (
        <div className="flex items-center gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span>⚠️</span>
          <span><b>{kpi.noPrice} ใบ</b> ยังไม่ได้ตั้งราคาขายในระบบสินค้า → มูลค่า/กำไรของใบเหล่านี้ยังนับไม่ได้ (ตัวเลขข้างบนจึงต่ำกว่าความจริง)</span>
          <button onClick={() => setFilter(filter === "noprice" ? "all" : "noprice")} className="ml-auto shrink-0 h-7 px-2.5 text-[11px] border border-amber-300 rounded-lg hover:bg-amber-100">
            {filter === "noprice" ? "ดูทั้งหมด" : "ดูเฉพาะใบที่ยังไม่มีราคา"}
          </button>
        </div>
      )}

      {/* ── ตัวกรอง ── */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา สินค้า / เลขใบสั่งผลิต / แบรนด์"
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[220px] flex-1" />
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} title="เรียงลำดับ" className={selCls}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>↕ {s.label}</option>)}
        </select>
        <select value={groupMode} onChange={(e) => setGroupMode(e.target.value as GroupMode)} title="จัดกลุ่ม" className={selCls}>
          <option value="month">จัดกลุ่ม: เดือนที่ต้องส่ง</option>
          <option value="brand">จัดกลุ่ม: แบรนด์</option>
          <option value="none">จัดกลุ่ม: ไม่จัด</option>
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} title="กรอง" className={selCls}>
          <option value="all">ทั้งหมด</option>
          <option value="pending">เฉพาะที่ยังมีของค้างจ่าย</option>
          <option value="urgent">🔥 เฉพาะงานที่ติดธง</option>
          <option value="late">เฉพาะที่เลยกำหนด</option>
          <option value="ready">เฉพาะที่พร้อมจ่าย</option>
          <option value="noprice">เฉพาะที่ยังไม่มีราคาขาย</option>
        </select>
        <button onClick={() => { setLoading(true); void load(); }} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">⟳ โหลดใหม่</button>
      </div>

      {/* ── ตาราง ── */}
      {filtered.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl py-20 text-center text-slate-400 text-sm">
          {rows.length === 0 ? "ยังไม่มีใบสั่งผลิตที่เปิดอยู่" : "ไม่พบรายการที่ตรงกับตัวกรอง"}
        </div>
      ) : buckets.map((b) => {
        const s = groupSum(b.items);
        return (
          <div key={b.key || "all"}>
            {b.label && (
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 mb-1.5">
                <span>{groupMode === "month" ? "📅 " : "🏷 "}{b.label}</span>
                <span className="text-slate-400 font-normal">({b.items.length} ใบ · {fmt(s.q)} ชิ้น)</span>
                <span className="ml-auto text-indigo-700">มูลค่า {moneyK(s.v)}</span>
                <span className="text-emerald-700">กำไรประมาณ {moneyK(s.p)}</span>
              </div>
            )}
            <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium w-10">ธง</th>
                    <th className="text-left px-2 py-2 font-medium">สินค้า</th>
                    <th className="px-2 py-2 font-medium whitespace-nowrap">กำหนดส่ง</th>
                    <th className="px-2 py-2 font-medium whitespace-nowrap">ความคืบหน้า</th>
                    <th className="px-2 py-2 font-medium text-right whitespace-nowrap">ราคาขาย/ชิ้น</th>
                    <th className="px-2 py-2 font-medium text-right whitespace-nowrap">มูลค่าที่ยังค้าง</th>
                    <th className="px-2 py-2 font-medium text-right whitespace-nowrap">ต้นทุน/ชิ้น</th>
                    <th className="px-2 py-2 font-medium text-right whitespace-nowrap">กำไร/ชิ้น</th>
                    <th className="px-2 py-2 font-medium text-right whitespace-nowrap">กำไรทั้งก้อน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {b.items.map((r) => {
                    const value = r.remaining * r.list_price;
                    const prof = unitProfit(r), ok = canProfit(r);
                    const pct = Math.round(marginPct(r));
                    const donePct = r.qty > 0 ? Math.min(100, Math.round((r.dispatched / r.qty) * 100)) : 0;
                    const p = PRIO[r.priority] ?? PRIO[0];
                    return (
                      <tr key={r.id} className={`hover:bg-slate-50/70 ${r.priority === 2 ? "bg-rose-50/40" : r.priority === 1 ? "bg-amber-50/30" : ""}`}>
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => openFlag(r)} title={r.priority ? `${p.label}${r.priority_note ? ` — ${r.priority_note}` : ""} (กดเพื่อแก้)` : "กดเพื่อตั้งเป็นงานเร่ง/สำคัญ"}
                            className={`w-8 h-8 rounded-lg border text-base leading-none ${p.cls} hover:brightness-95`}>
                            {p.icon || "🏳"}
                          </button>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2 min-w-[240px]">
                            <HoverImage url={r.image_url} size={36} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => onOpenMO?.(r.id)} className="text-sm font-semibold text-slate-800 truncate hover:text-indigo-600 hover:underline">{r.product_sku ?? "—"}</button>
                                {r.ready
                                  ? <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">พร้อม ✓</span>
                                  : <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">ยังไม่พร้อม</span>}
                                {!r.has_bom && <span title="ใบนี้ยังไม่มีสูตรวัตถุดิบ — คิดต้นทุน/กำไรไม่ได้" className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">ไม่มีสูตร</span>}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[280px]">{r.product_name}{r.color ? <span className="text-slate-400"> · {r.color}</span> : null}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{r.mo_no}{r.brand ? <span className="text-slate-300"> · {r.brand}</span> : null}</div>
                              {r.priority > 0 && r.priority_note && <div className="text-[10px] text-rose-600 truncate max-w-[280px]">📌 {r.priority_note}</div>}
                            </div>
                          </div>
                        </td>
                        <td className={`px-2 py-1.5 text-center whitespace-nowrap text-xs ${dueClass(r.due_date)}`}>{dueText(r.due_date)}</td>
                        <td className="px-2 py-1.5">
                          <div className="w-28 mx-auto">
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${donePct}%` }} />
                            </div>
                            <div className="text-[10px] text-slate-500 text-center mt-0.5 whitespace-nowrap">จ่ายแล้ว {fmt(r.dispatched)}/{fmt(r.qty)} · ค้าง <b className="text-slate-700">{fmt(r.remaining)}</b></div>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {r.list_price > 0 ? money(r.list_price) : <span className="text-[10px] text-amber-600">ยังไม่ตั้งราคา</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-indigo-700 whitespace-nowrap">{value > 0 ? money(value) : "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                          {r.has_bom ? money(unitCost(r)) : <span className="text-slate-300">—</span>}
                          <div className="text-[9px] text-slate-400">
                            ของ {money(r.mat_cost)}{r.labor_cost > 0 ? ` · แรง ${money(r.labor_cost)}` : " · ยังไม่ตั้งค่าแรง"}{r.piece_cost > 0 ? ` · เหมา ${money(r.piece_cost)}` : ""}
                          </div>
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${ok ? (prof >= 0 ? "text-emerald-700 font-semibold" : "text-rose-600 font-semibold") : "text-slate-300"}`}>
                          {ok ? <>{money(prof)}<div className="text-[9px] font-normal text-slate-400">{pct}%</div></> : "—"}
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${ok ? "text-emerald-700" : "text-slate-300"}`}>
                          {ok ? money(prof * r.remaining) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        • <b>มูลค่าที่ยังค้าง</b> = จำนวนที่ยังไม่ได้จ่ายงาน × ราคาขาย/ชิ้น (Sale Price ในหน้าสินค้า) ·
        <b> ต้นทุน/ชิ้น</b> = วัตถุดิบตามสูตร (ราคาซื้อล่าสุดในระบบ) + ค่าแรงกลาง + ค่าแรงเหมา ·
        <b> กำไร</b> จึงเป็น <b>ตัวเลขประมาณ</b> ไม่ใช่กำไรจริงต่อบิลขาย (ยังไม่รวมส่วนลด/ค่าขนส่ง/ค่าใช้จ่ายอื่น)
        <br />• ใบที่ยังไม่ตั้งราคาขาย หรือยังไม่มีสูตรวัตถุดิบ จะไม่ถูกนับในยอดกำไร (ขึ้น “—”) เพื่อไม่ให้ตัวเลขรวมหลอกตา
      </p>

      {/* ── ป๊อปติดธงงานเร่ง ── */}
      <ERPModal open={!!flagFor} onClose={() => !saving && setFlagFor(null)} size="sm" title="ลำดับความสำคัญของงานนี้"
        footer={<>
          <button onClick={() => setFlagFor(null)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void saveFlag()} disabled={saving} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </>}>
        {flagFor && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <HoverImage url={flagFor.image_url} size={40} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{flagFor.product_sku} <span className="font-normal text-slate-500">{flagFor.product_name}</span></div>
                <div className="text-[11px] text-slate-400 font-mono">{flagFor.mo_no} · ค้าง {fmt(flagFor.remaining)} ชิ้น</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[2, 1, 0].map((v) => (
                <button key={v} onClick={() => setFlagVal(v)}
                  className={`h-16 rounded-xl border text-sm transition ${flagVal === v ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <div className="text-xl leading-none mb-1">{PRIO[v].icon || "🏳"}</div>
                  {PRIO[v].label}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-xs text-slate-500">เหตุผล/โน้ตสั้น ๆ (ไม่บังคับ — คนจ่ายงานจะเห็นข้อความนี้)</span>
              <input value={flagNote} onChange={(e) => setFlagNote(e.target.value)} maxLength={200} disabled={flagVal === 0}
                placeholder="เช่น ลูกค้ารอส่งของ 20 ก.ย."
                className="w-full h-9 px-2 mt-0.5 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50" />
            </label>
            <p className="text-[11px] text-slate-400">ติดธงแล้วจะขึ้นบนการ์ดใน <b>🛒 ช้อปจ่ายงาน</b> ทันที และเรียง “งานเร่งก่อน” ได้</p>
          </div>
        )}
      </ERPModal>
    </div>
  );
}
