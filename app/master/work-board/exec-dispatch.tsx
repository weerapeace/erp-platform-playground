"use client";

/**
 * บอร์ดจ่ายงาน — มุมมอง "จ่ายงาน (โหมดผู้บริหาร)" (เจ้าของขอ 2026-11-04 · แทนมุมมองแคนวาสที่เอาออก)
 *   ข้างบน = งานรอจ่ายเต็มหน้า (การ์ดใหญ่ · ปรับขนาดการ์ดได้ จำต่อคน) · ราคาขาย/มูลค่า เฉพาะผู้บริหาร (ดึงจาก /api/mo/exec-plan ที่ล็อกสิทธิ์ไว้)
 *   ข้างล่าง = แถบโต๊ะติดขอบจอ (ชื่อโต๊ะ + งานในมือ 2 ใบแรก) · ชี้ = เด้งขึ้น · กด = แผงรายละเอียดเลื่อนขึ้น
 *   จ่าย = ลากการ์ดลงโต๊ะ (ติ๊กหลายใบ ลากใบเดียวก็ไปทั้งชุด) หรือกดโต๊ะ → "จ่ายให้โต๊ะนี้" → ป๊อปจ่ายงานเดิมของบอร์ด (ทีละใบ)
 */
import { useEffect, useMemo, useState } from "react";
import { HoverImage } from "@/components/hover-image";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";

export type ExecMo = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; remaining: number; due_date: string | null; internal_due_date?: string | null;
  image_url: string | null; ready: boolean; priority?: number; priority_note?: string | null;
};
export type ExecWo = {
  id: string; wo_no: string; mo_no: string; product_sku: string | null; department_id: string | null;
  assignee_name: string | null; qty: number; received_qty: number; status: string; image_url?: string | null;
};
type Desk = { id: string; name: string };
type Person = { id: string; name: string; nickname?: string | null; department_id?: string | null };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const dueTh = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");
const SIZE_MIN = 120, SIZE_MAX = 240;
const parseSize = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= SIZE_MIN && n <= SIZE_MAX ? n : null; };

