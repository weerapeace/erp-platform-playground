"use client";

/**
 * บอร์ดจ่ายงาน — มุมมอง "จ่ายงาน (โหมดผู้บริหาร)" (เจ้าของขอ 2026-11-04 · แทนมุมมองแคนวาสที่เอาออก)
 *   ข้างบน = งานรอจ่ายเต็มหน้า (การ์ดใหญ่ · ปรับขนาดการ์ด) · เรียงได้ · กรองแบรนด์ · เลือกเองว่าการ์ดโชว์อะไร · ป้ายเดดไลน์มุมการ์ด
 *     ราคาขาย/มูลค่า เฉพาะผู้บริหาร (ดึงจาก /api/mo/exec-plan ที่ล็อกสิทธิ์ไว้) · ค่าแรง/ชิ้น = ราคากลางในสูตร (ไม่มี = ค่าแรงแผนของใบ ÷ จำนวน)
 *   ข้างล่าง = แถบโต๊ะติดขอบจอ (ชื่อโต๊ะ + 2 ใบแรก) · ชี้ = เด้งขึ้น · กด = แผงเลื่อนขึ้น (การ์ดงาน · ค่าแรงรวม/ต่อช่าง · จัดการโต๊ะ)
 *   ขวา = แผง "สรุปเป้า" (ผู้บริหาร) เลื่อนเข้า · ล็อกได้ = ติดขวาแล้วดันการ์ดให้แคบลง · เป้าเก็บกลาง ui_config admin_wb_exec_target
 *   จ่าย = ลากการ์ดลงโต๊ะ (ติ๊กหลายใบ ลากใบไหนก็ไปทั้งชุด) หรือกดโต๊ะ → "จ่ายให้โต๊ะนี้" → ป๊อปจ่ายงานเดิมของบอร์ด (ทีละใบ)
 *     เมาส์ = ลาก HTML5 · iPad/มือถือ = กดค้างแล้วลาก (ของกลาง components/touch-drag)
 * ค่าที่จำต่อคน (useUserPref): ขนาดการ์ด · การเรียง · ช่องที่โชว์ · ล็อกแผงสรุป
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { bkkDate } from "@/lib/mo-sales-match";
import { useUserPref } from "@/lib/use-user-pref";
import { useTouchDrag } from "@/components/touch-drag";
import { MoneyInput } from "@/components/money-input";

export type ExecMo = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; remaining: number; due_date: string | null; internal_due_date?: string | null;
  image_url: string | null; ready: boolean; priority?: number; priority_note?: string | null;
  brand?: string | null; central_rate?: number; labor?: { prod_plan: number } | null;
};
export type ExecWo = {
  id: string; wo_no: string; mo_no: string; product_sku: string | null; department_id: string | null;
  assignee_name: string | null; qty: number; received_qty: number; status: string; image_url?: string | null;
  labor_cost?: number | null; central_rate?: number;
};
type Desk = { id: string; name: string };
type Person = { id: string; name: string; nickname?: string | null; department_id?: string | null };
type SortKey = "urgent" | "value" | "labor" | "qty" | "sku";
type FieldKey = "price" | "value" | "labor" | "laborTotal" | "brand" | "name" | "due" | "ready";
type Period = "today" | "week" | "month";
type Target = Partial<Record<Period, number>>;
type Done = { count: number; qty: number; value: number; labor: number; labor_missing: number; no_price: number; no_date?: number };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const SIZE_MIN = 120, SIZE_MAX = 240;
const parseSize = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= SIZE_MIN && n <= SIZE_MAX ? n : null; };
const SORTS: { k: SortKey; label: string }[] = [
  { k: "urgent", label: "งานเร่ง → เดดไลน์" }, { k: "value", label: "มูลค่ามากสุด" }, { k: "labor", label: "ค่าแรงรวมมากสุด" },
  { k: "qty", label: "จำนวนมากสุด" }, { k: "sku", label: "รหัสสินค้า" },
];
const parseSort = (v: unknown): SortKey | null => (SORTS.some((s) => s.k === v) ? (v as SortKey) : null);
const FIELDS: { k: FieldKey; label: string; money?: boolean }[] = [
  { k: "price", label: "ราคาขาย/ชิ้น", money: true }, { k: "value", label: "มูลค่า", money: true }, { k: "labor", label: "ค่าแรง/ชิ้น" },
  { k: "laborTotal", label: "ค่าแรงรวม" }, { k: "brand", label: "แบรนด์" }, { k: "name", label: "ชื่อสินค้า" }, { k: "due", label: "เดดไลน์" }, { k: "ready", label: "ความพร้อม" },
];
const FIELDS_DEFAULT: FieldKey[] = ["price", "value", "labor", "laborTotal", "name", "due", "ready"];
const parseFields = (v: unknown): FieldKey[] | null => (Array.isArray(v) ? (v.filter((x) => FIELDS.some((f) => f.k === x)) as FieldKey[]) : null);
const parseBool = (v: unknown) => (typeof v === "boolean" ? v : null);
const PERIODS: { k: Period; label: string }[] = [{ k: "today", label: "วันนี้" }, { k: "week", label: "สัปดาห์นี้" }, { k: "month", label: "เดือนนี้" }];
const TARGET_KEY = "admin_wb_exec_target";

/** ช่วงวันที่ของช่วงที่เลือก (วันไทย) — สัปดาห์เริ่มวันจันทร์ */
function periodRange(p: Period): { from: string; to: string } {
  const to = bkkDate(new Date().toISOString());
  if (p === "today") return { from: to, to };
  if (p === "month") return { from: `${to.slice(0, 8)}01`, to };
  const d = new Date(`${to}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7;   // จันทร์ = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return { from: d.toISOString().slice(0, 10), to };
}
/** วันที่เหลือถึงเดดไลน์ (ติดลบ = เลยแล้ว) */
function daysLeft(due: string | null | undefined): number | null {
  if (!due) return null;
  const today = bkkDate(new Date().toISOString());
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
/** ค่าแรง/ชิ้นของใบรอจ่าย — ราคากลางในสูตรก่อน ไม่มี = ค่าแรงแผนของใบ ÷ จำนวน (สูตรเดียวกับบอร์ด) */
const rateOfMo = (m: ExecMo) => (m.central_rate && m.central_rate > 0 ? m.central_rate : m.qty > 0 && m.labor ? m.labor.prod_plan / m.qty : 0);
/** ค่าแรง/ชิ้นของใบจ่ายงาน — ค่าแรงที่ใส่ไว้ ÷ จำนวน ไม่มี = ราคากลาง */
const rateOfWo = (w: ExecWo) => (w.labor_cost != null && w.qty > 0 ? Number(w.labor_cost) / w.qty : w.central_rate && w.central_rate > 0 ? w.central_rate : 0);

export function ExecDispatchView({ pending, workOrders, desks, craftsmen, canDispatch, showPrice, onDispatch, onOpenMO, onOpenWO, renderDeskManager }: {
  pending: ExecMo[];
  workOrders: ExecWo[];
  desks: Desk[];
  craftsmen: Person[];
  canDispatch: boolean;
  /** ผู้บริหาร = เห็นราคาขาย/มูลค่า + แผงสรุปเป้า (แก้เป้าได้) */
  showPrice: boolean;
  /** เปิดป๊อปจ่ายงานเดิมของบอร์ด (ทีละใบตามลำดับ) */
  onDispatch: (mos: ExecMo[], desk: Desk) => void;
  onOpenMO: (mo: ExecMo) => void;
  onOpenWO: (woId: string) => void;
  /** แผงจัดการโต๊ะของกลาง (DeskStaffPanel) — หน้าแม่ส่งมา (สิทธิ์ + โหลดใหม่อยู่ที่หน้าแม่) */
  renderDeskManager?: (desk: Desk) => ReactNode;
}) {
  const toast = useToast();
  const [size, setSize] = useUserPref<number>("wb_exec_card_size", 160, parseSize);
  const [sort, setSort] = useUserPref<SortKey>("wb_exec_sort", "urgent", parseSort);
  const [fields, setFields] = useUserPref<FieldKey[]>("wb_exec_fields", FIELDS_DEFAULT, parseFields);
  const [locked, setLocked] = useUserPref<boolean>("wb_exec_target_lock", false, parseBool);
  const [q, setQ] = useState("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [brand, setBrand] = useState<string>("");
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openDesk, setOpenDesk] = useState<string | null>(null);
  const [overDesk, setOverDesk] = useState<string | null>(null);
  const [manageDesk, setManageDesk] = useState<Desk | null>(null);
  const [price, setPrice] = useState<Map<string, number>>(new Map());
  // แผงสรุปเป้า
  const [sideOpen, setSideOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [target, setTarget] = useState<Target>({});
  const [targetDraft, setTargetDraft] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [savingTarget, setSavingTarget] = useState(false);
  const show = (k: FieldKey) => fields.includes(k) && (showPrice || !FIELDS.find((f) => f.k === k)?.money);
  const sideShown = showPrice && (sideOpen || locked);

  // ราคาขาย/ชิ้น (skus_v2.list_price) + เป้า — API แผนผู้บริหารล็อกสิทธิ์ admin.users ไว้แล้ว
  useEffect(() => {
    if (!showPrice) return;
    let cancel = false;
    apiFetch("/api/mo/exec-plan").then((r) => r.json()).then((j) => {
      if (cancel) return;
      setPrice(new Map(((j.rows ?? []) as { mo_no: string; list_price: number }[]).map((r) => [r.mo_no, Number(r.list_price) || 0])));
    }).catch(() => { /* ไม่มีราคา = ไม่โชว์ */ });
    apiFetch(`/api/ui-config?key=${TARGET_KEY}`).then((r) => r.json()).then((j) => { if (!cancel) setTarget(((j.value ?? {}) as Target)); }).catch(() => {});
    return () => { cancel = true; };
  }, [showPrice]);
  // ยอดที่จ่ายไปแล้วในช่วงที่เลือก (โหลดเมื่อแผงเปิด / เปลี่ยนช่วง / จ่ายงานเพิ่ม)
  const woSig = workOrders.length;
  useEffect(() => {
    if (!sideShown) return;
    let cancel = false;
    const { from, to } = periodRange(period);
    apiFetch(`/api/mo/exec-plan?dispatched=1&from=${from}&to=${to}`).then((r) => r.json()).then((j) => { if (!cancel && j.data) setDone(j.data as Done); }).catch(() => {});
    return () => { cancel = true; };
  }, [sideShown, period, woSig]);
  useEffect(() => { setTargetDraft(target[period] ? String(target[period]) : ""); }, [target, period]);
  const saveTarget = async () => {
    const v = Math.max(0, Number(targetDraft) || 0);
    if (v === (target[period] ?? 0)) return;
    const next = { ...target, [period]: v };
    setSavingTarget(true);
    try {
      const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: TARGET_KEY, value: next }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(r.status === 401 || r.status === 403 ? "ตั้งเป้าได้เฉพาะแอดมิน" : (j.error || "บันทึกเป้าไม่สำเร็จ"));
      setTarget(next);
      toast.success(`ตั้งเป้า${PERIODS.find((p) => p.k === period)?.label} ฿${fmt(v)} แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกเป้าไม่สำเร็จ"); }
    finally { setSavingTarget(false); }
  };

  const brands = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of pending) if (x.remaining > 0) { const b = x.brand?.trim() || "ไม่มีแบรนด์"; m.set(b, (m.get(b) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pending]);
  const valueOf = (m: ExecMo) => (price.get(m.mo_no) ?? 0) * m.remaining;
  const laborOf = (m: ExecMo) => rateOfMo(m) * m.remaining;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const dueOf = (m: ExecMo) => m.internal_due_date ?? m.due_date ?? "9999-12-31";
    return pending.filter((m) => m.remaining > 0 && (!readyOnly || m.ready) && (!brand || (m.brand?.trim() || "ไม่มีแบรนด์") === brand)
      && (!s || `${m.mo_no} ${m.product_sku ?? ""} ${m.product_name ?? ""} ${m.brand ?? ""}`.toLowerCase().includes(s)))
      .sort((a, b) => sort === "value" ? valueOf(b) - valueOf(a)
        : sort === "labor" ? laborOf(b) - laborOf(a)
        : sort === "qty" ? b.remaining - a.remaining
        : sort === "sku" ? (a.product_sku ?? a.mo_no).localeCompare(b.product_sku ?? b.mo_no)
        : (b.priority ?? 0) - (a.priority ?? 0) || dueOf(a).localeCompare(dueOf(b)));
  }, [pending, q, readyOnly, brand, sort, price]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = list.reduce((a, m) => a + valueOf(m), 0);
  const chosen = list.filter((m) => sel.has(m.id));
  const chosenValue = chosen.reduce((a, m) => a + valueOf(m), 0);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const openWos = useMemo(() => workOrders.filter((w) => w.status !== "done" && w.status !== "cancelled"), [workOrders]);
  const wosOf = (deskId: string) => openWos.filter((w) => w.department_id === deskId);
  const give = (desk: Desk, ids: string[]) => {
    const mos = list.filter((m) => ids.includes(m.id));
    if (!mos.length || !canDispatch) return;
    onDispatch(mos, desk);
    setSel((p) => { const n = new Set(p); for (const m of mos) n.delete(m.id); return n; });   // หลุดเฉพาะใบที่ส่งไปจ่าย (ลากใบที่ไม่ได้ติ๊ก = ที่ติ๊กไว้ยังอยู่)
  };
  // ลากด้วยนิ้ว (iPad) — กดค้างการ์ดแล้วลากไปวางที่โต๊ะ (โต๊ะมี data-drop-id)
  const td = useTouchDrag<string>({ onDrop: (deskId, id) => { const d = desks.find((x) => x.id === deskId); if (d) give(d, sel.has(id) ? chosen.map((m) => m.id) : [id]); } });
  const deskOpen = desks.find((d) => d.id === openDesk) ?? null;
  const goal = target[period] ?? 0, got = done?.value ?? 0, pct = goal > 0 ? Math.min(100, (got / goal) * 100) : 0;

  const dueBadge = (m: ExecMo) => {
    const d = daysLeft(m.internal_due_date ?? m.due_date);
    if (d == null) return null;
    const cls = d < 0 ? "bg-rose-600 text-white" : d <= 3 ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-600";
    return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold shadow-sm ${cls}`}>{d < 0 ? `เลย ${-d} วัน` : d === 0 ? "วันนี้" : `อีก ${d} วัน`}</span>;
  };

  return (
    <div className="relative flex min-h-[calc(100vh-180px)] flex-col overflow-x-clip">
      <div className="flex flex-1 flex-col transition-[margin] duration-300 ease-out" style={{ marginRight: locked && sideShown ? 296 : 0 }}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-slate-800">งานรอจ่าย</span>
          <span className="text-sm text-slate-500">{list.length} ใบ{showPrice && total > 0 ? ` · มูลค่า ฿${fmt(total)}` : ""}</span>
          {showPrice && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">เห็นราคาขาย (ผู้บริหาร)</span>}
          <div className="flex-1" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัสสินค้า / ชื่อ / เลขใบ" className="h-8 w-52 rounded-lg border border-slate-200 px-2 text-sm" />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px]" title="เรียงการ์ด">
            {SORTS.filter((s) => showPrice || s.k !== "value").map((s) => <option key={s.k} value={s.k}>เรียง: {s.label}</option>)}
          </select>
          <button type="button" onClick={() => setFieldsOpen((v) => !v)} className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[12px] ${fieldsOpen ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><Icon name="sliders" /> โชว์อะไรบ้าง</button>
          <button type="button" onClick={() => setReadyOnly((v) => !v)} className={`h-8 rounded-full border px-3 text-[12px] ${readyOnly ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>พร้อมจ่ายเท่านั้น</button>
          <label className="inline-flex items-center gap-2 text-[12px] text-slate-500">ขนาด
            <input type="range" min={SIZE_MIN} max={SIZE_MAX} step={10} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24" />
          </label>
          {showPrice && <button type="button" onClick={() => (locked ? undefined : setSideOpen((v) => !v))} className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[12px] font-medium ${sideShown ? "border-violet-600 bg-violet-600 text-white" : "border-violet-300 bg-white text-violet-700 hover:bg-violet-50"}`}><Icon name="target" /> สรุปเป้า</button>}
        </div>

        {fieldsOpen && (
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]">
            <span className="text-[12px] text-slate-400">การ์ดโชว์:</span>
            {FIELDS.filter((f) => showPrice || !f.money).map((f) => (
              <label key={f.k} className="inline-flex items-center gap-1.5 text-slate-700">
                <input type="checkbox" checked={fields.includes(f.k)} onChange={(e) => setFields(e.target.checked ? [...fields, f.k] : fields.filter((x) => x !== f.k))} /> {f.label}
              </label>
            ))}
            <button type="button" onClick={() => setFields(FIELDS_DEFAULT)} className="ml-auto text-[12px] text-slate-500 underline">ค่าเริ่มต้น</button>
          </div>
        )}

        {brands.length > 1 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setBrand("")} className={`h-7 rounded-full border px-2.5 text-[12px] ${!brand ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>ทุกแบรนด์ {brands.reduce((a, b) => a + b[1], 0)}</button>
            {brands.map(([b, n]) => (
              <button key={b} type="button" onClick={() => setBrand(brand === b ? "" : b)} className={`h-7 rounded-full border px-2.5 text-[12px] ${brand === b ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{b} {n}</button>
            ))}
          </div>
        )}

        {chosen.length > 0 && (
          <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-1.5 text-sm text-violet-800">
            เลือก <b>{chosen.length}</b> ใบ{showPrice ? ` · ฿${fmt(chosenValue)}` : ""} — ลากการ์ดใบไหนก็ได้ลงโต๊ะด้านล่าง หรือกดโต๊ะแล้วกด &ldquo;จ่ายให้โต๊ะนี้&rdquo;
            <button type="button" onClick={() => setSel(new Set())} className="ml-2 text-[12px] text-violet-600 underline">ล้างที่เลือก</button>
          </div>
        )}

        {!list.length ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-sm text-slate-400">{q || readyOnly || brand ? "ไม่พบงานตามที่ค้น / กรอง" : "ไม่มีงานรอจ่าย"}</div>
        ) : (
          <div className="grid flex-1 content-start gap-2.5 pb-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
            {list.map((m) => {
              const on = sel.has(m.id), p = price.get(m.mo_no) ?? 0, rate = rateOfMo(m);
              return (
                <div key={m.id} draggable={canDispatch}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "move"; }}
                  {...(canDispatch ? td.bind(m.id, <span className="flex items-center gap-2 text-sm"><Icon name="truck" /><b className="font-mono">{m.product_sku ?? m.mo_no}</b>{sel.has(m.id) && chosen.length > 1 ? <span className="text-violet-700">+{chosen.length - 1} ใบ</span> : null}</span>) : {})}
                  onClick={() => { if (td.justDragged()) return; toggle(m.id); }}
                  className={`group relative cursor-pointer select-none rounded-xl border bg-white p-2 transition-shadow hover:shadow-md ${on ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200"}`}>
                  <input type="checkbox" checked={on} readOnly className="absolute left-2 top-2 z-10 h-4 w-4 accent-violet-600" aria-label={`เลือก ${m.product_sku ?? m.mo_no}`} />
                  <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1">
                    {show("due") && dueBadge(m)}
                    {(m.priority ?? 0) > 0 && <span title={m.priority_note ?? undefined} className={`rounded px-1.5 text-[11px] font-semibold ${m.priority === 2 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{m.priority === 2 ? "เร่งด่วน" : "สำคัญ"}</span>}
                  </div>
                  <div className="mb-1.5 flex items-center justify-center overflow-hidden rounded-lg bg-slate-50" style={{ height: Math.round(size * 0.55) }}>
                    {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-contain" draggable={false} /> : <Icon name="image" />}
                  </div>
                  <div className="truncate font-mono text-[13px] font-semibold text-slate-800">{m.product_sku ?? m.mo_no}</div>
                  {show("brand") && m.brand && <div className="truncate text-[11px] font-medium text-violet-600">{m.brand}</div>}
                  {show("name") && <div className="truncate text-[11px] text-slate-400">{m.product_name ?? ""}</div>}
                  <div className="mt-0.5 text-[12px] text-slate-600">จ่าย <b className="text-slate-800">{fmt(m.remaining)}</b>{m.remaining !== m.qty ? ` / ${fmt(m.qty)}` : ""} ชิ้น{show("price") && p > 0 ? ` · ฿${fmt(p)}` : ""}</div>
                  {show("value") && p > 0 && <div className="text-sm font-bold tabular-nums text-violet-700">฿{fmt(p * m.remaining)}</div>}
                  {(show("labor") || show("laborTotal")) && (
                    <div className="text-[11px] text-slate-500">{rate > 0 ? <>
                      {show("labor") && <>ค่าแรง ฿{fmt(rate)}/ชิ้น</>}{show("labor") && show("laborTotal") ? " · " : ""}{show("laborTotal") && <b className="text-slate-700">รวม ฿{fmt(rate * m.remaining)}</b>}
                    </> : <span className="text-amber-600">ยังไม่ตั้งค่าแรง</span>}</div>
                  )}
                  {show("ready") && <div className={`mt-0.5 text-right text-[11px] ${m.ready ? "font-medium text-emerald-600" : "text-amber-600"}`}>{m.ready ? "พร้อม" : "ยังไม่พร้อม"}</div>}
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpenMO(m); }} title="ดูรายละเอียด / เช็กลิสต์"
                    className="absolute bottom-1.5 left-1.5 hidden h-6 w-6 items-center justify-center rounded-md bg-white/90 text-slate-500 shadow-sm hover:text-violet-700 group-hover:flex"><Icon name="open" /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* แถบโต๊ะ (ติดขอบล่าง) + แผงรายละเอียดเลื่อนขึ้น */}
        <div className="sticky bottom-0 z-20 -mx-1 mt-auto">
          <div className={`absolute inset-x-2 bottom-full origin-bottom rounded-t-2xl border border-b-0 border-slate-200 bg-white/95 p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur transition-all duration-300 ease-out ${deskOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}>
            {deskOpen && (() => {
              const ws = wosOf(deskOpen.id), ppl = craftsmen.filter((c) => c.department_id === deskOpen.id);
              const left = ws.reduce((a, w) => a + Math.max(0, w.qty - (w.received_qty || 0)), 0);
              const laborPlan = ws.reduce((a, w) => a + rateOfWo(w) * w.qty, 0);
              const laborGot = ws.reduce((a, w) => a + rateOfWo(w) * (w.received_qty || 0), 0);
              const held = ws.reduce((a, w) => a + (price.get(w.mo_no) ?? 0) * Math.max(0, w.qty - (w.received_qty || 0)), 0);
              const noRate = ws.filter((w) => rateOfWo(w) <= 0).length;
              const byPerson = new Map<string, number>();
              for (const w of ws) { const k = w.assignee_name?.trim() || "ทั้งโต๊ะ"; byPerson.set(k, (byPerson.get(k) ?? 0) + rateOfWo(w) * w.qty); }
              return (
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-slate-800">{deskOpen.name}</span>
                    <span className="text-sm text-slate-500">{ppl.length} คน · {ws.length} ใบ · ค้าง {fmt(left)} ชิ้น</span>
                    <div className="flex-1" />
                    {renderDeskManager && <button type="button" onClick={() => setManageDesk(deskOpen)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon name="settings" /> จัดการโต๊ะ</button>}
                    {canDispatch && <button type="button" disabled={!chosen.length} onClick={() => give(deskOpen, chosen.map((m) => m.id))}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">
                      <Icon name="truck" /> จ่ายให้โต๊ะนี้{chosen.length ? ` (${chosen.length} ใบ)` : ""}</button>}
                    <button type="button" onClick={() => setOpenDesk(null)} aria-label="ปิดแผง" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="back" /></button>
                  </div>
                  <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {showPrice && <div className="rounded-lg bg-violet-50 px-3 py-2"><div className="text-[11px] text-violet-600">มูลค่างานที่ถือ</div><div className="text-lg font-bold tabular-nums text-violet-800">฿{fmt(held)}</div></div>}
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">ค่าแรงรวม (แผน)</div><div className="text-lg font-bold tabular-nums text-slate-800">฿{fmt(laborPlan)}</div></div>
                    <div className="rounded-lg bg-emerald-50 px-3 py-2"><div className="text-[11px] text-emerald-600">ค่าแรงที่ได้แล้ว (รับคืน)</div><div className="text-lg font-bold tabular-nums text-emerald-800">฿{fmt(laborGot)}</div></div>
                    {noRate > 0 && <div className="rounded-lg bg-amber-50 px-3 py-2"><div className="text-[11px] text-amber-700">ยังไม่ใส่ค่าแรง</div><div className="text-lg font-bold tabular-nums text-amber-800">{noRate} ใบ</div></div>}
                  </div>
                  {[...byPerson.values()].some((v) => v > 0) && (
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                      <span className="text-slate-400">ค่าแรงต่อช่าง:</span>
                      {[...byPerson.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([n, v]) => <span key={n} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700">{n} <b className="tabular-nums">฿{fmt(v)}</b></span>)}
                    </div>
                  )}
                  <div className="mb-2 text-[12px] text-slate-500">คนในโต๊ะ: {ppl.length ? ppl.map((p) => p.nickname?.trim() || p.name).join(", ") : "— ไม่มีคนประจำ (เลือกคนอื่นได้ในป๊อปจ่ายงาน) —"}</div>
                  <div className="grid max-h-[38vh] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {ws.map((w) => {
                      const r = rateOfWo(w), pp = price.get(w.mo_no) ?? 0, pr = w.qty > 0 ? Math.min(100, ((w.received_qty || 0) / w.qty) * 100) : 0;
                      return (
                        <button key={w.id} type="button" onClick={() => onOpenWO(w.id)} className="rounded-xl border border-slate-200 bg-white p-2 text-left hover:border-violet-300 hover:shadow-sm">
                          <div className="flex items-center gap-2">
                            <HoverImage url={w.image_url ?? null} size={34} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-mono text-[12px] font-semibold text-slate-800">{w.product_sku ?? w.mo_no}</div>
                              <div className="truncate text-[11px] text-slate-400">{w.assignee_name || "ทั้งโต๊ะ"} · {w.wo_no}</div>
                            </div>
                          </div>
                          <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${pr >= 100 ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${pr}%` }} /></div>
                          <div className="flex justify-between text-[11px]"><span className="text-slate-600">รับคืน {fmt(w.received_qty || 0)}/{fmt(w.qty)}</span>{r > 0 ? <span className="text-slate-500">฿{fmt(r)}/ชิ้น</span> : <span className="text-amber-600">ยังไม่ใส่ค่าแรง</span>}</div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-400">{showPrice && pp > 0 ? `฿${fmt(pp)} · ฿${fmt(pp * w.qty)}` : ""}</span>
                            {r > 0 && <b className="tabular-nums text-slate-800">ค่าแรง ฿{fmt(r * w.qty)}</b>}
                          </div>
                        </button>
                      );
                    })}
                    {!ws.length && <div className="text-sm text-slate-400">ยังไม่มีงานในโต๊ะนี้</div>}
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="flex items-end justify-center gap-2 overflow-x-auto rounded-t-xl border border-slate-200 bg-white/95 px-3 pb-2.5 pt-4 backdrop-blur">
            {desks.map((d) => {
              const ws = wosOf(d.id), lifted = overDesk === d.id || td.overId === d.id, on = openDesk === d.id;
              return (
                <button key={d.id} type="button" data-drop-id={d.id} onClick={() => setOpenDesk(on ? null : d.id)}
                  onDragOver={(e) => { if (!canDispatch) return; e.preventDefault(); setOverDesk(d.id); }}
                  onDragLeave={() => setOverDesk((x) => (x === d.id ? null : x))}
                  onDrop={(e) => { e.preventDefault(); setOverDesk(null); const id = e.dataTransfer.getData("text/plain"); give(d, sel.has(id) ? chosen.map((m) => m.id) : [id]); }}
                  className={`w-[132px] shrink-0 rounded-xl border px-2.5 py-1.5 text-left transition-all duration-200 ease-out hover:-translate-y-2 hover:scale-[1.04] hover:border-violet-300 hover:shadow-md ${lifted ? "-translate-y-2 scale-[1.06] border-violet-500 bg-violet-50 shadow-md" : on ? "border-violet-500 bg-violet-50/60" : "border-slate-200 bg-slate-50"}`}>
                  <div className="truncate text-[13px] font-semibold text-slate-800">{d.name}</div>
                  {ws.length ? <>
                    {ws.slice(0, 2).map((w) => <div key={w.id} className="truncate font-mono text-[10px] text-slate-500">{w.product_sku ?? w.mo_no} · {fmt(w.qty)}</div>)}
                    {ws.length > 2 && <div className="text-[10px] text-slate-400">+{ws.length - 2} ใบ</div>}
                  </> : <div className="text-[10px] text-slate-400">ว่าง</div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* แผงสรุปเป้า (ผู้บริหาร) — เลื่อนเข้าจากขวา · ล็อก = ติดขวาแล้วดันการ์ด */}
      {showPrice && (
        <aside className={`absolute bottom-0 right-0 top-0 z-30 w-[288px] border-l border-slate-200 bg-white p-4 shadow-[-8px_0_24px_rgba(15,23,42,0.06)] transition-transform duration-300 ease-out ${sideShown ? "translate-x-0" : "pointer-events-none translate-x-[105%]"}`}>
          <div className="sticky top-2">
            <div className="mb-3 flex items-center gap-1.5">
              <span className="text-base font-bold text-slate-800">สรุปเป้ายอด</span>
              <button type="button" onClick={() => { setLocked(!locked); if (locked) setSideOpen(true); }} title={locked ? "ปลดล็อก (แผงกลับมาลอยทับ)" : "ล็อกแผงไว้ (ดันการ์ดให้แคบลง ไม่บัง)"}
                className={`ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border ${locked ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><Icon name={locked ? "lock" : "unlock"} /></button>
              <button type="button" onClick={() => { setSideOpen(false); setLocked(false); }} aria-label="ปิดแผงสรุปเป้า" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="cancel" /></button>
            </div>
            <div className="mb-3 flex gap-1">
              {PERIODS.map((p) => <button key={p.k} type="button" onClick={() => setPeriod(p.k)} className={`h-7 flex-1 rounded-full border text-[12px] ${period === p.k ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{p.label}</button>)}
            </div>
            <div className="text-[12px] text-slate-500">ยอดที่ต้องการ (มูลค่าขาย · ใช้ร่วมกันทั้งทีม)</div>
            <div className="mt-1 flex gap-1.5">
              <MoneyInput value={targetDraft} onChange={setTargetDraft} onKeyDown={(e) => { if (e.key === "Enter") void saveTarget(); }}
                placeholder="เช่น 3,000,000" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums" />
              {(() => {
                const dirty = (Number(targetDraft) || 0) !== (target[period] ?? 0);
                return <button type="button" onClick={() => void saveTarget()} disabled={!dirty || savingTarget}
                  className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium ${dirty ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-emerald-50 text-emerald-700"}`}>
                  <Icon name={dirty ? "save" : "done"} /> {savingTarget ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}</button>;
              })()}
            </div>
            <div className="mt-4 text-[12px] text-slate-500">จ่ายงานแล้ว{PERIODS.find((p) => p.k === period)?.label}</div>
            <div className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-3xl font-extrabold tabular-nums text-transparent">฿{fmt(got)}</div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
            <div className="mt-1 text-[12px] text-slate-500">{goal > 0 ? `${pct.toFixed(0)}% ของเป้า ฿${fmt(goal)}` : "ยังไม่ได้ตั้งเป้า"}</div>
            <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-[13px]">
              <div className="flex justify-between"><span className="text-slate-500">ขาดอีก</span><b className={`tabular-nums ${goal > got ? "text-rose-600" : "text-emerald-600"}`}>{goal > 0 ? (goal > got ? `฿${fmt(goal - got)}` : "ถึงเป้าแล้ว") : "—"}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">ค่าแรงของงานที่จ่าย</span><b className="tabular-nums text-slate-800">฿{fmt(done?.labor ?? 0)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">จ่ายไป</span><span className="tabular-nums text-slate-700">{fmt(done?.count ?? 0)} ใบ · {fmt(done?.qty ?? 0)} ชิ้น</span></div>
              {chosen.length > 0 && <div className="flex justify-between"><span className="text-slate-500">ถ้าจ่ายที่ติ๊กเพิ่ม</span><b className="tabular-nums text-emerald-600">+฿{fmt(chosenValue)}{goal > 0 ? ` → ${Math.min(100, ((got + chosenValue) / goal) * 100).toFixed(0)}%` : ""}</b></div>}
              {(done?.labor_missing ?? 0) > 0 && <div className="text-[11px] text-amber-600">มี {done?.labor_missing} ใบที่ยังไม่ใส่ค่าแรง — ยอดค่าแรงยังต่ำกว่าจริง</div>}
              {(done?.no_price ?? 0) > 0 && <div className="text-[11px] text-amber-600">มี {done?.no_price} ใบที่สินค้ายังไม่ตั้งราคาขาย — ไม่ถูกนับในยอด</div>}
              {(done?.no_date ?? 0) > 0 && <div className="text-[11px] text-slate-400">{done?.no_date} ใบไม่ได้ระบุวันจ่าย — นับตามวันที่บันทึกใบ</div>}
            </div>
          </div>
        </aside>
      )}

      {td.ghost}

      {/* จัดการโต๊ะ (แผงกลางเดิม) */}
      <ERPModal open={manageDesk !== null} onClose={() => setManageDesk(null)} size="md" title={`จัดการโต๊ะ: ${manageDesk?.name ?? ""}`} description="ย้ายคนเข้า/ออก · สร้างโต๊ะใหม่ · เปลี่ยนชื่อ · ปิดโต๊ะ (ต้องมีสิทธิ์บุคคล)">
        {manageDesk && renderDeskManager?.(manageDesk)}
      </ERPModal>
    </div>
  );
}