export function ExecDispatchView({ pending, workOrders, desks, craftsmen, canDispatch, showPrice, onDispatch, onOpenMO, onOpenWO }: {
  pending: ExecMo[];
  workOrders: ExecWo[];
  desks: Desk[];
  craftsmen: Person[];
  canDispatch: boolean;
  /** ผู้บริหาร = เห็นราคาขาย/มูลค่า */
  showPrice: boolean;
  /** เปิดป๊อปจ่ายงานเดิมของบอร์ด (ทีละใบตามลำดับ) */
  onDispatch: (mos: ExecMo[], desk: Desk) => void;
  onOpenMO: (mo: ExecMo) => void;
  onOpenWO: (woId: string) => void;
}) {
  const [size, setSize] = useUserPref<number>("wb_exec_card_size", 160, parseSize);
  const [q, setQ] = useState("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openDesk, setOpenDesk] = useState<string | null>(null);
  const [overDesk, setOverDesk] = useState<string | null>(null);
  const [price, setPrice] = useState<Map<string, number>>(new Map());

  // ราคาขาย/ชิ้น (skus_v2.list_price) — API แผนผู้บริหารล็อกสิทธิ์ admin.users ไว้แล้ว
  useEffect(() => {
    if (!showPrice) return;
    let cancel = false;
    apiFetch("/api/mo/exec-plan").then((r) => r.json()).then((j) => {
      if (cancel) return;
      setPrice(new Map(((j.rows ?? []) as { mo_no: string; list_price: number }[]).map((r) => [r.mo_no, Number(r.list_price) || 0])));
    }).catch(() => { /* ไม่มีราคา = ไม่โชว์ */ });
    return () => { cancel = true; };
  }, [showPrice]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return pending.filter((m) => m.remaining > 0 && (!readyOnly || m.ready)
      && (!s || `${m.mo_no} ${m.product_sku ?? ""} ${m.product_name ?? ""}`.toLowerCase().includes(s)))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (a.internal_due_date ?? a.due_date ?? "9999").localeCompare(b.internal_due_date ?? b.due_date ?? "9999"));
  }, [pending, q, readyOnly]);
  const valueOf = (m: ExecMo) => (price.get(m.mo_no) ?? 0) * m.remaining;
  const total = list.reduce((a, m) => a + valueOf(m), 0);
  const chosen = list.filter((m) => sel.has(m.id));
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const openWos = useMemo(() => workOrders.filter((w) => w.status !== "done" && w.status !== "cancelled"), [workOrders]);
  const wosOf = (deskId: string) => openWos.filter((w) => w.department_id === deskId);
  const give = (desk: Desk, ids: string[]) => {
    const mos = list.filter((m) => ids.includes(m.id));
    if (!mos.length || !canDispatch) return;
    onDispatch(mos, desk);
    setSel((p) => { const n = new Set(p); for (const m of mos) n.delete(m.id); return n; });   // หลุดเฉพาะใบที่ส่งไปจ่าย (ลากใบที่ไม่ได้ติ๊ก = ที่ติ๊กไว้ยังอยู่)
  };
  const deskOpen = desks.find((d) => d.id === openDesk) ?? null;

  return (
    <div className="relative flex min-h-[calc(100vh-180px)] flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-slate-800">งานรอจ่าย</span>
        <span className="text-sm text-slate-500">{list.length} ใบ{showPrice && total > 0 ? ` · มูลค่า ฿${fmt(total)}` : ""}</span>
        {showPrice && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">เห็นราคาขาย (ผู้บริหาร)</span>}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัสสินค้า / ชื่อ / เลขใบ" className="ml-auto h-8 w-56 rounded-lg border border-slate-200 px-2 text-sm" />
        <button type="button" onClick={() => setReadyOnly((v) => !v)} className={`h-8 rounded-full border px-3 text-[12px] ${readyOnly ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>พร้อมจ่ายเท่านั้น</button>
        <label className="inline-flex items-center gap-2 text-[12px] text-slate-500">ขนาดการ์ด
          <input type="range" min={SIZE_MIN} max={SIZE_MAX} step={10} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-28" />
        </label>
      </div>

      {chosen.length > 0 && (
        <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-1.5 text-sm text-violet-800">
          เลือก <b>{chosen.length}</b> ใบ{showPrice ? ` · ฿${fmt(chosen.reduce((a, m) => a + valueOf(m), 0))}` : ""} — ลากการ์ดใบไหนก็ได้ลงโต๊ะด้านล่าง หรือกดโต๊ะแล้วกด &ldquo;จ่ายให้โต๊ะนี้&rdquo;
          <button type="button" onClick={() => setSel(new Set())} className="ml-2 text-[12px] text-violet-600 underline">ล้างที่เลือก</button>
        </div>
      )}

      {!list.length ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-sm text-slate-400">{q || readyOnly ? "ไม่พบงานตามที่ค้น" : "ไม่มีงานรอจ่าย"}</div>
      ) : (
        <div className="grid flex-1 content-start gap-2.5 pb-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
          {list.map((m) => {
            const on = sel.has(m.id), p = price.get(m.mo_no) ?? 0;
            return (
              <div key={m.id} draggable={canDispatch}
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "move"; }}
                onClick={() => toggle(m.id)}
                className={`group relative cursor-pointer select-none rounded-xl border bg-white p-2 transition-shadow hover:shadow-md ${on ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200"}`}>
                <input type="checkbox" checked={on} readOnly className="absolute left-2 top-2 z-10 h-4 w-4 accent-violet-600" aria-label={`เลือก ${m.product_sku ?? m.mo_no}`} />
                {(m.priority ?? 0) > 0 && <span title={m.priority_note ?? undefined} className={`absolute right-2 top-2 z-10 rounded px-1.5 text-[11px] font-semibold ${m.priority === 2 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{m.priority === 2 ? "เร่งด่วน" : "สำคัญ"}</span>}
                <div className="mb-1.5 flex items-center justify-center overflow-hidden rounded-lg bg-slate-50" style={{ height: Math.round(size * 0.55) }}>
                  {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-contain" draggable={false} /> : <Icon name="image" />}
                </div>
                <div className="truncate font-mono text-[13px] font-semibold text-slate-800">{m.product_sku ?? m.mo_no}</div>
                <div className="truncate text-[11px] text-slate-400">{m.product_name ?? ""}</div>
                <div className="mt-0.5 text-[12px] text-slate-600">จ่าย <b className="text-slate-800">{fmt(m.remaining)}</b>{m.remaining !== m.qty ? ` / ${fmt(m.qty)}` : ""} ชิ้น{showPrice && p > 0 ? ` · ฿${fmt(p)}` : ""}</div>
                {showPrice && p > 0 && <div className="text-sm font-bold tabular-nums text-violet-700">฿{fmt(p * m.remaining)}</div>}
                <div className="mt-0.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">ส่ง {dueTh(m.internal_due_date ?? m.due_date)}</span>
                  <span className={m.ready ? "font-medium text-emerald-600" : "text-amber-600"}>{m.ready ? "พร้อม" : "ยังไม่พร้อม"}</span>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpenMO(m); }} title="ดูรายละเอียด / เช็กลิสต์"
                  className="absolute bottom-1.5 right-1.5 hidden h-6 w-6 items-center justify-center rounded-md bg-white/90 text-slate-500 shadow-sm hover:text-violet-700 group-hover:flex"><Icon name="open" /></button>
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
            const qty = ws.reduce((a, w) => a + Math.max(0, w.qty - (w.received_qty || 0)), 0);
            return (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-slate-800">{deskOpen.name}</span>
                  <span className="text-sm text-slate-500">{ppl.length} คน · {ws.length} ใบ · ค้าง {fmt(qty)} ชิ้น</span>
                  <div className="flex-1" />
                  {canDispatch && <button type="button" disabled={!chosen.length} onClick={() => give(deskOpen, chosen.map((m) => m.id))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">
                    <Icon name="truck" /> จ่ายให้โต๊ะนี้{chosen.length ? ` (${chosen.length} ใบ)` : ""}</button>}
                  <button type="button" onClick={() => setOpenDesk(null)} aria-label="ปิดแผง" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="back" /></button>
                </div>
                <div className="mb-2 text-[12px] text-slate-500">คน: {ppl.length ? ppl.map((p) => p.nickname?.trim() || p.name).join(", ") : "— ไม่มีคนประจำ (เลือกคนอื่นได้ในป๊อปจ่ายงาน) —"}</div>
                <div className="grid max-h-[38vh] gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {ws.map((w) => (
                    <button key={w.id} type="button" onClick={() => onOpenWO(w.id)} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5 text-left hover:border-violet-200 hover:bg-violet-50/50">
                      <HoverImage url={w.image_url ?? null} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[12px] font-semibold text-slate-800">{w.product_sku ?? w.mo_no}</div>
                        <div className="truncate text-[11px] text-slate-400">{w.wo_no}{w.assignee_name ? ` · ${w.assignee_name}` : ""}</div>
                      </div>
                      <span className="text-[12px] tabular-nums text-slate-600">{fmt(w.received_qty || 0)}/{fmt(w.qty)}</span>
                    </button>
                  ))}
                  {!ws.length && <div className="text-sm text-slate-400">ยังไม่มีงานในโต๊ะนี้</div>}
                </div>
              </div>
            );
          })()}
        </div>
        <div className="flex items-end justify-center gap-2 overflow-x-auto rounded-t-xl border border-slate-200 bg-white/95 px-3 pb-2.5 pt-4 backdrop-blur">
          {desks.map((d) => {
            const ws = wosOf(d.id), lifted = overDesk === d.id, on = openDesk === d.id;
            return (
              <button key={d.id} type="button" onClick={() => setOpenDesk(on ? null : d.id)}
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
  );
}
